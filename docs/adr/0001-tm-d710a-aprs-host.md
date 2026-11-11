# TM-D710A APRS host procedure lives in the module config

**Status:** accepted
**Date:** 2026-11-09
**Related:** HamBench [ADR 0016](https://github.com/springfield-ham-radio/ham-radio-ui/blob/9b24bc65de51ddd411166045ffda43550e020076/docs/adr/0016-aprs-driver-profile.md)

## Context

HamBench reads `capabilities.aprsReceive` and `aprs.host` from the installed module JSON. When `aprsReceive` is true, it does not inject the TM-D710 compatibility sequence. `@springfield/ham-radio-utils` `radio-protocol-schema.json` (package 4.19.0) does not list `aprs` or `capabilities`, and the root object does not set `additionalProperties: false`, so `SchemaValidator.validateRadioProtocol` accepts the block. `@springfield/ham-radio-registry` 2.1.0 `RadioCapabilities` still has no `aprsReceive` field. Hydration keeps unknown keys. Catalog metadata copies only the five existing capability flags, so the running app must keep reading the installed config.

This repository ships one TM-D710 config, `configs/kenwood-tm-d710a.json`. It does not ship G, GA, GE, or GS variants. TH-D74 and TH-F6 are not given this capability.

## Decision

- `kenwood-tm-d710a` sets `capabilities.aprsReceive` and an `aprs` block with `mode: monitor` and `aprs.host`.
- The host bytes are interrupt `[3, 3, 3]`, prompt `cmd:`, error `?EH`, command wait 5000 ms, and `listenMs` 3000. Connect listens for that window. Command text runs `KISS ON\r` and then `RESTART\r`, each after a fresh prompt. Silence sends the interrupt once. If it is still silent, Connect sends `kissExit` `[192, 255, 192]` once and waits for the prompt. That frame is the KISS specification return-from-KISS sequence. The Kenwood manuals have not verified it on the TM-D710. Connect does not transmit RF: no beacon, `HB`, `RESET`, `XFLOW`, or `KISS OFF`.
- Flow choices stay software, off, and hardware. The default stays software. Hardware is the choice when the TNC already shows `XFLOW OFF`. The driver uses RTS/CTS. The block does not force RTS low. `serialConfig` remains the body PC port and stays `rtscts: false`.
- Menu numbers in the text are the tested A radio: menu 528 COM baud, menu 529 PACKET data band B for 144.390 on the host path, menu 604 OUTPUT for the passive monitor only.
- Recovery text records the A/E power-cycle sentence and the G `RESTART` sentence. It does not say those editions prove an alternating toggle. It records the 11 Nov 2026 observation that KISS did not persist across an overnight power-off: the TNC came up in command mode and replied `KISS was OFF`. `kissExit` is not described as a manual-verified exit.
- TH-D74 and TH-F6 omit `aprsReceive` and `aprs`.

## Consequences

- An install of this config makes HamBench use these bytes and this copy. The model-id fallback in HamBench applies only while an installed D710 module omits `capabilities.aprsReceive`.
- Retire that fallback by deleting the injection after installed D710 configs set the flag. A module that sets the flag and omits `host` stays passive-only, so this config includes `host`.
- A later registry type can document `aprsReceive` and `aprs`. That type is not required for Install from file.
- `src/shared/schemas/aprs-receive-v1.json` checks the block in this repo. It is not a `$ref` from the radio config, so it is not part of the per-radio zip.
