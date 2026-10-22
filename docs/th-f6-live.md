# Kenwood TH-F6 live CAT

Re-expressed from Kenwood handheld CAT behavior (TH-F6A). Not a copy of CHIRP source.

The TH-F6 does **not** clone EEPROM. Springfield’s memory map is a **logical** 32-byte × 400 channel image plus a small settings block so the generic memory-map codec can edit channels. Filling that image from the radio means issuing per-memory CAT commands. The config sets `capabilities.liveControl` and a Kenwood `cat` profile (`wakeCr`, `FQ`/`FO`, `MD`, H / L / EL) for the HamBench CAT page as well.

## Radio setup

- Menu **9** (**SP/MIC JACK**) must be **PC**. If it is set to microphone or another option, the radio will not answer CAT on the data jack.

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

Menu values are live `CMD` get/set. The logical settings block in `th-f6-settings.json` (addresses 12800–12927) mirrors those keys for the codec. The driver reads and writes them as CAT lines after the memory loop. A loaded marker at 12927 gates writes, so a zero-filled image is not pushed.

Scalar commands use `CMD` to read and `CMD <n>` to set. `CNT` is two digits. `MES` is up to 8 characters. `NAR <band>` reads FM narrow for band 0 (2 m), 1 (1.25 m), or 2 (70 cm); the set form is `NAR <band>,<0|1>`. `MGL` is a space plus eight characters: position n is the digit n when memory group n is linked, otherwise a space.

Commands: `APO`, `BAT`, `SV`, `BAL`, `MNF`, `SCR`, `ATT`, `ARO`, `VOX`, `CNT`, `MES`, `BEP`, `TXS`, `ELK`, `MRM`, `VXB`, `VXG`, `VXD`, `NAR`, `MGL`, `TSP`, `TXH`, `PT`, `DLK`, `CKEY`, `TH`, `NSFT`, `ANT`, `LAN`, `DATP`.

Not on this form: menu 4 (programmable VFO), menu 6 (offset), menu 9 (SP/MIC jack), menu 10 (DTMF memories), menu 31 (reset), and live operating state (squelch, lamp, lock, band, busy, dual, tone alert, fine step, auto simplex).
