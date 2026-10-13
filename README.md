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
```

`pack:release` writes one zip per `configs/*.json` that needs a new release asset (driver `version` newer than any published `radio-module-<modelId>-*.zip`), plus `dist-release/catalog-entries.json` (schema version 3 catalog rows for those zips). Pass `--all` locally to build every radio. Release uses the semantic-release tag in `downloadUrl` while each zip and catalog `version` follow that radio's config semver ([ADR 0009](https://springfield-ham-radio.github.io/ham-radio-docs/developer/adr/0009-per-radio-modules.html)).

Each config sets `minApiVersion` (currently `18.0.1`). The repo `package.json` name stays `@springfield/radio-module-kenwood`.

## License

MIT — Copyright (c) 2026 Bryan Hunt. See [LICENSE](LICENSE).
