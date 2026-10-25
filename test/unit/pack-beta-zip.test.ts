import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  MAX_BETA_ZIP_BYTES,
  expectedBetaZipName,
  packBetaZip,
  packedBetaVersion,
  validateBetaDescriptor,
} from '@springfield/ham-radio-utils';
import { closurePathsForConfig, parseConfigDescriptor } from '../../scripts/pack-release-zip.mjs';

const rootDirectory = join(dirname(fileURLToPath(import.meta.url)), '../..');

function betaOutputDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'pack-beta-out-'));
  mkdirSync(directory, { recursive: true });
  return directory;
}

function zipHasOnlyPaths(zipPath: string, expectedPaths: string[]): void {
  const listing = spawnSync('unzip', ['-Z1', zipPath], { encoding: 'utf8' });
  expect(listing.status).toBe(0);
  const paths = listing.stdout.trim().split('\n').filter(Boolean).sort();
  expect(paths).toEqual([...expectedPaths].sort());
}

describe('pack:beta Kenwood configs', () => {
  it.each(['kenwood-th-d74', 'kenwood-th-f6', 'kenwood-tm-d710a'])(
    'packs %s with the same $ref closure as pack:release',
    (modelId) => {
      const configPath = join(rootDirectory, `configs/${modelId}.json`);
      const before = readFileSync(configPath, 'utf8');
      const descriptor = parseConfigDescriptor(rootDirectory, `${modelId}.json`, 'Kenwood');
      const releasePaths = closurePathsForConfig(rootDirectory, descriptor);
      const outputDirectory = betaOutputDirectory();
      const result = packBetaZip(rootDirectory, modelId, 1, { outputDirectory });

      expect(result.zipName).toBe(expectedBetaZipName(modelId, descriptor.configVersion, 1));
      expect(result.packedVersion).toBe(packedBetaVersion(descriptor.configVersion, 1));
      expect(existsSync(result.zipPath)).toBe(true);
      expect(statSync(result.zipPath).size).toBeLessThanOrEqual(MAX_BETA_ZIP_BYTES);
      expect(readFileSync(configPath, 'utf8')).toBe(before);
      expect(() => validateBetaDescriptor(descriptor)).not.toThrow();

      zipHasOnlyPaths(result.zipPath, releasePaths);

      const extracted = spawnSync('unzip', ['-p', result.zipPath, `configs/${modelId}.json`], {
        encoding: 'utf8',
      });
      expect(extracted.status).toBe(0);
      const packedConfig = JSON.parse(extracted.stdout) as { version: string };
      expect(packedConfig.version).toBe(result.packedVersion);
    },
  );
});
