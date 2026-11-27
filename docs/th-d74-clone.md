# Kenwood TH-D74 clone protocol

Re-expressed from observed Kenwood MCP-D74 / clone-mode behavior. Not a copy of CHIRP source.

Outside clone mode, the PC port speaks Kenwood CAT. The config sets `capabilities.liveControl` and a band-indexed Kenwood `cat` profile (`FQ` with band prefix, `BC`, `MD`, `PC`, `VM`, two VFOs). That profile was measured on a TH-D74 at firmware 1.05 (`ID TH-D74`, bare `FQ`/`MD`/`PC` return `?`).

HamBench live CAT does **not** yet use the new `bandIndexed`, `bandModes`, `vfoModeCommand`, and `vfoModes` keys. **ham-radio-ui** needs matching session support in a separate PR before band-aware frequency, mode, power, and VFO/memory state work end-to-end. Older HamBench builds ignore unknown `cat` keys, so installing this driver is safe before the UI lands. Clone read/write is unaffected.

## Radio setup

- Menu **980** = **COM** + **AF/IF Output** (clone/CAT on the USB CDC port). Power-cycle the radio after changing this menu.
- Turn **KISS** off before clone or CAT: press **F**, then **LIST**, and disable KISS if it is on. The radio ignores PC commands while KISS is on.

## APRS and Packet (KISS)

