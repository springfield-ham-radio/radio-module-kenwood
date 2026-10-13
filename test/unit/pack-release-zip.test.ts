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
  listConfigDescriptors,
  packReleaseZips,
  parseConfigDescriptor,
  publishedConfigVersionsByModel,
  shouldPublishConfig,
} from '../../scripts/pack-release-zip.mjs';

const rootDirectory = join(dirname(fileURLToPath(import.meta.url)), '../..');

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
      expectedZipName('kenwood-th-d74', '1.11.1'),
      expectedZipName('kenwood-th-f6', '1.11.0'),
      expectedZipName('kenwood-tm-d710a', '1.11.0'),
    ]);

    const catalogEntries = JSON.parse(readFileSync(catalogEntriesPath, 'utf8')) as unknown[];
    expect(catalogEntries).toHaveLength(3);

    const validation = validateModuleCatalog({ schemaVersion: 3, modules: catalogEntries });
    expect(validation.isValid).toBe(true);
    expect(validation.errors).toEqual([]);

    const d74 = entries.find((entry) => entry.id === 'kenwood-th-d74');
    expect(d74?.downloadUrl).toBe(
      `https://github.com/springfield-ham-radio/radio-module-kenwood/releases/download/v9.9.9/${expectedZipName('kenwood-th-d74', '1.11.1')}`,
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
      ['kenwood-th-d74', '1.11.1'],
      ['kenwood-th-f6', '1.11.0'],
    ]);
    const configs = listConfigDescriptors(rootDirectory);

    expect(shouldPublishConfig(configs[0], published)).toBe(false);
    expect(shouldPublishConfig(configs[1], published)).toBe(false);
    expect(shouldPublishConfig(configs[2], published)).toBe(true);
  });

  it('parses per-radio asset names from GitHub releases', () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'pack-release-'));
    writeFileSync(
      join(tempRoot, 'package.json'),
      JSON.stringify({
        name: '@springfield/radio-module-kenwood',
        repository: 'https://github.com/springfield-ham-radio/radio-module-kenwood',
      }),
    );

    try {
      const fromGithub = publishedConfigVersionsByModel(rootDirectory);
      expect(fromGithub.get('kenwood-th-d74')).toBeUndefined();

      const byModel = publishedConfigVersionsByModel(tempRoot);
      expect(byModel.size).toBe(0);
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
