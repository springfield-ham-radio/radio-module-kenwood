# Kenwood TH-F6 live CAT

Re-expressed from Kenwood handheld CAT behavior (TH-F6A). Not a copy of CHIRP source.

The TH-F6 does **not** clone EEPROM. Springfield’s memory map is a **logical** 32-byte × 400 channel image plus a small settings block so the generic memory-map codec can edit channels. Filling that image from the radio means issuing per-memory CAT commands. The config sets `capabilities.liveControl` and a Kenwood `cat` profile (`wakeCr`, `FQ`/`FO`, `MD`, High/Medium/Low) for the HamBench CAT page as well.

## Serial

- 9600 8N1 (4800, 9600, 19200, 38400, 57600, or 115200 if `ID` fails)
- Hardware flow control **off**
- Commands are ASCII ended with `\r`
- After connect: wake CR, then `ID\r`, then `AI 0\r`. RTS is off (`serialConfig.rts: false`). Empty CR echoes are ignored.
- Replies are read until CR (`expect.until: 0x0D`). Line feeds are ignored.
- `readMemory` / `writeMemory` then run a `catRead` / `catWrite` loop over 400 channel indexes (`pack: kenwood-th-f6`). Each occupied memory is packed into the logical 32-byte record; empty replies (`N` / `?`) become `0xFF` slots.

## Memory commands

| Action | Command |
| --- | --- |
| Read memory `nnn` (0–399) | `MR 0,nnn` |
| Write memory `nnn` | `MW 0,nnn,<spec>` |
| Delete memory `nnn` | `MW 0,nnn` (empty spec) |
| Read name | `MNA nnn` |
| Write name (8 ASCII chars) | `MNA nnn,<name>` |
| Read split TX | `MR 1,nnn` |
| Write split TX | `MW 1,nnn,<offset>,0` |

`nnn` is three decimal digits. Errors: `N` or `?`.

## Memory spec fields (comma-separated after the header)

`freq(11 digits Hz)`, `step` (hex index into 5, 6.25, 8.33, 9, 10, 12.5, 15, 20, 25, 30, 50, 100 kHz), `duplex` (0 none, 1 +, 2 −, 3 split), `0`, tone, TSQL, DTCS flags, `rtone` index, `ctone` index, `dtcs` index, `offset` (9 digits Hz), `mode` (0 FM, 1 WFM, 2 AM, 3 LSB, 4 USB, 5 CW), `skip` (0/1).

Kenwood tone list is standard CTCSS minus 159.8, 165.5, 171.3, 177.3, 183.5, 189.9, 196.6, 199.5 Hz.

## Settings

Menu values are live `CMD` get/set (for example `APO`, `BAT`, `SV`, `BAL`, `MNF`, `SCR`, `ATT`, `ARO`, `VOX`, `CNT`, `MES`). The logical settings block in `th-f6-settings.json` mirrors those keys for the codec; applying them on the radio is per-command CAT, not a clone write.
