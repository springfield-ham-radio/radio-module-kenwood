# Kenwood TM-D710A clone protocol

Re-expressed from observed Kenwood MCP-2A / clone-mode behavior. Not a copy of CHIRP source.

The TM-D710G uses a different clone image and channel record. This module is the **TM-D710 / TM-D710A** (CAT ID `TM-D710`), not the G.

Outside clone mode, the same body **PC** port speaks Kenwood CAT. The config sets `capabilities.liveControl` and a `cat` block (`protocol: kenwood`, `vfoChannel`, `FO`, High/Medium/Low) so HamBench can drive VFOs without model-specific code.

## Serial

- PC port on the **TX/RX body**, not the head Com port
- 9600 8N1 (menu PC baud; 9600, 19200, 38400, or 57600). No mid-session baud switch
- Hardware flow control **off**
- Clone block timeout should be at least 1 s at 9600 baud

## Session

1. `ID\r` → `ID TM-D710\r`
2. `0M PROGRAM\r` → `0M\r`
3. For each 256-byte radio address `A` in `0x0000–0x7EFF` and `0x8000–0x9BFF` (skip **block `0x7F`**):
   - Read: `R` + `u16be(A)` + `u8(size)` → `W` + `u16be(A)` + `u8(size)` + payload → send `0x06`, expect `0x06`
   - Write: `W` + `u16be(A)` + `u8(size)` + payload → `0x06`
   - `size` is `0` for a 256-byte block (256 does not fit in one byte)
4. Extra short packets: address `0xFEF0` size `0x10` (16 bytes), then `0xFF00` size `0x90` (144 bytes)
5. `E` leaves programming mode

`$address` is the **byte** address, not a TH-D74-style `$block` index. `$chunkSize` as one byte is `0` for 256-byte blocks.

## Image layout (radio addresses)

| Region | Address | Notes |
| --- | --- | --- |
| Channel flags | `0x0E00` | 1032 × 2 bytes (`band`, `skip`) for MR, scan/WX, and call |
| Memories | `0x1700` | 1032 × 16-byte records: 0–999 MR, 1000–1019 scan edges, 1020–1029 WX, 1030–1031 call (`0x5760`) |
| Names | `0x5800` | 1032 × 8 ASCII, pad `0xFF` (WX names start at `0x77E0`) |
| Radio-wide (`block1`) | `0x0015` | Answerback, current PM, panel lock, 10 MHz mode, mic gain, repeater mode/hold/ID, PC baud, password |
| DTMF memories | `0x0030` / `0x00D0` | 10 × 16-character codes and 10 × 8-character names |
| Repeater ID | `0x0170` | 12 ASCII |
| PM groups 0–5 | `0x0200` | Six × 512-byte profiles. Settings tab shows all six (label `1` = PM0). VFOs at `0x0240`, programmable limits at `0x0300`, power-on at `0x02E0` |
| PM names | `0x7DA0` | 5 × 16 ASCII (PM 1–5, MCP) |
| PM list names | `0xFF00` | 5 × 16 ASCII in the tail packet (`PM 1`–`PM 5` on a stock radio) |
| MCP comment | `0x7DF0` | 32 ASCII |
| APRS | `0x8100` | My callsign / SSID, status text, message group, comment |
| Sky Command | `0x8660` | Commander / transporter call signs and CTCSS |
| Hole | `0x7F00–0x7FFF` | Not cloned |
| Tail | `0xFEF0`, `0xFF00` | Trailing image |

Empty memory: first frequency byte `0xFF` (`ul32` `0xFFFFFFFF`). Occupied `band` codes: `0` (118 MHz), `5` (144), `6` (200), `7` (300), `8` (400), `9` (800). Scan skip is a boolean in the flags byte.

Tone flags live in the high nibble of the duplex byte: bit 2 = encode CTCSS, bit 1 = TSQL, bit 0 = DTCS. Kenwood CTCSS list omits 159.8, 165.5, 171.3, 177.3, 183.5, 189.9, 196.6, and 199.5 Hz.

This module maps memories **0–1031** (regular 0–999, scan 1000–1019, weather 1020–1029, call 1030–1031). Radio-wide settings, **PM0–PM5**, PM0 VFOs and band limits, APRS callsign/status/message-group, and tail PM names appear on the Settings tab. Unmapped remainder is padding, unknown flags, and APRS list buffers.
