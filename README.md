# radio-module-kenwood

A radio module for Kenwood TH-F6, TH-D74, and TM-D710A ham radios, compatible with the HamBench registry.

Layouts and wire protocols were reverse-engineered from public Kenwood CAT/clone behavior (the same information CHIRP documents) and re-expressed as JSON. This package does not include CHIRP source.

## Supported radios

| Model | Programming style | Config |
| --- | --- | --- |
| **TH-F6** / TH-F6A | Live CAT (`MR` / `MW` / `MNA`) | `configs/kenwood-th-f6.json` |
| **TH-D74** | Clone mode (`0M PROGRAM`, 256-byte `R`/`W` blocks at 57600 baud) | `configs/kenwood-th-d74.json` |
| **TM-D710A** | Clone mode (`0M PROGRAM`, 256-byte `R`/`W` blocks at 9600 baud) | `configs/kenwood-tm-d710a.json` |

## Features

- **TH-D74 clone I/O**: enter programming mode, switch to 57600 baud, read/write 256-byte blocks, skip the last two blocks on write
- **TH-D74 memory map**: 1000 channels in 6-per-256-byte groups, parallel flags (skip/group), 16-character names, D-STAR fields
- **TH-F6 logical image**: 400 × 32-byte channel records plus radio-wide settings for codec round-trips
- **TM-D710A clone I/O**: identify as `TM-D710`, enter programming, read/write 256-byte blocks (skip radio block `0x7F`), plus 16- and 144-byte tail packets
- **TM-D710A memory map**: 1000 channels as 16-byte records, parallel band/skip flags, 8-character names
- **TH-F6 live CAT**: documented in [docs/th-f6-live.md](docs/th-f6-live.md). Handshake is `ID` then `AI 0`; memories are read and written with `catRead` / `catWrite` (`MR` / `MW` / `MNA`) rather than a clone dump

## Installation

### Desktop app

Install from **Preferences → Radios** once this module is listed in the official catalog. The app downloads the JSON-only zip from GitHub Releases.

### Release zip

Each GitHub Release attaches `radio-module-kenwood-<version>.zip` (configs + shared schemas/memory maps). Build it locally with:

```bash
yarn pack:release
```

Update the official `radio-module-catalog` with the printed `sha256:…` integrity after release.

## Module structure

```
radio-module-kenwood/
├── configs/
│   ├── kenwood-th-d74.json
│   ├── kenwood-th-f6.json
│   └── kenwood-tm-d710a.json
├── src/shared/
│   ├── schemas/
│   └── memory-maps/
│       ├── th-d74-settings.json
│       ├── th-f6-settings.json
│       └── tm-d710a-settings.json
└── docs/
    ├── th-d74-clone.md
    ├── th-f6-live.md
    └── tm-d710a-clone.md
```

Encode/decode uses `MemoryMapRadioCodec` from `@springfield/ham-radio-utils`. This package ships **JSON only**.

## Protocol notes

### TH-D74

- Start at 9600 8N1 with RTS/CTS (`rtscts: true`; required on macOS)
- `0M PROGRAM\r` → `0M\r`
- Switch to 57600 baud, discard one sync byte
- Each 256-byte block: `R` + 16-bit big-endian **block index** + `0x0000`
- Reply: `W` + block + `0x0000` + 256 bytes, then ACK `0x06`/`0x06`
- Write uses `W` + block + `0x0000` + data, expects `0x06`
- Image size `0x7A300` (500992 bytes). Write skips the last two blocks
- End with `E`

`$block` is `floor(byteAddress / 256)`, not the byte address.

### TM-D710A

- 9600 8N1 on the **body PC port** (not the head). No baud switch. Hardware flow control **off**
- `ID\r` → `ID TM-D710\r`
- `0M PROGRAM\r` → `0M\r`
- Each block: `R`/`W` + 16-bit big-endian **byte address** + 1-byte size (`0` means 256)
- Skip radio block `0x7F`. Tail packets at `0xFEF0` (16 bytes) and `0xFF00` (144 bytes)
- End with `E`

Details: [docs/tm-d710a-clone.md](docs/tm-d710a-clone.md). This is not the TM-D710G image.

### TH-F6

Live radios do not dump EEPROM. The memory map is a logical image the codec uses for channel editing. Import/export issues `ID`, `AI 0`, then per-memory `MR`/`MW`/`MNA` via `catRead`/`catWrite`. Details: [docs/th-f6-live.md](docs/th-f6-live.md). Hardware flow control is **off**.

## Development

```bash
yarn install
yarn test:unit
yarn test:integration
```

Regenerate memory maps after layout edits:

```bash
node scripts/generate-memory-maps.mjs
```

## License

MIT License
