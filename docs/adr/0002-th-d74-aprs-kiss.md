# TH-D74 KISS APRS on the USB port

**Status:** accepted
**Date:** 2026-11-25
**Related:** HamBench [ADR 0025](https://github.com/springfield-ham-radio/ham-radio-ui/pull/241) (`aprs-kiss-only-host`), [ADR 0001](./0001-tm-d710a-aprs-host.md)

## Context

The TH-D74 exposes clone, CAT, and KISS on the same micro-USB CDC port. HamBench must read `capabilities.aprsReceive` and an `aprs` block from the installed module. The TM-D710A path uses `mode: monitor` with a command-mode host procedure. On the TH-D74, Menu 580 Raw Packets output produced no passive monitor bytes in testing on 25 Nov 2026 (macOS, USB CDC). With Menu 983 PC Input/Output (KISS) = USB and the front panel in KISS ON, valid KISS frames arrived with DTR and RTS asserted and no flow control.

Manual TH-D74A/E B5A-1253-00 documents KISS exit `C0 FF C0`, that PC commands are ignored during KISS, Menu 980 COM + AF/IF Output, Menu 505 data speed, Menu 506 data band, and Menu 508 TX delay. The KISS chapter names “Menu 903”; the radio menu is **983**.

## Decision

- `kenwood-th-d74` driver **1.28.0** sets `capabilities.aprsReceive` and `aprs` with `mode: kiss`, `baudRate` 9600, and `aprs.host.entry` `manual`.
- Connect writes nothing (`enter: []`). Disconnect sends `kissExit` `[192, 255, 192]` once. HamBench PR 241 applies `flowControl` `none` and `dtr` / `rts` `asserted` (parser accepts `asserted` | `low`).
- `serialConfig` stays the clone/CAT profile (`rtscts: true`, asserted DTR/RTS as booleans). KISS line state lives only under `aprs.host`.
- `minApiVersion` stays `18.3.0`. KISS is not a protocol-engine feature.
- `readMessage` and `writeMessage` warn the operator to turn KISS off before CAT or clone because the radio ignores PC commands while KISS is on.
- TH-F6 still omits `aprsReceive` and `aprs`.
- Older HamBench builds without ADR 0025 treat `mode: "kiss"` as unsupported and hide the APRS and Packet tabs; they do not throw. Clone and CAT are unaffected.

## Consequences

- APRS and Packet need ham-radio-ui with ADR 0025. Installing driver 1.28.0 on an older app is safe but shows no new tabs until the UI lands.
- KISS and clone share one port. Missed `kissExit` on Disconnect is recovered on the radio with `[F]`, `[LIST]`.
- `src/shared/schemas/aprs-receive-v1.json` uses `oneOf` for `monitor` and `kiss` host shapes so a module cannot mix TM-D710 command bytes with manual KISS entry.