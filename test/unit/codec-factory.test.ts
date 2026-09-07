import { describe, it } from 'node:test';
import { expect } from 'chai';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RadioMemoryConfig, RadioMemoryMap } from '@springfield/ham-radio-api';
import { createMemoryMapCodec } from '@springfield/ham-radio-utils';
import { MockLogLayer } from 'loglayer';

const rootDirectory = join(dirname(fileURLToPath(import.meta.url)), '../..');

function readJson(relativePath: string): unknown {
  return JSON.parse(readFileSync(join(rootDirectory, relativePath), 'utf8'));
}

describe('Kenwood DSL module', () => {
  for (const fixture of [
    {
      configPath: 'configs/kenwood-th-d74.json',
      mapPath: 'src/shared/memory-maps/th-d74-settings.json',
      model: 'kenwood-th-d74',
    },
    {
      configPath: 'configs/kenwood-th-f6.json',
      mapPath: 'src/shared/memory-maps/th-f6-settings.json',
      model: 'kenwood-th-f6',
    },
    {
      configPath: 'configs/kenwood-tm-d710a.json',
      mapPath: 'src/shared/memory-maps/tm-d710a-settings.json',
      model: 'kenwood-tm-d710a',
    },
  ]) {
    it(`declares a memoryMap codec for ${fixture.model}`, () => {
      const config = readJson(fixture.configPath) as {
        codec: { type: string };
        memoryMap: { $ref: string };
        memoryConfig: RadioMemoryConfig;
        id: { model: string };
      };

      expect(config.codec.type).to.equal('memoryMap');
      expect(config.memoryMap.$ref).to.equal(`../${fixture.mapPath}`);

      const memoryMap = readJson(fixture.mapPath) as RadioMemoryMap;
      const codec = createMemoryMapCodec({
        radioModel: config.id.model as never,
        memoryMap,
        memoryConfig: config.memoryConfig,
        logger: new MockLogLayer(),
      });

      expect(codec.decode).to.be.a('function');
      expect(codec.encode).to.be.a('function');
    });
  }

  it('uses live CAT memory steps for the TH-F6', () => {
    const config = readJson('configs/kenwood-th-f6.json') as {
      readMemory: Array<Record<string, unknown>>;
      writeMemory: Array<Record<string, unknown>>;
    };

    expect(config.readMemory.some((step) => 'catRead' in step)).to.equal(true);
    expect(config.writeMemory.some((step) => 'catWrite' in step)).to.equal(true);
    expect(config.readMemory.some((step) => JSON.stringify(step.send) === JSON.stringify(['0x0D']))).to.equal(false);
  });
});
