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
   - Read: `R` + `u16be(i)` + `u16be(0)` → `W` + `u16be(i)` + `u16be(0)` + 256 bytes → host sends `0x06` (radio does not echo `0x06` back)
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
