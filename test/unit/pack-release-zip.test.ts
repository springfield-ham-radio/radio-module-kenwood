import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateModuleCatalog } from '@springfield/ham-radio-registry';
import { describe, expect, it } from 'vitest';
import {
  buildCatalogEntry,
  closurePathsForConfig,
  expectedZipName,
  highestPublishedConfigVersions,
  listConfigDescriptors,
  packReleaseZips,
  parseConfigDescriptor,
  shouldPublishConfig,
} from '../../scripts/pack-release-zip.mjs';

const rootDirectory = join(dirname(fileURLToPath(import.meta.url)), '../..');

function writeModule(
  radios: Record<string, { version: string; shared: boolean; nested?: boolean }>,
): string {
  const tempRoot = mkdtempSync(join(tmpdir(), 'pack-release-'));
  mkdirSync(join(tempRoot, 'configs'), { recursive: true });
  mkdirSync(join(tempRoot, 'src/shared/schemas/pieces'), { recursive: true });
  mkdirSync(join(tempRoot, 'src/shared/memory-maps'), { recursive: true });
  writeFileSync(
    join(tempRoot, 'package.json'),
    JSON.stringify({
      name: '@springfield/radio-module-kenwood',
      version: '2.0.0',
      description: 'Kenwood radios',
      repository: 'https://github.com/springfield-ham-radio/radio-module-kenwood',
      springfield: { manufacturer: 'Kenwood' },
    }),
  );
  writeFileSync(join(tempRoot, 'src/shared/schemas/pieces/extra.json'), '{ "type": "string" }\n');
  writeFileSync(
    join(tempRoot, 'src/shared/schemas/settings.json'),
    '{ "properties": { "name": { "$ref": "pieces/extra.json#/definitions/name" } } }\n',
  );
  writeFileSync(join(tempRoot, 'src/shared/memory-maps/solo.json'), '{ "structs": [] }\n');

  for (const [modelId, radio] of Object.entries(radios)) {
    const refs = radio.shared
      ? { settingsSchema: { settingsSchema: { $ref: '../src/shared/schemas/settings.json' } } }
      : { memoryMap: { $ref: '../src/shared/memory-maps/solo.json' } };
    writeFileSync(
      join(tempRoot, 'configs', `${modelId}.json`),
      JSON.stringify({
        id: { model: modelId, name: modelId, manufacturer: 'Kenwood' },
        version: radio.version,
        minApiVersion: '18.0.1',
        description: `${modelId} driver`,
        ...refs,
      }),
    );
  }

  return tempRoot;
}

function zipHasOnlyPaths(zipPath: string, expectedPaths: string[]): void {
  const listing = spawnSync('unzip', ['-Z1', zipPath], { encoding: 'utf8' });
  expect(listing.status).toBe(0);
  const paths = listing.stdout
    .trim()
    .split('\n')
    .filter(Boolean)
    .sort();
  expect(paths).toEqual([...expectedPaths].sort());
}

