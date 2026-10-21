import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SchemaValidator } from '@springfield/ham-radio-utils';
import { describe, expect, it } from 'vitest';

const rootDirectory = join(dirname(fileURLToPath(import.meta.url)), '../..');
const validator = new SchemaValidator();

type KenwoodConfig = {
  id: { model: string };
  minApiVersion?: string;
  onError?: {
    readMemory?: unknown[];
    writeMemory?: unknown[];
  };
};

function loadConfig(fileName: string): KenwoodConfig {
  return JSON.parse(readFileSync(join(rootDirectory, 'configs', fileName), 'utf8')) as KenwoodConfig;
}

describe('Kenwood radio configs (schema)', () => {
  it('validates every config against the radio protocol schema', () => {
    const configFiles = readdirSync(join(rootDirectory, 'configs')).filter((entry) => entry.endsWith('.json'));

    for (const fileName of configFiles) {
      const config = loadConfig(fileName);
      const result = validator.validateRadioProtocol(config);

      expect(result.valid, `${fileName}: ${result.errors?.join('; ')}`).toBe(true);
    }
  });

  it('declares onError cleanup for clone-mode Kenwood models', () => {
    const thD74 = loadConfig('kenwood-th-d74.json');
    expect(thD74.minApiVersion).toBe('18.3.0');
    expect(thD74.onError).toEqual({
      readMemory: [{ setBaudRate: 57600 }, { send: ['E'] }],
      writeMemory: [{ setBaudRate: 57600 }, { send: ['E'] }],
    });

    const tmD710a = loadConfig('kenwood-tm-d710a.json');
    expect(tmD710a.minApiVersion).toBe('18.3.0');
    expect(tmD710a.onError).toEqual({
      readMemory: [{ send: ['E'] }],
      writeMemory: [{ send: ['E'] }],
    });
  });

  it('does not declare onError for TH-F6 live CAT', () => {
    const thF6 = loadConfig('kenwood-th-f6.json');
    expect(thF6.minApiVersion).toBe('18.0.1');
    expect(thF6.onError).toBeUndefined();
  });
});
