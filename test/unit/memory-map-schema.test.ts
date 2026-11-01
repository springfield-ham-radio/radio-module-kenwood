import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SchemaValidator } from '@springfield/ham-radio-utils';
import { describe, expect, it } from 'vitest';

const rootDirectory = join(dirname(fileURLToPath(import.meta.url)), '../..');

describe('Kenwood memory maps', () => {
  it('validates the TH-D74 settings map, including menu 501 icon choices', () => {
    const validator = new SchemaValidator();
    const memoryMap: unknown = JSON.parse(
      readFileSync(join(rootDirectory, 'src/shared/memory-maps/th-d74-settings.json'), 'utf8'),
    );
    const result = validator.validateMemoryMap(memoryMap);

    expect(result.valid, result.errors?.join('; ')).toBe(true);
  });
});
