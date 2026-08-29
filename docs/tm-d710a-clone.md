# Kenwood TM-D710A clone protocol

Re-expressed from observed Kenwood MCP-2A / clone-mode behavior. Not a copy of CHIRP source.

The TM-D710G uses a different clone image and channel record. This module is the **TM-D710 / TM-D710A** (CAT ID `TM-D710`), not the G.

## Serial

- PC port on the **TX/RX body**, not the head Com port
- 9600 8N1 (menu PC baud). No mid-session baud switch
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
| Channel flags | `0x0E00` | 1030 × 2 bytes (`band`, `skip`); this module maps 0–999 |
| Memories | `0x1700` | 1030 × 16-byte records (0–999 + scan/WX); call channels follow at `0x5760` |
| Names | `0x5800` | 1020 × 8 ASCII, pad `0xFF` |
| Power-on message | `0x02E0` | 8 ASCII in PM group 0 |
| Hole | `0x7F00–0x7FFF` | Not cloned |
| Tail | `0xFEF0`, `0xFF00` | MCP comment / trailing image |

Empty memory: first frequency byte `0xFF` (`ul32` `0xFFFFFFFF`). Occupied `band` codes: `0` (118 MHz), `5` (144), `6` (200), `7` (300), `8` (400), `9` (800). Scan skip is a boolean in the flags byte.

Tone flags live in the high nibble of the duplex byte: bit 2 = encode CTCSS, bit 1 = TSQL, bit 0 = DTCS. Kenwood CTCSS list omits 159.8, 165.5, 171.3, 177.3, 183.5, 189.9, 196.6, and 199.5 Hz.

This module maps regular memories **0–999**.
