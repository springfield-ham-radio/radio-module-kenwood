## [2.2.0](https://github.com/springfield-ham-radio/radio-module-kenwood/compare/v2.1.0...v2.2.0) (2026-10-17)

### Features

* add read/write setup messages for TH-F6 and TH-D74 ([#25](https://github.com/springfield-ham-radio/radio-module-kenwood/issues/25)) ([6c988e2](https://github.com/springfield-ham-radio/radio-module-kenwood/commit/6c988e2670f1bfc5e7d32665d4aec4056f5ce33a)), closes [ham-radio-api#24](https://github.com/springfield-ham-radio/ham-radio-api/issues/24)

## [2.1.0](https://github.com/springfield-ham-radio/radio-module-kenwood/compare/v2.0.0...v2.1.0) (2026-10-16)

### Features

* add pack:beta for single-radio beta zips ([#24](https://github.com/springfield-ham-radio/radio-module-kenwood/issues/24)) ([608a689](https://github.com/springfield-ham-radio/radio-module-kenwood/commit/608a689a29ba9f49d8eb1920341336e36a8def9b))

## [2.0.0](https://github.com/springfield-ham-radio/radio-module-kenwood/compare/v1.11.6...v2.0.0) (2026-10-13)

### ⚠ BREAKING CHANGES

* releases publish radio-module-<modelId>-<version>.zip per radio instead of one manufacturer zip. Implements ADR 0009.

### Features

* publish one module zip per radio ([#23](https://github.com/springfield-ham-radio/radio-module-kenwood/issues/23)) ([cd7bce2](https://github.com/springfield-ham-radio/radio-module-kenwood/commit/cd7bce2cb594bed9ecf37b2111767f0689a9dd12))

## [1.11.6](https://github.com/springfield-ham-radio/radio-module-kenwood/compare/v1.11.5...v1.11.6) (2026-10-12)

### Bug Fixes

* **deps:** bump ip-address from 10.5.0 to 10.7.2 ([#9](https://github.com/springfield-ham-radio/radio-module-kenwood/issues/9)) ([b9c0572](https://github.com/springfield-ham-radio/radio-module-kenwood/commit/b9c0572044e63a81336dde44d51da01a7adfab2d))

## [1.11.5](https://github.com/springfield-ham-radio/radio-module-kenwood/compare/v1.11.4...v1.11.5) (2026-10-12)

### Bug Fixes

* **deps:** bump handlebars from 4.7.9 to 4.7.10 ([#17](https://github.com/springfield-ham-radio/radio-module-kenwood/issues/17)) ([c809612](https://github.com/springfield-ham-radio/radio-module-kenwood/commit/c8096127d55c4c4dc3c07d5636de74e065c76fc7))

## [1.11.4](https://github.com/springfield-ham-radio/radio-module-kenwood/compare/v1.11.3...v1.11.4) (2026-10-12)

### Bug Fixes

* **deps:** bump source-map-js from 1.2.1 to 1.2.2 ([#18](https://github.com/springfield-ham-radio/radio-module-kenwood/issues/18)) ([fd7b893](https://github.com/springfield-ham-radio/radio-module-kenwood/commit/fd7b8930ef3944f267dc5e3bfe5da218ef28cf5d))

## [1.11.3](https://github.com/springfield-ham-radio/radio-module-kenwood/compare/v1.11.2...v1.11.3) (2026-10-11)

### Bug Fixes

* **th-d74:** match live clone handshake and CHIRP image size ([#16](https://github.com/springfield-ham-radio/radio-module-kenwood/issues/16)) ([d05ebd0](https://github.com/springfield-ham-radio/radio-module-kenwood/commit/d05ebd0b6818f6068bc8cc149995226cd9131dcb))

## [1.11.2](https://github.com/springfield-ham-radio/radio-module-kenwood/compare/v1.11.1...v1.11.2) (2026-10-03)

### Bug Fixes

* **deps:** bump brace-expansion from 5.0.9 to 5.0.12 ([#10](https://github.com/springfield-ham-radio/radio-module-kenwood/issues/10)) ([7afa8f7](https://github.com/springfield-ham-radio/radio-module-kenwood/commit/7afa8f722e39c6bd20d817ac3015fd4930797394))

## [1.11.1](https://github.com/springfield-ham-radio/radio-module-kenwood/compare/v1.11.0...v1.11.1) (2026-10-03)

### Bug Fixes

* **deps:** bump undici from 6.28.0 to 6.29.0 ([#8](https://github.com/springfield-ham-radio/radio-module-kenwood/issues/8)) ([2fd3e51](https://github.com/springfield-ham-radio/radio-module-kenwood/commit/2fd3e5100b3cfa06658aa4f2f2d9adacf43b013e))

## [1.11.0](https://github.com/springfield-ham-radio/radio-module-kenwood/compare/v1.10.1...v1.11.0) (2026-10-03)

### Features

* declare transmit bands for the TH-F6, TH-D74, and TM-D710A ([99e1866](https://github.com/springfield-ham-radio/radio-module-kenwood/commit/99e1866d7ee6a9ab48df5f77cda74b5548948e77))

## [1.10.1](https://github.com/springfield-ham-radio/radio-module-kenwood/compare/v1.10.0...v1.10.1) (2026-09-25)

### Bug Fixes

* keep radio driver versions independent of the module zip ([0b16376](https://github.com/springfield-ham-radio/radio-module-kenwood/commit/0b163764eb3103640aee3875b8987ab4a4935d04))

## [1.10.0](https://github.com/springfield-ham-radio/radio-module-kenwood/compare/v1.9.2...v1.10.0) (2026-09-24)

### Features

* add Kenwood menu numbers and setting descriptions ([5511e01](https://github.com/springfield-ham-radio/radio-module-kenwood/commit/5511e01238a0c4f757caac27ae0755d8e9573a69))

## [1.9.2](https://github.com/springfield-ham-radio/radio-module-kenwood/compare/v1.9.1...v1.9.2) (2026-09-15)

### Bug Fixes

* pause 100ms between TM-D710A clone blocks ([a6fc140](https://github.com/springfield-ham-radio/radio-module-kenwood/commit/a6fc1401292ee417c921807a46161aa0fbb800b8))

## [1.9.1](https://github.com/springfield-ham-radio/radio-module-kenwood/compare/v1.9.0...v1.9.1) (2026-09-15)

### Bug Fixes

* pause 50ms between TM-D710A clone blocks ([000b160](https://github.com/springfield-ham-radio/radio-module-kenwood/commit/000b1601f948ed8bbe6652f3bcc996036b5dd996))

## [1.9.0](https://github.com/springfield-ham-radio/radio-module-kenwood/compare/v1.8.0...v1.9.0) (2026-09-13)

### Features

* generate catalog-module.json from configs ([6fc20d6](https://github.com/springfield-ham-radio/radio-module-kenwood/commit/6fc20d67f12a5df5060905ff7433244b23d4bb37))

## [1.8.0](https://github.com/springfield-ham-radio/radio-module-kenwood/compare/v1.7.0...v1.8.0) (2026-09-13)

### Features

* declare settings groups and sub-groups in memory maps ([1c60eee](https://github.com/springfield-ham-radio/radio-module-kenwood/commit/1c60eee4397be525500c6d6b456c8c756c2b84f4))

## [1.7.0](https://github.com/springfield-ham-radio/radio-module-kenwood/compare/v1.6.0...v1.7.0) (2026-09-12)

### Features

* stamp radio JSON version from the module release ([bb5e38b](https://github.com/springfield-ham-radio/radio-module-kenwood/commit/bb5e38bc01a35902c9225878719de58925439ec2))

## [1.6.0](https://github.com/springfield-ham-radio/radio-module-kenwood/compare/v1.5.0...v1.6.0) (2026-09-12)

### Features

* declare Kenwood CAT session profiles in radio JSON ([55cd270](https://github.com/springfield-ham-radio/radio-module-kenwood/commit/55cd2703490af6b345e193fab0a907a773813828))

## [1.5.0](https://github.com/springfield-ham-radio/radio-module-kenwood/compare/v1.4.0...v1.5.0) (2026-09-12)

### Features

* declare Kenwood live CAT on the PC port ([fcb2adf](https://github.com/springfield-ham-radio/radio-module-kenwood/commit/fcb2adfe8a38b6ea2a40660480fdc2ab53b571d8))

## [1.4.0](https://github.com/springfield-ham-radio/radio-module-kenwood/compare/v1.3.0...v1.4.0) (2026-09-11)

### Features

* advertise supported programming baud rates ([e641c19](https://github.com/springfield-ham-radio/radio-module-kenwood/commit/e641c198fc3e232abcf2ed89e062280a2a94f26b))

## [1.3.0](https://github.com/springfield-ham-radio/radio-module-kenwood/compare/v1.2.0...v1.3.0) (2026-09-11)

### Features

* map TM-D710A PM, VFO, APRS, and special memory channels ([eb7bedd](https://github.com/springfield-ham-radio/radio-module-kenwood/commit/eb7beddf61aa5b15031d7a10703902dd8902a07a))

## [1.2.0](https://github.com/springfield-ham-radio/radio-module-kenwood/compare/v1.1.0...v1.2.0) (2026-09-08)

### Features

* import and export TH-F6 memories over live CAT ([e93e4cf](https://github.com/springfield-ham-radio/radio-module-kenwood/commit/e93e4cf6629026832f4425547e0a3c0676e24476))

### Bug Fixes

* assert TH-F6 CAT memory steps and bump API/utils ([a4a51ce](https://github.com/springfield-ham-radio/radio-module-kenwood/commit/a4a51ce08f2046ee7ec425ce3867b0720af6cb60))
* stop treating TH-F6 CAT wake CR as clone protocol ([2e5e5ba](https://github.com/springfield-ham-radio/radio-module-kenwood/commit/2e5e5ba99499d7d85386464cefd3482b5dd3e777))

## [1.1.0](https://github.com/springfield-ham-radio/radio-module-kenwood/compare/v1.0.0...v1.1.0) (2026-08-28)

### Features

* add Kenwood TM-D710A clone-mode radio ([2ac13a2](https://github.com/springfield-ham-radio/radio-module-kenwood/commit/2ac13a26b4745c14e4b2f3416b8e96e9bad493ed))

## 1.0.0 (2026-08-28)

### Features

* add Kenwood TH-F6 and TH-D74 radio module ([8ac44bb](https://github.com/springfield-ham-radio/radio-module-kenwood/commit/8ac44bb1fb7fb00718b14c6a68ba787b5ab7a525))

# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.
