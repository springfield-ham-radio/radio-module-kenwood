import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Ajv, type AnySchema } from 'ajv';
import addFormats from 'ajv-formats';
import { describe, expect, it } from 'vitest';

const rootDirectory = join(dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * The published memory-map schema rejects unknown `ui` keys.
 * Menu 516 uses `ui.record` and `ui.composite`, which ham-radio-ui is adding.
 * Validate against that schema plus those two keys so the rest of the map still has to match.
 */
function schemaWithLayoutKeys(): AnySchema {
  const schema = JSON.parse(
    readFileSync(
      join(rootDirectory, 'node_modules/@springfield/ham-radio-utils/src/schemas/radio-memory-map-schema.json'),
      'utf8',
    ),
  ) as {
    definitions: {
      ui: {
        properties: Record<string, unknown>;
      };
    };
  };
  schema.definitions.ui.properties.record = {
    type: 'object',
    additionalProperties: false,
    required: ['id', 'index', 'label'],
    properties: {
      id: { type: 'string', minLength: 1 },
      index: { type: 'integer', minimum: 1 },
      label: { type: 'string', minLength: 1 },
    },
  };
  schema.definitions.ui.properties.composite = {
    type: 'object',
    additionalProperties: false,
    required: ['id', 'kind', 'axis', 'part', 'fractionScale', 'label'],
    properties: {
      id: { type: 'string', minLength: 1 },
      kind: { const: 'coordinate' },
      axis: { enum: ['lat', 'lon'] },
      part: { enum: ['degrees', 'minutes', 'fraction'] },
      fractionScale: { type: 'integer', minimum: 1 },
      label: { type: 'string', minLength: 1 },
    },
  };
  return schema;
}

describe('Kenwood memory maps', () => {
  it('validates the TH-D74 settings map, including menu 501 icon choices', () => {
    const ajv = new Ajv({ allErrors: true, verbose: true });
    (addFormats as unknown as (instance: Ajv) => Ajv)(ajv);
    const validate = ajv.compile(schemaWithLayoutKeys());
    const memoryMap: unknown = JSON.parse(
      readFileSync(join(rootDirectory, 'src/shared/memory-maps/th-d74-settings.json'), 'utf8'),
    );
    const valid = validate(memoryMap);
    const errors = (validate.errors ?? []).map((error) => `${error.instancePath || 'root'}: ${error.message}`);

    expect(valid, errors.join('; ')).toBe(true);
  });
});