describe('pack-release-zip', () => {
  it('lists Kenwood configs with minApiVersion', () => {
    const configs = listConfigDescriptors(rootDirectory);

    expect(configs.map((config) => config.modelId)).toEqual(['kenwood-th-d74', 'kenwood-th-f6', 'kenwood-tm-d710a']);
    expect(configs.every((config) => config.minApiVersion === '18.0.1')).toBe(true);
  });

  it('collects only the $ref closure for TH-D74', () => {
    const descriptor = parseConfigDescriptor(rootDirectory, 'kenwood-th-d74.json', 'Kenwood');
    const paths = closurePathsForConfig(rootDirectory, descriptor);

    expect(paths).toEqual([
      'configs/kenwood-th-d74.json',
      'src/shared/memory-maps/th-d74-settings.json',
      'src/shared/schemas/channel-schema.json',
      'src/shared/schemas/settings-schema.json',
    ]);
  });

  it('packs one zip per config with --all and validates catalog entries', () => {
    const { catalogEntriesPath, entries, packed } = packReleaseZips(rootDirectory, { releaseVersion: '9.9.9', all: true });

    expect(packed.map((item) => item.zipName).sort()).toEqual([
      expectedZipName('kenwood-th-d74', '1.12.0'),
      expectedZipName('kenwood-th-f6', '1.12.0'),
      expectedZipName('kenwood-tm-d710a', '1.11.0'),
    ]);

    const catalogEntries = JSON.parse(readFileSync(catalogEntriesPath, 'utf8')) as unknown[];
    expect(catalogEntries).toHaveLength(3);

    const validation = validateModuleCatalog({ schemaVersion: 3, modules: catalogEntries });
    expect(validation.isValid).toBe(true);
    expect(validation.errors).toEqual([]);

    const d74 = entries.find((entry) => entry.id === 'kenwood-th-d74');
    expect(d74?.downloadUrl).toBe(
      `https://github.com/springfield-ham-radio/radio-module-kenwood/releases/download/v9.9.9/${expectedZipName('kenwood-th-d74', '1.12.0')}`,
    );

    const d74Zip = packed.find((item) => item.modelId === 'kenwood-th-d74');
    expect(d74Zip).toBeDefined();
    zipHasOnlyPaths(d74Zip!.zipPath, [
      'configs/kenwood-th-d74.json',
      'src/shared/memory-maps/th-d74-settings.json',
      'src/shared/schemas/channel-schema.json',
      'src/shared/schemas/settings-schema.json',
    ]);

    const f6Zip = packed.find((item) => item.modelId === 'kenwood-th-f6');
    zipHasOnlyPaths(f6Zip!.zipPath, [
      'configs/kenwood-th-f6.json',
      'src/shared/memory-maps/th-f6-settings.json',
      'src/shared/schemas/channel-schema.json',
      'src/shared/schemas/settings-schema.json',
    ]);
  });

  it('skips configs already published at the same driver version', () => {
    const published = new Map([
      ['kenwood-th-d74', '1.12.0'],
      ['kenwood-th-f6', '1.12.0'],
    ]);
    const configs = listConfigDescriptors(rootDirectory);

    expect(shouldPublishConfig(configs[0], published)).toBe(false);
    expect(shouldPublishConfig(configs[1], published)).toBe(false);
    expect(shouldPublishConfig(configs[2], published)).toBe(true);
  });

  it('ignores retired manufacturer zips when deciding the first per-radio release', () => {
    const published = highestPublishedConfigVersions([
      'radio-module-kenwood-1.11.6.zip',
      'radio-module-kenwood-1.11.2.zip',
      'radio-module-kenwood-1.0.0.zip',
    ]);

    expect(published.size).toBe(0);

    const { packed, entries } = packReleaseZips(rootDirectory, {
      releaseVersion: '2.0.0',
      publishedAssetNames: [
        'radio-module-kenwood-1.11.6.zip',
        'radio-module-kenwood-1.11.2.zip',
        'radio-module-kenwood-1.0.0.zip',
      ],
    });

    expect(packed.map((item) => item.zipName).sort()).toEqual([
      'radio-module-kenwood-th-d74-1.12.0.zip',
      'radio-module-kenwood-th-f6-1.12.0.zip',
      'radio-module-kenwood-tm-d710a-1.11.0.zip',
    ]);

    const validation = validateModuleCatalog({ schemaVersion: 3, modules: entries });
    expect(validation.isValid).toBe(true);

    for (const entry of entries) {
      expect(entry.downloadUrl).toContain('/releases/download/v2.0.0/');
      expect(entry.downloadUrl.endsWith(`radio-module-${entry.id}-${entry.version}.zip`)).toBe(true);
      expect(entry.version).not.toBe('2.0.0');
    }
  });

  it('packs every radio whose shared schema bump raised its config version', () => {
    const published = highestPublishedConfigVersions([
      'radio-module-kenwood-1.11.6.zip',
      'radio-module-kenwood-th-d74-1.11.1.zip',
      'radio-module-kenwood-th-f6-1.11.0.zip',
      'radio-module-kenwood-tm-d710a-1.11.0.zip',
    ]);

    expect(published.get('kenwood-th-d74')).toBe('1.11.1');
    expect(published.get('kenwood-th-f6')).toBe('1.11.0');

    const tempRoot = writeModule({
      'kenwood-th-d74': { version: '1.12.0', shared: true },
      'kenwood-th-f6': { version: '1.12.0', shared: true },
      'kenwood-tm-d710a': { version: '1.11.0', shared: false },
    });

    try {
      const { packed } = packReleaseZips(tempRoot, {
        releaseVersion: '2.1.0',
        publishedAssetNames: [
          'radio-module-kenwood-1.11.6.zip',
          'radio-module-kenwood-th-d74-1.11.1.zip',
          'radio-module-kenwood-th-f6-1.11.0.zip',
          'radio-module-kenwood-tm-d710a-1.11.0.zip',
        ],
      });

      expect(packed.map((item) => item.modelId).sort()).toEqual(['kenwood-th-d74', 'kenwood-th-f6']);
      expect(packed.map((item) => item.zipName).sort()).toEqual([
        'radio-module-kenwood-th-d74-1.12.0.zip',
        'radio-module-kenwood-th-f6-1.12.0.zip',
      ]);
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('includes nested $ref targets and rejects a ref that escapes the repo', () => {
    const tempRoot = writeModule({
      'kenwood-th-d74': { version: '1.0.0', shared: true, nested: true },
    });

    try {
      const descriptor = parseConfigDescriptor(tempRoot, 'kenwood-th-d74.json', 'Kenwood');
      expect(closurePathsForConfig(tempRoot, descriptor)).toEqual([
        'configs/kenwood-th-d74.json',
        'src/shared/schemas/pieces/extra.json',
        'src/shared/schemas/settings.json',
      ]);

      const { packed } = packReleaseZips(tempRoot, { releaseVersion: '2.0.0', all: true });
      zipHasOnlyPaths(packed[0].zipPath, [
        'configs/kenwood-th-d74.json',
        'src/shared/schemas/pieces/extra.json',
        'src/shared/schemas/settings.json',
      ]);

      writeFileSync(
        join(tempRoot, 'configs/kenwood-th-d74.json'),
        JSON.stringify({
          id: { model: 'kenwood-th-d74', name: 'Kenwood TH-D74', manufacturer: 'Kenwood' },
          version: '1.0.0',
          minApiVersion: '18.0.1',
          memoryMap: { $ref: '../../outside.json' },
        }),
      );
      expect(() => closurePathsForConfig(tempRoot, parseConfigDescriptor(tempRoot, 'kenwood-th-d74.json', 'Kenwood'))).toThrow(
        'escapes the repository',
      );
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('rejects configs without minApiVersion', () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'pack-release-'));
    mkdirSync(join(tempRoot, 'configs'), { recursive: true });
    writeFileSync(
      join(tempRoot, 'package.json'),
      JSON.stringify({ name: '@springfield/radio-module-kenwood', springfield: { manufacturer: 'Kenwood' } }),
    );
    writeFileSync(
      join(tempRoot, 'configs/kenwood-th-d74.json'),
      JSON.stringify({
        id: { model: 'kenwood-th-d74', name: 'Kenwood TH-D74', manufacturer: 'Kenwood' },
        version: '1.0.0',
      }),
    );

    try {
      expect(() => parseConfigDescriptor(tempRoot, 'kenwood-th-d74.json', 'Kenwood')).toThrow('minApiVersion');
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('buildCatalogEntry matches registry field rules', () => {
    const descriptor = parseConfigDescriptor(rootDirectory, 'kenwood-th-f6.json', 'Kenwood');
    const pkg = JSON.parse(readFileSync(join(rootDirectory, 'package.json'), 'utf8'));
    const zipName = expectedZipName(descriptor.modelId, descriptor.configVersion);
    const integrity = 'sha256:' + 'a'.repeat(64);
    const entry = buildCatalogEntry(pkg, descriptor, '1.12.0', 'springfield-ham-radio/radio-module-kenwood', zipName, integrity);

    const validation = validateModuleCatalog({ schemaVersion: 3, modules: [entry] });
    expect(validation.isValid).toBe(true);
  });
});
