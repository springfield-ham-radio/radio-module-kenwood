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

These are the first radio-wide settings. Bytes outside the fields below are not part of the map. `0x38C` is volatile radio state and is intentionally unmapped. `0x1002`, the byte between TX Inhibit and the time-out timer, is also unmapped.

| Menu | Offset | Storage |
| --- | --- | --- |
| 610 D-STAR My Callsign | `0x2B1` | 8 ASCII, space-padded |
| 610 callsign memo | `0x2B9` | 4 ASCII. Edited text is space-padded. A clone image stored NUL at `0x2BC`; an unchanged write keeps that byte. The radio shows `CALL/MEMO` |
| 110 TX Inhibit | `0x1001` | `0` Off, `1` On |
| 111 Time-Out Timer | `0x1003` | index `0..9` = 0.5–5.0 min in 0.5 min steps, `0x0A` = 10 min. Clone images confirm `0x09` = 5 min and `0x0A` = 10 min |
| 112 Mic Sensitivity | `0x1006` | `0x01` Medium, `0x02` Low. `0x00` High is inferred from the manual order and was not measured |
| 120 SSB High Cut | `0x1008` | `0x01` 2.4 kHz, `0x02` 2.6 kHz, `0x04` 3.0 kHz confirmed. Manual list is 2.2 / 2.4 / 2.6 / 2.8 / 3.0 kHz, and the confirmed bytes are 0.2 kHz steps, so `0x00` 2.2 kHz and `0x03` 2.8 kHz are inferred |
| 130 Scan Resume (analog) | `0x100C` | `0` Time, `1` Carrier, `2` Seek |
| 170 CW Pitch | `0x1024` | `0x04` 800 Hz, `0x06` 1000 Hz confirmed (100 Hz per step). Manual range is 400–1000 Hz, so `0x00` 400 Hz and the other 100 Hz steps are inferred |
| 202 Recall Method | `0x1030` | `0` All Bands, `1` Current Band |
| 311 TX Monitor | `0x1032` | `1` On, `0` Off |
| 900 Backlight Control | `0x1060` | `0` Manual, `1` On, `2` Auto, `3` Auto (DC-IN). Manual menu order is Auto / Auto (DC-IN) / Manual / On; only `0` and `3` were measured |
| 902 LCD Brightness | `0x1062` | `0x00` Low, `0x01` Medium confirmed. Manual order is High / Medium / Low, so High is not mapped. TODO: confirm High's byte |
| 914 Beep | `0x1071` | `0` Off, `1` On |
| 920 Battery Saver | `0x1076` | index `0..9` = Off, 0.2, 0.4, 0.6, 0.8, 1.0, 2.0, 3.0, 4.0, 5.0 s |
| 921 Auto Power Off | `0x1077` | `0` Off, `1` 15 min, `2` 30 min, `3` 60 min |
| 945 Cursor Shift | `0x107F` | `0x00` Off, `0x03` 2.0 s confirmed. Manual list is Off / 1.0 / 1.5 / 2.0 s, so `0x01` 1.0 s and `0x02` 1.5 s are inferred |
| 961 DTMF Keys Lock | `0x1085` | Off / On. `0` Off and `1` On are inferred from the other Off/On menus. TODO: confirm the polarity; the clone diff only fixed the address |
| 970 Speed/Distance | `0x1088` | `0x00` mi/h, `0x02` knots confirmed. `0x01` km/h is inferred. The manual's printed order depends on the region and does not match these bytes |
| 903 Power-on Message | `0x10C0` | 16 ASCII. Edited text is NUL-padded. A clone image stored trailing spaces (`0x20`) at `0x10CA`–`0x10CB`; an unchanged write keeps those bytes |
| 500 APRS My Callsign | `0x1200` | 6 ASCII, NUL-padded |
| 500 APRS SSID | `0x1206` | 3 ASCII, NUL-padded, literal suffix such as `-7` |

APRS SSID is text, not an enum. An enum would write the list index as one byte. The radio stores the characters of the suffix, hyphen included, so a 6-character callsign and a `-15` SSID still fit menu 500, which allows 9 characters. The 3-byte width is inferred from that limit; a two-digit SSID was not measured.

ASCII decode stops at NUL or `0xFF` and trims trailing spaces, then encode fills the rest with one pad byte. Clone images do not follow that. The power-on message at `0x10C0` can end with spaces (`0x20` at `0x10CA`–`0x10CB`) after a NUL, and the D-STAR memo at `0x2B9` can end with a NUL at `0x2BC`. Rewriting those bytes changes a settings image that was not edited. The codec keeps the stored bytes when the decoded text is unchanged. Edited text still uses the field's pad (`0x00` or space). This repo applies that behavior with a patch on `@springfield/ham-radio-utils` 4.16.0. HamBench has to ship the same codec change before a radio write preserves the padding.
