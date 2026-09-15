import { describe, it } from 'node:test';
import { expect } from 'chai';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stampConfigVersions } from '../../scripts/stamp-config-versions.mjs';

const rootDirectory = join(dirname(fileURLToPath(import.meta.url)), '../..');

describe('stampConfigVersions', () => {
  it('replaces only the top-level version line', () => {
    const workspace = mkdtempSync(join(tmpdir(), 'kenwood-stamp-'));
    const configsDirectory = join(workspace, 'configs');
    mkdirSync(configsDirectory);

    const originalText = `{
  "$schema": "https://springfield-ham-radio.com/schemas/radio-config-v1.json",
  "version": "1.0.0",
  "cat": {
    "frequencyCommands": ["FO"],
    "powers": ["High", "Medium", "Low"]
  }
}
`;
    const configPath = join(configsDirectory, 'kenwood-tm-d710a.json');
    writeFileSync(configPath, originalText);

    try {
      const updatedPaths = stampConfigVersions(workspace, '1.6.0');
      const stampedText = readFileSync(configPath, 'utf8');

      expect(updatedPaths).to.deep.equal([configPath]);
      expect(stampedText).to.equal(originalText.replace('1.0.0', '1.6.0'));
      expect(stampedText).to.include('"frequencyCommands": ["FO"]');
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  it('keeps each Kenwood radio config on its own semver', () => {
    const semver = /^\d+\.\d+\.\d+$/;

    for (const fileName of ['kenwood-th-d74.json', 'kenwood-th-f6.json', 'kenwood-tm-d710a.json']) {
      const config = JSON.parse(readFileSync(join(rootDirectory, 'configs', fileName), 'utf8')) as {
        version: string;
      };

      expect(config.version).to.match(semver);
    }
  });

  it('rejects a version that is not semver', () => {
    expect(() => stampConfigVersions(rootDirectory, 'not-a-version')).to.throw('Invalid radio config version');
  });
});
