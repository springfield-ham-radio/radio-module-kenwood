# radio-module-kenwood

JSON radio module for Kenwood TH-F6, TH-D74, and TM-D710A.

| Model | Memory | Live CAT |
| --- | --- | --- |
| TH-F6 | Live CAT (`MR` / `MW` / `MNA`) | Yes (`wakeCr`, `FQ`/`FO`) |
| TH-D74 | Clone (256-byte blocks at 57600) | Yes (same PC port) |
| TM-D710A | Clone (256-byte blocks at 9600, body PC port) | Yes (`FO` VFO channel) |

Install from HamBench (**Preferences → Radios**). This package is a JSON zip on GitHub Releases, not an npm runtime dependency of the app.

Docs: [Install radios](https://springfield-ham-radio.github.io/ham-radio-docs/guide/install-radios.html) · [Live CAT](https://springfield-ham-radio.github.io/ham-radio-docs/guide/cat.html) · [Protocol DSL](https://springfield-ham-radio.github.io/ham-radio-docs/developer/protocols/dsl.html)

Model notes: [docs/th-f6-live.md](docs/th-f6-live.md), [docs/th-d74-clone.md](docs/th-d74-clone.md), [docs/tm-d710a-clone.md](docs/tm-d710a-clone.md).

```bash
yarn pack:release
```

`pack:release` writes the zip and `dist-release/catalog-module.json`. Each `configs/*.json` `version` stays that radio's driver version. The zip version comes from `package.json`.
