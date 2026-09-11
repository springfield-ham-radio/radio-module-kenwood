# Kenwood TH-D74 clone protocol

Re-expressed from observed Kenwood MCP-D74 / clone-mode behavior. Not a copy of CHIRP source.

## Serial

- Default menu baud 9600 8N1 (9600, 19200, 38400, or 57600)
- Hardware RTS/CTS on macOS USB CDC
- After `0M PROGRAM`, both sides switch to **57600** for the dump

## Session

1. Optional `ID\r` → `ID TH-D74\r` (baud detection)
2. `0M PROGRAM\r` → `0M\r`
3. Set 57600; discard one inbound byte
4. For block `i` in `0 .. 1956` (image `0x7A300` / 256):
   - Read: `R` + `u16be(i)` + `u16be(0)` → `W` + `u16be(i)` + `u16be(0)` + 256 bytes → send `0x06`, expect `0x06`
   - Write: `W` + `u16be(i)` + `u16be(0 if size==256 else size)` + payload → `0x06`
5. Write skips the last two blocks (`0x7A100`–`0x7A2FF`)
6. `E` leaves programming mode

## Image layout (radio addresses)

| Region | Address | Notes |
| --- | --- | --- |
| Flags | `0x2000` | 1200 × 4 bytes: used, lockout, group |
| Memories | `0x4000` | 192 groups × (6 × 40-byte records + 16 pad) = 256-byte clone blocks |
| Names | `0x10000` | 1200 × 16 ASCII |
| Group names | `0x14800` | names[1152..] — 30 groups |

Memory `n` is at group `n / 6`, slot `n % 6`. Occupied flag `used`: `0xFF` empty, `0` below 150 MHz, `1` below 400 MHz, `2` otherwise.

This module maps regular memories **0–999**.