Same micro-USB port as clone and CAT. HamBench reads `capabilities.aprsReceive` and the `aprs` block from the installed driver ([ADR 0002](adr/0002-th-d74-aprs-kiss.md); HamBench [ADR 0025](https://github.com/springfield-ham-radio/ham-radio-ui/pull/241)).

- Menu **980** = COM + AF/IF Output (not Mass Storage).
- Menu **983** PC Input/Output (KISS) = USB. The KISS chapter in manual B5A-1253-00 says “Menu 903”; on the radio the menu is **983**.
- Menu **506** Data Band = the band tuned to 144.390 (A or B). Menu **505** Data Speed = **1200** for on-air APRS (not the USB baud; KISS uses 9600 on USB).
- Menu **580** Raw Packets output produced no bytes in passive testing (25 Nov 2026). There is no monitor-only path; use KISS ON on the front panel ([F], then [LIST] until KISS ON).
- Connect writes nothing. Disconnect sends KISS exit `C0 FF C0` once (manual-verified on TH-D74A/E). DTR and RTS stay asserted with flow control off for KISS.

## Serial

- Default menu baud **9600 8N1** (9600, 19200, 38400, or 57600)
- Hardware **RTS/CTS** on (macOS USB CDC)
- **DTR** and **RTS** asserted (`serialConfig.dtr` / `serialConfig.rts`: true)
- After `0M PROGRAM`, the host switches to **57600** for the block transfer. There is **no** inbound sync byte on a TH-D74; send `R` immediately after the baud change.

## Session

1. `\r\r` → `?\r?\r` (wake; the config consumes this reply before `ID`)
2. `ID\r` → `ID TH-D74\r`
3. `0M PROGRAM\r` → `0M\r` (often 0.5–1 s; config timeout 3 s)
4. Set host baud to 57600 (no extra byte to discard)
5. For block index `i` in **0 .. 1954** (1955 blocks; image size `0x7A300` = 500480 bytes, end address **500479**):
   - Read: `R` + `u16be(i)` + `u16be(0)` → `W` + `u16be(i)` + `u16be(0)` + 256 bytes → host sends `0x06` and **waits for the radio’s `0x06` ack** (about 50 ms timeout) before sending the next `R`. The radio’s ack is sometimes **late**; when it arrives after that wait, it appears as a leading `0x06` on the **next** block’s `W` reply (`06 W …`). The driver config sets `read.ready` to `0x06` so that byte is consumed before the next frame (pipelined ack, same pattern as UV-5R clone).
   - Write: `W` + `u16be(i)` + `u16be(0 if size==256 else size)` + payload → radio replies `0x06`
6. Write skips blocks **1953** and **1954** (addresses `0x7A100`–`0x7A2FF`, inclusive byte range 499968–500479), matching CHIRP upload defaults.
7. `E` leaves programming mode (no reply)

## Image layout (radio addresses)

| Region | Address | Notes |
| --- | --- | --- |
| Flags | `0x2000` | Clone image region is larger; this map binds **1101** flag slots (indices **0–1100**) |
| Memories | `0x4000` | Clone image region is larger; **1101** channel records in the usual 6-per-256-byte group layout |
| Names | `0x10000` | Clone image region is larger; **1101** × 16-byte name slots for indices **0–1100** |
| Group names | `0x14800` | names[1152..] — 30 groups |

Memory `n` is at group `n / 6`, slot `n % 6`. Occupied flag `used`: `0xFF` empty, `0` below 150 MHz, `1` below 400 MHz, `2` otherwise.

This module maps regular memories **0–999** plus **101 special channel slots** at indices **1000–1100**. Index **1101** and above (WX weather channels in CHIRP) are **not** mapped.

### Special channels (indices 1000–1100)

Scan-edge memories and the priority (Pri) channel use the same 40-byte record, 4-byte flags, and 16-byte name layout as programmed memories 0–999. HamBench labels them via `channelBindings.specials` (`start: 1000`, labels `L0`, `U0`, … `L49`, `U49`, `Pri`). See [ham-radio-docs ADR 0013](https://github.com/springfield-ham-radio/ham-radio-docs/blob/main/docs/developer/adr/0013-memory-map-special-channels.md).

| Label | Index | Record | Flags | Name |
| --- | --- | --- | --- | --- |
| L0 / U0 (scan-edge pair 0) | 1000 / 1001 | `0xE6A0` / `0xE6C8` | `0x2FA0` / `0x2FA4` | `0x13E80` / `0x13E90` |
| … | … | +40 B per slot | +4 B | +16 B |
| L49 / U49 | 1098 / 1099 | (same 6-per-256 group layout as memories 0–999) | | |
| Pri | 1100 | `0xF750` | `0x3130` | `0x144C0` |

Memory `n` is still at group `n / 6`, slot `n % 6` within the 256-byte block. Bytes `0xE6F0`–`0xE6FF` (pad after U0 in the first special group) stay unmapped. WX (`EXTD_NUMBERS` 1101+) begins after Pri and is not included in this driver.

Installing this driver requires HamBench with bundled `@springfield/ham-radio-api` **≥ 18.6.0** (`minApiVersion`). The labeled **Special channels** section in the channels UI needs a HamBench build that includes [ADR 0030](https://github.com/springfield-ham-radio/ham-radio-ui/pull/259) ([UI PR 259](https://github.com/springfield-ham-radio/ham-radio-ui/pull/259)); an app that only satisfies the API floor can load the map without that section until that UI lands.

## Menu settings (absolute image offsets)

These are the first radio-wide settings. Bytes outside the fields below are not part of the map. `0x038C` is a read/change counter: it advances on every clone read (TH-D74A diffs Nov 23–24, 2026 saw `0x06` → `0x10` → `0x23`) and on menu edits, so it stays unmapped. The driver config `capture.ignore` lists `0x038C` for HamBench's menu-capture wizard so diffs skip that byte. The operating-state region `0x0300`–`0x03FF` stays unmapped. Menu 103 FM Narrow does not persist across restart or clone read; it appears only live in Band A operating state at `0x0309`, so it is not mapped here. Menu 104 is not mapped because the radio does not persist it. The byte at `0x1010` stays unmapped (it held `0x01` in the Nov 27, 2026 Priority Scan menu capture and is not this menu).

Each settings field has `section`, `sectionOrder`, and `subgroup`. `section` is the radio's top-level menu category (`TX/RX`, `Memory`, `Audio File`, `APRS`, `Digital`, `Configuration`). `sectionOrder` is that category's hundred (1 for the 100s, 5 for APRS, 9 for Configuration). `subgroup` is the id of the radio group inside that category (`rx`, `beacon-tx`, `display`). The declared `groups` array uses the same ids, with `label` set to the name the radio shows (`RX`, `Beacon TX Control`, `Display`) and nested groups listed in menu order. The table below still shows the full `Category - Group` path. Memory group names have no menu number and no subgroup. Their section is `Memory` with order 2, so they sit at the top of that page. APRS My Callsign is menu 500 (verified on the radio, October 31, 2026).

| Menu | Section | Offset | Storage |
| --- | --- | --- | --- |
| 610 D-STAR My Callsign | Digital - TX/RX | `0x2B1` | 8 ASCII, space-padded |
| 610 callsign memo | Digital - TX/RX | `0x2B9` | 4 ASCII. Edited text is space-padded. A clone image stored NUL at `0x2BC`; an unchanged write keeps that byte. The radio shows `CALL/MEMO` |
| 101 Beat Shift | TX/RX - RX | `0x1000` | index `0..7` = Type 1 through Type 8 |
| 102 Detect Out Select | TX/RX - RX | `0x1002` | `0` Off (AF), `1` IF, `2` Detect. `0` and `2` measured; `1` follows manual order. IF and Detect are only selectable and functional in Single Band mode with Band B as the operating band |
| 105 WX Alert | TX/RX - RX | `0x1007` | `0` Off, `1` On. TH-D74A only (USA/Canada). Measured on hardware |
| 110 TX Inhibit | TX/RX - TX | `0x1001` | `0` Off, `1` On. Read+write confirmed on hardware (Nov 23, 2026) |
| 111 Time-Out Timer | TX/RX - TX | `0x1003` | index `0..9` = 0.5–5.0 min in 0.5 min steps, `0x0A` = 10 min. Clone images confirm `0x09` = 5 min and `0x0A` = 10 min |
| 112 Mic Sensitivity | TX/RX - TX | `0x1006` | `0x00` High, `0x01` Medium, `0x02` Low |
| 120 SSB High Cut | TX/RX - RX Filter | `0x1008` | `0x00` 2.2 kHz, `0x01` 2.4 kHz, `0x02` 2.6 kHz, `0x03` 2.8 kHz, `0x04` 3.0 kHz |
| 121 CW Width | TX/RX - RX Filter | `0x1009` | `0x00` 0.3 kHz, `0x01` 0.5 kHz, `0x02` 1.0 kHz, `0x03` 1.5 kHz, `0x04` 2.0 kHz |
| 122 AM High Cut | TX/RX - RX Filter | `0x100A` | `0x00` 3.0 kHz, `0x01` 4.5 kHz, `0x02` 6.0 kHz, `0x03` 7.5 kHz |
| 130 Scan Resume (analog) | TX/RX - Scan | `0x100C` | `0` Time, `1` Carrier, `2` Seek |
| 131 Resume (Digital) | TX/RX - Scan | `0x100D` | `0` Time, `1` Carrier, `2` Seek |
| 132 Time Restart | TX/RX - Scan | `0x100E` | Raw seconds, 1–10 |
| 133 Carrier Restart | TX/RX - Scan | `0x100F` | Raw seconds, 1–10 |
| 134 Priority Scan | TX/RX - Scan | `0x1011` | `0` Off, `1` On. Measured on K5FAR's TH-D74A (Nov 27, 2026): `0x00` → `0x01`. Restore verified. The radio only allows On when Pri holds a Band B RX frequency (manual p. 9-4); not selectable in Single band A, with FM radio mode (Menu 700) On, or with WX alert (Menu 105) On |
| 135 Scan Auto Backlight | TX/RX - Scan | `0x1012` | `0` Off, `1` On |
| 136 Auto Weather Scan | TX/RX - Scan | `0x1013` | `0` Off, `1` 15 min, `2` 30 min, `3` 60 min. TH-D74A only (USA/Canada). Hardware read diff on K5FAR's TH-D74A (Nov 23, 2026): `0x00` → `0x02` when set from Off to 30 min. Manual p. 24-1 matches the radio; the p. 6-2 menu table erroneously lists Off/On |
| 141 Auto Offset | TX/RX - Repeater | `0x1018` | `0` Off, `1` On. Measured by switching the menu from On to Off |
| 142 CALL Key | TX/RX - Repeater | `0x1019` | `0` CALL, `1` 1750 Hz |
| 143 1750Hz TX Hold | TX/RX - Repeater | `0x101A` | `0` Off, `1` On |
| 150 VOX | TX/RX - VOX | `0x101B` | `0` Off, `1` On |
| 151 VOX Gain | TX/RX - VOX | `0x101C` | Raw level, 0–9 |
| 152 VOX Delay | TX/RX - VOX | `0x101D` | index `0..6` = 250, 500, 750, 1000, 1500, 2000, 3000 ms |
| 153 TX on Busy | TX/RX - VOX | `0x101E` | `0` Off, `1` On |
| 160 DTMF Encode Speed | TX/RX - DTMF | `0x101F` | `0` 50 ms, `1` 100 ms, `2` 150 ms |
| 161 Pause Time | TX/RX - DTMF | `0x1020` | index `0..6` = 100, 250, 500, 750, 1000, 1500, 2000 ms |
| 162 DTMF TX Hold | TX/RX - DTMF | `0x1021` | `0` Off, `1` On |
| 163 DTMF Memory | TX/RX - DTMF | `0x0040` / `0x0100` | 10 channels 0–9. Codes at `0x0040`–`0x00DF`, 10 × 16-byte ASCII NUL-padded (0–9, A–D, `*`, `#`, space pause). Names at `0x0100`–`0x019F`, 10 × 16-byte ASCII NUL-padded. Empty is all `0x00`. `0x00E0`–`0x00FF` is `0xFF` filler and is not mapped. Channel 0 verified (code `123`, name `TEST`). Channels 1–9 use the 16-byte stride inferred from the block |
| 164 EchoLink Memory | TX/RX - DTMF | `0x0200` / `0x0250` | 10 channels 0–9. Codes at `0x0200`–`0x024F`, 8-byte ASCII NUL-padded. Names at `0x0250`–`0x029F`, 8-byte ASCII NUL-padded. Empty is all `0x00`. `0x01A0`–`0x01FF` and `0x02A0`–`0x02B0` are not mapped (`0x01EA` holds a clone framing byte in test images). Channel 0 verified (code `999999`, name `HBEL164`). Channels 1–9 use the 8-byte stride inferred from the block |
| 170 CW Pitch | TX/RX - CW | `0x1024` | `0x01` 500 Hz, `0x04` 800 Hz, and `0x06` 1000 Hz measured. That confirms 100 Hz steps from 400 Hz (`0x00`). The remaining steps follow that confirmed pattern |
| 171 CW Reverse | TX/RX - CW | `0x1026` | `0` Normal, `1` Reverse |
| 180 QSO Log | TX/RX - Others | `0x1027` | `0` Off, `1` On |
| 181 LED Control | TX/RX - Others | `0x1028` | Bitfield. Bit 0 (0x01) RX, bit 1 (0x02) FM Radio. Measured on K5FAR's TH-D74A (Nov 24, 2026): `0x01` default (RX on), `0x03` both on, `0x02` FM Radio only. Bits 2–7 unknown; left unchanged on write |
| 202 Recall Method | Memory - Memory Channel | `0x1030` | `0` All Bands, `1` Current Band |
| 311 TX Monitor | Audio File - Voice Message | `0x1032` | `1` On, `0` Off |
| 900 Backlight Control | Configuration - Display | `0x1060` | `0` Manual, `1` On, `2` Auto, `3` Auto (DC-IN). Manual menu order is Auto / Auto (DC-IN) / Manual / On; only `0` and `3` were measured |
| 902 LCD Brightness | Configuration - Display | `0x1062` | `0x00` Low, `0x01` Medium, `0x02` High |
| 914 Beep | Configuration - Audio | `0x1071` | `0` Off, `1` On |
| 920 Battery Saver | Configuration - Battery | `0x1076` | index `0..9` = Off, 0.2, 0.4, 0.6, 0.8, 1.0, 2.0, 3.0, 4.0, 5.0 s |
| 921 Auto Power Off | Configuration - Battery | `0x1077` | `0` Off, `1` 15 min, `2` 30 min, `3` 60 min |
| 945 Cursor Shift | Configuration - Auxiliary | `0x107F` | `0x00` Off, `0x01` 1.0 s, `0x02` 1.5 s, `0x03` 2.0 s |
| 961 DTMF Keys Lock | Configuration - Lock | `0x1085` | `0` Off, `1` On |
| 970 Speed/Distance | Configuration - Units | `0x1088` | `0x00` mi/h, `0x01` km/h, `0x02` knots. The manual's printed order depends on the region and does not match these bytes |
| 903 Power-on Message | Configuration - Display | `0x10C0` | 16 ASCII. Edited text is NUL-padded. A clone image stored trailing spaces (`0x20`) at `0x10CA`–`0x10CB`; an unchanged write keeps those bytes |
| 500 APRS My Callsign | APRS - Basic Settings | `0x1200` | 6 ASCII, NUL-padded |
| 500 APRS SSID | APRS - Basic Settings | `0x1206` | 3 ASCII, NUL-padded, literal suffix such as `-7` |
| 501 Icon | APRS - Basic Settings | `0x1367` | 2 ASCII, table character then symbol code. The choice list shows the manual icon name. Radio is `\Y` and RV is `/R`. A code that is not in the list is left unchanged |
| 502 Position Comment | APRS - Basic Settings | `0x1222` | `2` In Service and `4` Committed were measured. The rest follow the manual list. See below |
| 503 Status Text | APRS - Basic Settings | `0x122F` | In-use slot, then five text records. `0` Text 1 and `1` Text 2 were measured. See below |
| 504 Packet Path | APRS - Basic Settings | `0x1375` | In-use path, then New-N, Relay, Region, and three Others paths. `0` New-N and `2` Region were measured. See below |
| 505 Data Speed | APRS - Basic Settings | `0x120C` | `0` 1200 bps, `1` 9600 bps |
| 506 Data Band | APRS - Basic Settings | `0x120B` | `0` Band A, `1` Band B |
| 507 DCD Sense | APRS - Basic Settings | `0x120D` | `0` Busy, `1` Detect Data, `2` Off |
| 508 TX Delay | APRS - Basic Settings | `0x120F` | index `0..7` = 100, 150, 200, 300, 400, 500, 750, 1000 ms. Measured 200 ms = 2 and 500 ms = 5 |
| 509 APRS Lock | APRS - Basic Settings | `0x120A` | Frequency `0x01`, PTT `0x02`, APRS Key `0x04`. Bits 3–7 stay as they were. See the bit table below |
| 510 Method | APRS - Beacon TX Control | `0x136A` | `0` Manual, `1` PTT. The manual also lists Auto and SmartBeaconing; `2` and `3` follow that order and were not measured |
| 511 Initial Interval | APRS - Beacon TX Control | `0x136B` | index `0..9` = 0.2, 0.5, 1, 2, 3, 5, 10, 20, 30, 60 min. Measured 1 min = 2 and 10 min = 6 |
| 512 Decay Algorithm | APRS - Beacon TX Control | `0x136C` | `0` Off, `1` On |
| 513 Prop. Pathing | APRS - Beacon TX Control | `0x136D` | `0` Off, `1` On |
| 514 Speed | APRS - Beacon TX Control | `0x1220` | `0` Off, `1` On. Includes speed in the beacon |
| 515 Altitude | APRS - Beacon TX Control | `0x1221` | `0` Off, `1` On. Includes altitude in the beacon |
| 516 Object | APRS - Beacon TX Control | `0x1900` | Three 64-byte records at `0x1900`, `0x1940`, and `0x1980`. Same layout in each. `0x19C0` is not mapped. See below |
| 520 QSY Info. in Status | APRS - QSY Information | `0x1361` | `0` Off, `1` On. Measured by switching the menu from Off to On |
| 521 Tone/Narrow | APRS - QSY Information | `0x1362` | `0` Off, `1` On. Measured by switching the menu from Off to On |
| 522 Shift/Offset | APRS - QSY Information | `0x1363` | `0` Off, `1` On |
| 523 QSY Limit Distance | APRS - QSY Information | `0x1364` | Tens of miles. `0` Off, `246` = 2460 mi. Manual steps Off, then 10 through 2500 |
| 530 Low Speed | APRS - SmartBeaconing | `0x136E` | Raw speed, manual range 2–30 (default 5). The unit is mile/h, km/h, or knots from Menu 970. Baseline `0x05` matches the default. This byte was not measured |
| 530 High Speed | APRS - SmartBeaconing | `0x136F` | Raw speed, manual range 2–90 (default 70). Same unit as Low Speed. Baseline `0x46` matches the default. This byte was not measured |
| 531 Slow Rate | APRS - SmartBeaconing | `0x1370` | Raw minutes, manual range 1–100 (default 30) |
| 532 Fast Rate | APRS - SmartBeaconing | `0x1371` | Raw seconds, manual range 10–180 (default 120). Measured on K5FAR's TH-D74A (Nov 27, 2026): `0x78` (120) changed to `0x6E` (110) |
| 533 Turn Angle | APRS - SmartBeaconing | `0x1372` | Raw degrees, manual range 5–90 (default 28). Measured on K5FAR's TH-D74A (Nov 27, 2026): `0x1C` (28) changed to `0x28` (40) |
| 534 Turn Slope | APRS - SmartBeaconing | `0x1373` | Raw count, manual range 1–255 in units of 10 degrees per speed unit (default 26). Baseline `0x1A` matches the default. This byte was not measured |
| 535 Turn Time | APRS - SmartBeaconing | `0x1374` | Raw seconds, manual range 5–180 (default 60). Baseline `0x3C` matches the default. This byte was not measured |
| 540 Waypoint Format | APRS - Waypoint | `0x1213` | `0` NMEA, `1` MAGELLAN, `2` KENWOOD. `0` and `2` were measured; `1` follows the manual order |
| 550 Position Limit | APRS - Packet Filter | `0x1365` | Tens of miles. `0` Off, `248` = 2480 mi. Manual steps Off, then 10 through 2500 |
| 551 Filter Type | APRS - Packet Filter | `0x1366` | Seven checkboxes in bits 0–6. All on is `0x7F`. Bit 7 is unused. See the bit table below |
| 585 Bulletin Group Code | APRS - Others | `0x183B` | 35 ASCII, NUL-padded. Empty is 35 zero bytes. Up to 6 codes of 5 characters, separated by commas |

`0x120E`, the byte between DCD Sense (`0x120D`) and TX Delay (`0x120F`), stays unmapped.

Pri priority memory is not mapped in this module. For a possible follow-up, the special index 1100 record sits at `0xF750`, its flags at `0x3130`, and its name at `0x144C0` (outside regular memories 0–999).

Menu 502 Position Comment is one byte at `0x1222`. `2` In Service and `4` Committed were measured. The other values follow the manual list and were not measured on their own: `0` Off Duty, `1` Enroute, `3` Returning, `5` Special, `6` Priority, `7` through `13` Custom 0 through Custom 6, and `14` Emergency.

Menu 503 Status Text is the in-use slot at `0x122F` plus five records. `0` is Text 1 and `1` is Text 2, both measured. `2` Text 3, `3` Text 4, and `4` Text 5 follow that order and were not measured. Each record's text is 42 ASCII, zero-padded. Text 1 starts at `0x1230`, Text 2 at `0x1260`, Text 3 at `0x1290`, Text 4 at `0x12C0`, and Text 5 at `0x1300`. Text 5 skips the `0x12F0` row, which is `0xFF` filler and is not mapped. Measured Text 2 is ABCD at `0x1260`. Measured Text 5 is TEST5 at `0x1300`. TX Rate is the byte at the text start plus `0x2A` (`0x125A`, `0x128A`, `0x12BA`, `0x12EA`, `0x132A`): `0` Off, and `1` through `8` are 1/1 through 1/8. `2` is 1/2 and `4` is 1/4, both measured. The other steps follow that order. Each record is its own struct. Every text and TX Rate field sets `ui.record` to `{id: "aprs-status-text", index, label: "Status Text N"}`. Display order inside a tab is Text, then TX Rate. Bytes after each TX Rate byte stay unmapped. `0x038C` stays unmapped.

Menu 504 Packet Path is the in-use type at `0x1375` plus the fields for each path. `0` is New-N and `2` is Region, both measured. `1` Relay, `3` Others1, `4` Others2, and `5` Others3 follow the manual order and were not measured. New-N WIDE1-1 is `0x1376`: `1` On and `0` Off, both measured. New-N Total Hops is `0x1377`, the hop count 0 through 7. `2` and `3` were measured. Relay RELAY is `0x1378` and the byte is inverted: `0` is On and `1` is Off, both measured. Relay Total Hops is `0x1379`, 0 through 7. `2` and `5` were measured. Region ABBR is 5 ASCII at `0x137A`, zero-padded. Measured TSTRG is stored there. Region Total Hops is `0x137F`, 0 through 7. `2` and `6` were measured. Others1 path is 79 ASCII at `0x1380`, through `0x13CE`, zero-padded. Measured TSTP1 is stored there. Others2 path is at `0x13CF` and Others3 path is at `0x1400`. The manual allows 79 characters. The measured images are zero through `0x13EB` and `0x141C`, then `0xFF` filler (`0x13EC` and `0x141D`). Others2 and Others3 are mapped as 29 bytes, only that zero region. A 79-character path for Others2 or Others3 was not measured, and those fields do not extend into the filler. Each path is its own struct. Every field except the in-use type sets `ui.record` to `{id: "aprs-packet-path", index, label}` with labels New-N, Relay, Region, Others1, Others2, and Others3. The in-use type stays outside the tabs. `0x038C` stays unmapped.

Menu 516 Object is three records of 64 bytes. Object 1 is at `0x1900`. Object 2 is at `0x1940` and object 3 is at `0x1980`. Those two offsets come from the same stride in a hardware dump: the records match, and objects 2 and 3 hold the factory pattern. Object 1 was verified by a clone diff. Offsets below are relative to each record. Latitude is degrees at `+0x00`, whole minutes at `+0x01`, and fractional minutes at `+0x02`–`+0x03`. Longitude is degrees at `+0x04`, whole minutes at `+0x05`, and fractional minutes at `+0x06`–`+0x07`. Each fraction is a little-endian uint16 in units of 1/10000 minute. Measured object 1 latitude 30° 12.34' is `1E 0C 48 0D` (`0x0D48` = 3400). Measured longitude 97° 45.67' is `61 2D 2C 1A` (`0x1A2C` = 6700). The hemisphere byte is at `+0x08`, between the longitude fraction and the name. See the bit table below. The name is 9 ASCII at `+0x09`, NUL-padded. Empty is 9 zero bytes. Type at `+0x12` is `0` Live Object and `1` Killed Object, both measured. `2` Live Item and `3` Killed Item follow the manual order and were not measured. Method at `+0x13` is `0` Off and `1` Temp., both measured. `2` Auto (15 min), `3` Auto (30 min), and `4` Auto (60 min) follow the manual order and were not measured. The icon is 2 ASCII at `+0x14`, table character then symbol code, the same list as menu 501. Measured `/E` is Eyeball and `\S` is Satellite. The comment is 42 ASCII at `+0x16`, through `+0x3F`, NUL-padded. Empty is 42 zero bytes. Objects 2 and 3 in the dump are all-zero position, N/W hemispheres (`0x0B` at `+0x08`), empty name, type Live Object, method Temp., icon `/E`, and an empty comment. Each object is its own struct at that address, with the same field order. Every field sets `ui.record` to `{id: "aprs-object", index, label: "Object N"}`. The six position fields and the two hemisphere selects also set `ui.composite` (`objN-lat` / `objN-lon`, kind `coordinate`, fraction scale 10000). Display order inside an object is Name, Type, Method, latitude, longitude, Icon, Comment.

Menu 516 object `+0x08` bits. Object 1 was measured on Nov 22, 2026 by diffing clone reads while changing hemispheres. Objects 2 and 3 use the same layout at `+0x08`. Bits `0x03` and `0xF0` were not measured on their own and stay as they were.

| Mask | Hemisphere |
| --- | --- |
| `0x04` | Latitude (0 = N, 1 = S) |
| `0x08` | Longitude (0 = E, 1 = W) |
| `0x03` | Unknown. Left unchanged |
| `0xF0` | Unknown. Left unchanged |

Measured samples on object 1: `0x0B` is N/W, `0x0F` is S/W, and `0x07` is S/E. `0x19C0`, the byte after object 3, stays unmapped.

#### HamBench coordinate row

EEPROM field order stays position bytes, then `+0x08`, then name and the rest. HamBench tab order follows `ui.order`: Name, Type, Method, then latitude and longitude coordinates, then Icon and Comment (menu 516).

The driver maps hemispheres on `latitudeHemisphere` and `longitudeHemisphere` with `ui.composite.part: "hemisphere"` on `objN-lat` / `objN-lon`. **ham-radio-ui** (as of Nov 2026) only folds `degrees`, `minutes`, and `fraction` into one row (`app/utils/settings-coordinate.ts`). Parts whose `part` is not in that set are left as separate fields, so N/S and E/W show as full-width selects until UI support lands.

Required **ham-radio-ui** work (not this module):

1. Extend `SettingsCoordinatePart` / `PARTS` with `hemisphere`.
2. Teach `fieldComposite()` to accept `part: "hemisphere"`.
3. In `settings-layout.ts`, include hemisphere parts in `SettingsCoordinateCell.parts` so their paths are consumed and they do not render as plain fields.
4. In `SettingsFieldGrid.vue`, add a `USelect` after the minutes input (reuse `DmsCoordinateInput` hemisphere items: lat `N`/`S`, lon `E`/`W`), and wire `editCoordinate` / path updates for the hemisphere enum field (`widget: "select"`).

Until that ships, clone encode/decode and bit preservation in this driver are still correct; only the form layout is cluttered.

Menu 509 bits. Each checkbox was measured on its own. Bits 3–7 are left unchanged.

| Bit | Mask | Lock |
| --- | --- | --- |
| 0 | `0x01` | Frequency |
| 1 | `0x02` | PTT |
| 2 | `0x04` | APRS Key |
| 3–7 | `0xF8` | Unused. Left unchanged |

Menu 551 bits, from the manual list Weather, Digipeater, Mobile, Object, NAVITRA, 1-WAY, Others. Turning Mobile and 1-WAY off cleared `0x04` and `0x20`. That list order from bit 0 puts Mobile on `0x04` and 1-WAY on `0x20`. The other five masks follow the same order and were not measured on their own. Bit 7 stays as it was.

| Bit | Mask | Type | Source |
| --- | --- | --- | --- |
| 0 | `0x01` | Weather | Assumed |
| 1 | `0x02` | Digipeater | Assumed |
| 2 | `0x04` | Mobile | Measured pair, placed by list order |
| 3 | `0x08` | Object | Assumed |
| 4 | `0x10` | NAVITRA | Assumed |
| 5 | `0x20` | 1-WAY | Measured pair, placed by list order |
| 6 | `0x40` | Others | Assumed |
| 7 | `0x80` | Unused | Left unchanged. All seven filters on is `0x7F` |

The following menus are in the TH-D74A/E manual and are not mapped. No clone image in this repo shows which byte each one writes, and a neighboring address is not enough: an earlier public draft put the wrong string at `0x1200` and described `0x1088` as three unit bytes, while measured images show menu 970 alone at `0x1088` and APRS My Callsign at `0x1200`.

| Menu | Manual name | Manual choices | Why it is not mapped |
| --- | --- | --- | --- |
| 901 | Backlight Timer | 3–60 seconds, default 10 | The body text is a range, not the three printed samples. No measured image byte |
| 904 | Single Band Display | Off / GPS(Altitude) / GPS(GS) / Date | Stored order is unmeasured. Backlight and speed already disagree with the manual's printed order |
| 911 | TX/RX EQ | RX EQ, TX EQ (FM, NFM), TX EQ (DV), each on or off | This is not beep volume. Three checkboxes, no measured image byte |
| 915 | Beep Volume | Level 1 through Level 7, default Level 5 | Menu 915, not 911. No measured image byte |
| 971 | Altitude, Rain | feet, inch / m, mm | No measured image byte. Region text in the menu table is the default, not a one-value radio |
| 972 | Temperature | °F / °C | No measured image byte |
| 973 | Latitude, Longitude | dd°mm.mm' / dd°mm'ss.s" | No measured image byte |

APRS SSID is text, not an enum. An enum would write the list index as one byte. The radio stores the characters of the suffix, hyphen included, so a 6-character callsign and a `-15` SSID still fit menu 500, which allows 9 characters. The 3-byte width is inferred from that limit; a two-digit SSID was not measured.

ASCII decode stops at NUL or `0xFF` and trims trailing spaces, then encode fills the rest with one pad byte. Clone images do not follow that. The power-on message at `0x10C0` can end with spaces (`0x20` at `0x10CA`–`0x10CB`) after a NUL, and the D-STAR memo at `0x2B9` can end with a NUL at `0x2BC`. Rewriting those bytes changes a settings image that was not edited. The codec keeps the stored bytes when the decoded text is unchanged. Edited text still uses the field's pad (`0x00` or space). `@springfield/ham-radio-utils` 4.16.1 includes that codec behavior. HamBench has to use 4.16.1 or newer before a radio write preserves the padding.
