# Kenwood TH-D74 clone protocol

Re-expressed from observed Kenwood MCP-D74 / clone-mode behavior. Not a copy of CHIRP source.

Outside clone mode, the PC port speaks Kenwood CAT. The config sets `capabilities.liveControl` and a Kenwood `cat` profile (`FQ`/`FO`, `MD`, two VFOs).

## Radio setup

- Menu **980** = **COM** + **AF/IF Output** (clone/CAT on the USB CDC port). Power-cycle the radio after changing this menu.
- Turn **KISS** off: press **F**, then **LIST**, and disable KISS if it is on.

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
| Flags | `0x2000` | 1200 × 4 bytes: used, lockout, group |
| Memories | `0x4000` | 192 groups × (6 × 40-byte records + 16 pad) = 256-byte clone blocks |
| Names | `0x10000` | 1200 × 16 ASCII |
| Group names | `0x14800` | names[1152..] — 30 groups |

Memory `n` is at group `n / 6`, slot `n % 6`. Occupied flag `used`: `0xFF` empty, `0` below 150 MHz, `1` below 400 MHz, `2` otherwise.

This module maps regular memories **0–999**.

## Menu settings (absolute image offsets)

These are the first radio-wide settings. Bytes outside the fields below are not part of the map. `0x38C` changes on every menu edit and looks like a change counter, so it stays unmapped. `0x1002`, the byte between TX Inhibit and the time-out timer, is also unmapped. Menu 104 is not mapped because the radio does not persist it.

Each settings field has an optional `section` string and `sectionOrder` number. `section` is the manual's top-level menu group for that hundred (the name the radio shows for the 100s, 200s, and so on). `sectionOrder` is that hundred's digit: TX/RX 1, Memory 2, Audio File 3, APRS 5, Digital 6, Configuration 9. HamBench groups controls under the section name, sorts those groups by `sectionOrder`, and does not show the menu number in the group heading. Memory group names are menu 201 and use section Memory with order 2. APRS My Callsign is menu 500 (verified on the radio, October 31, 2026).

