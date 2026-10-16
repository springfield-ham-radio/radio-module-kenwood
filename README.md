# radio-module-kenwood

JSON radio module for Kenwood TH-F6, TH-D74, and TM-D710A.

| Model | Memory | Live CAT |
| --- | --- | --- |
| TH-F6 | Live CAT (`MR` / `MW` / `MNA`) | Yes (`wakeCr`, `FQ`/`FO`) |
| TH-D74 | Clone (256-byte blocks at 57600) | Yes (same PC port) |
| TM-D710A | Clone (256-byte blocks at 9600, body PC port) | Yes (`FO` VFO channel) |

Install from HamBench (**Preferences → Radios**). Each radio is a separate JSON zip on GitHub Releases (`radio-module-<modelId>-<driver version>.zip`), not an npm runtime dependency of the app.

Docs: [Install radios](https://springfield-ham-radio.github.io/ham-radio-docs/guide/install-radios.html) · [Live CAT](https://springfield-ham-radio.github.io/ham-radio-docs/guide/cat.html) · [Protocol DSL](https://springfield-ham-radio.github.io/ham-radio-docs/developer/protocols/dsl.html)

Model notes: [docs/th-f6-live.md](docs/th-f6-live.md), [docs/th-d74-clone.md](docs/th-d74-clone.md), [docs/tm-d710a-clone.md](docs/tm-d710a-clone.md).

```bash
yarn pack:release --all
yarn pack:beta kenwood-th-d74
```

`pack:beta <modelId> [n]` builds one handoff zip under `dist-release/` with packed version `<config.version>-beta.<n>` (default `n` is `1`). It does not change tracked configs, write catalog entries, or remove other zips in `dist-release/`. See [Build a beta driver](https://springfield-ham-radio.github.io/ham-radio-docs/developer/beta-driver.html) ([ADR 0010](https://springfield-ham-radio.github.io/ham-radio-docs/developer/adr/0010-local-beta-driver-zips.html)).

`pack:release` writes one zip per `configs/*.json` plus `dist-release/catalog-entries.json` (schema version 3). The release job omits `--all` and uploads a zip only when that radio's driver `version` is newer than an existing `radio-module-<modelId>-<version>.zip`. Retired manufacturer assets such as `radio-module-kenwood-1.11.6.zip` do not count, so the first per-radio release uploads every radio. `downloadUrl` uses the semantic-release tag (`v<repo version>`); the zip name and catalog `version` use the config semver ([ADR 0009](https://springfield-ham-radio.github.io/ham-radio-docs/developer/adr/0009-per-radio-modules.html)).

Each config sets `minApiVersion` (currently `18.0.1`). The repo `package.json` name stays `@springfield/radio-module-kenwood`.

## License

MIT — Copyright (c) 2026 Bryan Hunt. See [LICENSE](LICENSE).
