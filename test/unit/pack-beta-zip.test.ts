import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  MAX_BETA_ZIP_BYTES,
  expectedBetaZipName,
  formatBetaPackOutput,
  packBetaZip,
  packedBetaVersion,
  parseBetaCounter,
  validateBetaDescriptor,
} from '../../scripts/pack-beta-zip.mjs';
import { closurePathsForConfig, parseConfigDescriptor } from '../../scripts/pack-release-zip.mjs';

const rootDirectory = join(dirname(fileURLToPath(import.meta.url)), '../..');

function betaOutputDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'pack-beta-out-'));
  mkdirSync(directory, { recursive: true });
  return directory;
}

function writeBetaModule(options: {
  version?: string;
  minApiVersion?: string;
  largePayload?: boolean;
}): string {
  const tempRoot = mkdtempSync(join(tmpdir(), 'pack-beta-'));
  mkdirSync(join(tempRoot, 'configs'), { recursive: true });
  mkdirSync(join(tempRoot, 'src/shared/memory-maps'), { recursive: true });
  writeFileSync(
    join(tempRoot, 'package.json'),
    JSON.stringify({
      name: '@springfield/radio-module-kenwood',
      version: '2.0.0',
      repository: 'https://github.com/springfield-ham-radio/radio-module-kenwood',
      springfield: { manufacturer: 'Kenwood' },
    }),
  );
  const mapBody = options.largePayload
    ? randomBytes(MAX_BETA_ZIP_BYTES + 50_000)
    : Buffer.from('{ "structs": [] }\n');
  writeFileSync(join(tempRoot, 'src/shared/memory-maps/solo.json'), mapBody as Buffer);
  writeFileSync(
    join(tempRoot, 'configs/kenwood-th-d74.json'),
    JSON.stringify({
      id: { model: 'kenwood-th-d74', name: 'Kenwood TH-D74', manufacturer: 'Kenwood' },
      version: options.version ?? '1.0.0',
      minApiVersion: options.minApiVersion ?? '18.0.1',
      memoryMap: { $ref: '../src/shared/memory-maps/solo.json' },
    }),
  );

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

describe('pack-beta-zip', { sequential: true }, () => {
  it('parses beta counter n', () => {
    expect(parseBetaCounter(undefined)).toBe(1);
    expect(parseBetaCounter('2')).toBe(2);
    expect(() => parseBetaCounter('0')).toThrow(/positive integer/);
    expect(() => parseBetaCounter('01')).toThrow(/leading zero/);
  });

  it('packs one beta zip with version suffix inside the config', () => {
    const before = readFileSync(join(rootDirectory, 'configs/kenwood-th-d74.json'), 'utf8');
    const descriptor = parseConfigDescriptor(rootDirectory, 'kenwood-th-d74.json', 'Kenwood');
    const releasePaths = closurePathsForConfig(rootDirectory, descriptor);

    const outputDirectory = betaOutputDirectory();
    const result = packBetaZip(rootDirectory, 'kenwood-th-d74', 1, { outputDirectory });

    expect(result.zipName).toBe(expectedBetaZipName('kenwood-th-d74', descriptor.configVersion, 1));
    expect(result.packedVersion).toBe(packedBetaVersion(descriptor.configVersion, 1));
    expect(existsSync(result.zipPath)).toBe(true);
    expect(statSync(result.zipPath).size).toBeLessThanOrEqual(MAX_BETA_ZIP_BYTES);

    const after = readFileSync(join(rootDirectory, 'configs/kenwood-th-d74.json'), 'utf8');
    expect(after).toBe(before);

    zipHasOnlyPaths(result.zipPath, releasePaths);

    const extracted = spawnSync('unzip', ['-p', result.zipPath, 'configs/kenwood-th-d74.json'], { encoding: 'utf8' });
    expect(extracted.status).toBe(0);
    const packedConfig = JSON.parse(extracted.stdout) as { version: string };
    expect(packedConfig.version).toBe(result.packedVersion);

    const hash = createHash('sha256').update(readFileSync(result.zipPath)).digest('hex');
    expect(result.sha256).toBe(`sha256:${hash}`);
    expect(formatBetaPackOutput(result)).toContain(result.zipPath);
    expect(formatBetaPackOutput(result)).toContain(result.sha256);
  });

  it('uses the same $ref closure as pack:release for the model', () => {
    const descriptor = parseConfigDescriptor(rootDirectory, 'kenwood-th-f6.json', 'Kenwood');
    const releasePaths = closurePathsForConfig(rootDirectory, descriptor);
    const outputDirectory = betaOutputDirectory();
    const { zipPath } = packBetaZip(rootDirectory, 'kenwood-th-f6', 2, { outputDirectory });

    zipHasOnlyPaths(zipPath, releasePaths);
    expect(zipPath.endsWith(expectedBetaZipName('kenwood-th-f6', descriptor.configVersion, 2))).toBe(true);
  });

  it('does not delete other zips in dist-release', () => {
    const outputDirectory = betaOutputDirectory();
    const keeperPath = join(outputDirectory, 'radio-module-kenwood-th-f6-1.11.0.zip');
    writeFileSync(keeperPath, 'placeholder');

    packBetaZip(rootDirectory, 'kenwood-th-d74', 1, { outputDirectory });
    expect(existsSync(keeperPath)).toBe(true);
    rmSync(outputDirectory, { recursive: true, force: true });
  });

  it('rejects working-tree prerelease versions and build metadata', () => {
    const tempRoot = writeBetaModule({ version: '1.0.0-beta.1' });

    try {
      expect(() => packBetaZip(tempRoot, 'kenwood-th-d74')).toThrow(/prerelease/);
      writeFileSync(
        join(tempRoot, 'configs/kenwood-th-d74.json'),
        JSON.stringify({
          id: { model: 'kenwood-th-d74', name: 'Kenwood TH-D74', manufacturer: 'Kenwood' },
          version: '1.0.0+build',
          minApiVersion: '18.0.1',
          memoryMap: { $ref: '../src/shared/memory-maps/solo.json' },
        }),
      );
      expect(() => packBetaZip(tempRoot, 'kenwood-th-d74')).toThrow(/build metadata/);
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('requires strict major.minor.patch minApiVersion', () => {
    const tempRoot = writeBetaModule({ minApiVersion: '18' });

    try {
      expect(() => packBetaZip(tempRoot, 'kenwood-th-d74')).toThrow(/minApiVersion/);
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('fails when the zip exceeds 1 MiB', () => {
    const tempRoot = writeBetaModule({ largePayload: true });

    try {
      expect(() => packBetaZip(tempRoot, 'kenwood-th-d74')).toThrow(/exceeds/);
      const zipPath = join(tempRoot, 'dist-release', expectedBetaZipName('kenwood-th-d74', '1.0.0', 1));
      expect(existsSync(zipPath)).toBe(false);
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('validateBetaDescriptor enforces strict semver fields', () => {
    const descriptor = parseConfigDescriptor(rootDirectory, 'kenwood-th-d74.json', 'Kenwood');
    expect(() => validateBetaDescriptor(descriptor)).not.toThrow();
  });
});