| Menu | Section | Offset | Storage |
| --- | --- | --- | --- |
| 610 D-STAR My Callsign | Digital | `0x2B1` | 8 ASCII, space-padded |
| 610 callsign memo | Digital | `0x2B9` | 4 ASCII. Edited text is space-padded. A clone image stored NUL at `0x2BC`; an unchanged write keeps that byte. The radio shows `CALL/MEMO` |
| 101 Beat Shift | TX/RX | `0x1000` | index `0..7` = Type 1 through Type 8 |
| 110 TX Inhibit | TX/RX | `0x1001` | `0` Off, `1` On |
| 111 Time-Out Timer | TX/RX | `0x1003` | index `0..9` = 0.5–5.0 min in 0.5 min steps, `0x0A` = 10 min. Clone images confirm `0x09` = 5 min and `0x0A` = 10 min |
| 112 Mic Sensitivity | TX/RX | `0x1006` | `0x00` High, `0x01` Medium, `0x02` Low |
| 120 SSB High Cut | TX/RX | `0x1008` | `0x00` 2.2 kHz, `0x01` 2.4 kHz, `0x02` 2.6 kHz, `0x03` 2.8 kHz, `0x04` 3.0 kHz |
| 121 CW Width | TX/RX | `0x1009` | `0x00` 0.3 kHz, `0x01` 0.5 kHz, `0x02` 1.0 kHz, `0x03` 1.5 kHz, `0x04` 2.0 kHz |
| 122 AM High Cut | TX/RX | `0x100A` | `0x00` 3.0 kHz, `0x01` 4.5 kHz, `0x02` 6.0 kHz, `0x03` 7.5 kHz |
| 130 Scan Resume (analog) | TX/RX | `0x100C` | `0` Time, `1` Carrier, `2` Seek |
| 131 Resume (Digital) | TX/RX | `0x100D` | `0` Time, `1` Carrier, `2` Seek |
| 132 Time Restart | TX/RX | `0x100E` | Raw seconds, 1–10 |
| 133 Carrier Restart | TX/RX | `0x100F` | Raw seconds, 1–10 |
| 135 Scan Auto Backlight | TX/RX | `0x1012` | `0` Off, `1` On |
| 141 Auto Offset | TX/RX | `0x1018` | `0` Off, `1` On. Measured by switching the menu from On to Off |
| 142 CALL Key | TX/RX | `0x1019` | `0` CALL, `1` 1750 Hz |
| 143 1750Hz TX Hold | TX/RX | `0x101A` | `0` Off, `1` On |
| 150 VOX | TX/RX | `0x101B` | `0` Off, `1` On |
| 151 VOX Gain | TX/RX | `0x101C` | Raw level, 0–9 |
| 152 VOX Delay | TX/RX | `0x101D` | index `0..6` = 250, 500, 750, 1000, 1500, 2000, 3000 ms |
| 153 TX on Busy | TX/RX | `0x101E` | `0` Off, `1` On |
| 160 DTMF Encode Speed | TX/RX | `0x101F` | `0` 50 ms, `1` 100 ms, `2` 150 ms |
| 161 Pause Time | TX/RX | `0x1020` | index `0..6` = 100, 250, 500, 750, 1000, 1500, 2000 ms |
| 162 DTMF TX Hold | TX/RX | `0x1021` | `0` Off, `1` On |
| 170 CW Pitch | TX/RX | `0x1024` | `0x01` 500 Hz, `0x04` 800 Hz, and `0x06` 1000 Hz measured. That confirms 100 Hz steps from 400 Hz (`0x00`). The remaining steps follow that confirmed pattern |
| 171 CW Reverse | TX/RX | `0x1026` | `0` Normal, `1` Reverse |
| 180 QSO Log | TX/RX | `0x1027` | `0` Off, `1` On |
| 202 Recall Method | Memory | `0x1030` | `0` All Bands, `1` Current Band |
| 311 TX Monitor | Audio File | `0x1032` | `1` On, `0` Off |
| 900 Backlight Control | Configuration | `0x1060` | `0` Manual, `1` On, `2` Auto, `3` Auto (DC-IN). Manual menu order is Auto / Auto (DC-IN) / Manual / On; only `0` and `3` were measured |
| 902 LCD Brightness | Configuration | `0x1062` | `0x00` Low, `0x01` Medium, `0x02` High |
| 914 Beep | Configuration | `0x1071` | `0` Off, `1` On |
| 920 Battery Saver | Configuration | `0x1076` | index `0..9` = Off, 0.2, 0.4, 0.6, 0.8, 1.0, 2.0, 3.0, 4.0, 5.0 s |
| 921 Auto Power Off | Configuration | `0x1077` | `0` Off, `1` 15 min, `2` 30 min, `3` 60 min |
| 945 Cursor Shift | Configuration | `0x107F` | `0x00` Off, `0x01` 1.0 s, `0x02` 1.5 s, `0x03` 2.0 s |
| 961 DTMF Keys Lock | Configuration | `0x1085` | `0` Off, `1` On |
| 970 Speed/Distance | Configuration | `0x1088` | `0x00` mi/h, `0x01` km/h, `0x02` knots. The manual's printed order depends on the region and does not match these bytes |
| 903 Power-on Message | Configuration | `0x10C0` | 16 ASCII. Edited text is NUL-padded. A clone image stored trailing spaces (`0x20`) at `0x10CA`–`0x10CB`; an unchanged write keeps those bytes |
| 500 APRS My Callsign | APRS | `0x1200` | 6 ASCII, NUL-padded |
| 500 APRS SSID | APRS | `0x1206` | 3 ASCII, NUL-padded, literal suffix such as `-7` |
| 501 Icon | APRS | `0x1367` | 2 ASCII, table character then symbol code. The choice list shows the manual icon name. Radio is `\Y` and RV is `/R`. A code that is not in the list is left unchanged |
| 522 Shift/Offset | APRS | `0x1363` | `0` Off, `1` On |
| 523 QSY Limit Distance | APRS | `0x1364` | Tens of miles. `0` Off, `246` = 2460 mi. Manual steps Off, then 10 through 2500 |
| 531 Slow Rate | APRS | `0x1370` | Raw minutes, manual range 1–100 (default 30) |
| 540 Waypoint Format | APRS | `0x1213` | `0` NMEA, `1` MAGELLAN, `2` KENWOOD. `0` and `2` were measured; `1` follows the manual order |
| 550 Position Limit | APRS | `0x1365` | Tens of miles. `0` Off, `248` = 2480 mi. Manual steps Off, then 10 through 2500 |
| 551 Filter Type | APRS | `0x1366` | Seven checkboxes in bits 0–6. All on is `0x7F`. Bit 7 is unused. See the bit table below |
| 585 Bulletin Group Code | APRS | `0x183B` | 35 ASCII, NUL-padded. Empty is 35 zero bytes. Up to 6 codes of 5 characters, separated by commas |

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
