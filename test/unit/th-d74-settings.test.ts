import { type RadioModelId, type RadioMemoryConfig, type RadioMemoryMap } from '@springfield/ham-radio-api';
import { createMemoryMapCodec } from '@springfield/ham-radio-utils';
import { MockLogLayer } from 'loglayer';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const rootDirectory = join(dirname(fileURLToPath(import.meta.url)), '../..');

function loadThD74() {
  const memoryMap = JSON.parse(readFileSync(join(rootDirectory, 'src/shared/memory-maps/th-d74-settings.json'), 'utf8')) as RadioMemoryMap;
  const radioConfig = JSON.parse(readFileSync(join(rootDirectory, 'configs/kenwood-th-d74.json'), 'utf8')) as {
    version: string;
    memoryConfig: RadioMemoryConfig;
    id: { model: string };
  };

  return {
    memoryMap,
    memoryConfig: radioConfig.memoryConfig,
    modelId: radioConfig.id.model as RadioModelId,
    version: radioConfig.version,
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

describe('TH-D74 menu settings', () => {
  const { memoryMap, memoryConfig, modelId, version } = loadThD74();

  it('bumps the driver config for the added menus', () => {
    expect(version).toBe('1.15.0');
    expect(memoryMap.version).toBe('1.2.0');
  });

  it('decodes confirmed bytes and keeps inferred indexes on the manual step', () => {
    const codec = createMemoryMapCodec({
      radioModel: modelId,
      memoryMap,
      memoryConfig,
      logger: new MockLogLayer(),
    });
    const contents = new Uint8Array(500480).fill(0xff);
    contents.fill(0x20, 0x14800, 0x14800 + 30 * 16);

    const confirmed: Array<{ offset: number; raw: number; structId: string; field: string; expected: string }> = [
      { offset: 0x1006, raw: 0x01, structId: 'micSensitivity', field: 'sensitivity', expected: 'Medium' },
      { offset: 0x1006, raw: 0x02, structId: 'micSensitivity', field: 'sensitivity', expected: 'Low' },
      { offset: 0x1008, raw: 0x01, structId: 'ssbHighCut', field: 'cutoff', expected: '2.4kHz' },
      { offset: 0x1008, raw: 0x02, structId: 'ssbHighCut', field: 'cutoff', expected: '2.6kHz' },
      { offset: 0x1008, raw: 0x04, structId: 'ssbHighCut', field: 'cutoff', expected: '3.0kHz' },
      { offset: 0x1024, raw: 0x04, structId: 'cwPitch', field: 'pitch', expected: '800Hz' },
      { offset: 0x1024, raw: 0x06, structId: 'cwPitch', field: 'pitch', expected: '1000Hz' },
      { offset: 0x1030, raw: 0, structId: 'recallMethod', field: 'method', expected: 'All Bands' },
      { offset: 0x1030, raw: 1, structId: 'recallMethod', field: 'method', expected: 'Current Band' },
      { offset: 0x1032, raw: 1, structId: 'txMonitor', field: 'monitor', expected: 'true' },
      { offset: 0x1032, raw: 0, structId: 'txMonitor', field: 'monitor', expected: 'false' },
      { offset: 0x1062, raw: 0x00, structId: 'lcdBrightness', field: 'brightness', expected: 'Low' },
      { offset: 0x1062, raw: 0x01, structId: 'lcdBrightness', field: 'brightness', expected: 'Medium' },
      { offset: 0x107f, raw: 0x00, structId: 'cursorShift', field: 'delay', expected: 'Off' },
      { offset: 0x107f, raw: 0x03, structId: 'cursorShift', field: 'delay', expected: '2.0s' },
      { offset: 0x1088, raw: 0x00, structId: 'speedDistance', field: 'unit', expected: 'mi/h' },
      { offset: 0x1088, raw: 0x02, structId: 'speedDistance', field: 'unit', expected: 'knots' },
    ];

    for (const sample of confirmed) {
      contents[sample.offset] = sample.raw;
      const settings = asRecord(codec.decode({ contents, radioModel: modelId }).settings);
      expect(String(asRecord(settings[sample.structId])[sample.field])).toBe(sample.expected);
    }

    // Inferred from a clear index pattern. Not measured in a clone image.
    contents[0x1006] = 0x00;
    contents[0x1008] = 0x00;
    contents[0x1024] = 0x00;
    contents[0x107f] = 0x01;
    contents[0x1088] = 0x01;
    contents[0x1085] = 0;

    const inferredLow = asRecord(codec.decode({ contents, radioModel: modelId }).settings);
    expect(asRecord(inferredLow.ssbHighCut).cutoff).toBe('2.2kHz');

    contents[0x1008] = 0x03;

    const inferred = asRecord(codec.decode({ contents, radioModel: modelId }).settings);
    expect(asRecord(inferred.micSensitivity).sensitivity).toBe('High');
    expect(asRecord(inferred.ssbHighCut).cutoff).toBe('2.8kHz');
    expect(asRecord(inferred.cwPitch).pitch).toBe('400Hz');
    expect(asRecord(inferred.cursorShift).delay).toBe('1.0s');
    expect(asRecord(inferred.speedDistance).unit).toBe('km/h');
    expect(asRecord(inferred.dtmfKeysLock).locked).toBe(false);
  });

  it('keeps mixed text padding byte-identical when the text is not edited', () => {
    const codec = createMemoryMapCodec({
      radioModel: modelId,
      memoryMap,
      memoryConfig,
      logger: new MockLogLayer(),
    });
    const contents = new Uint8Array(500480).fill(0xff);
    contents.fill(0x20, 0x14800, 0x14800 + 30 * 16);
    // Scalar menus must already be legal values. 0xFF decodes as the first option and would be rewritten.
    for (const offset of [0x1001, 0x1003, 0x1006, 0x1008, 0x100c, 0x1024, 0x1030, 0x1032, 0x1060, 0x1062, 0x1071, 0x1076, 0x1077, 0x107f, 0x1085, 0x1088]) {
      contents[offset] = 0;
    }

    const powerOn = Buffer.from('HELLO !!', 'ascii');
    powerOn.copy(contents, 0x10c0);
    contents.fill(0x00, 0x10c0 + powerOn.length, 0x10d0);
    // Trailing spaces sit after a NUL, so decode never sees them. Encode used to write NULs.
    contents[0x10ca] = 0x20;
    contents[0x10cb] = 0x20;

    const callsign = Buffer.from('W1AW', 'ascii');
    callsign.copy(contents, 0x02b1);
    contents.fill(0x20, 0x02b1 + callsign.length, 0x02b9);
    contents[0x02b9] = 'H'.charCodeAt(0);
    contents[0x02ba] = 'T'.charCodeAt(0);
    contents[0x02bb] = 0x20;
    // Space-padded memo with a trailing NUL. Encode used to rewrite this as a space.
    contents[0x02bc] = 0x00;

    const aprsCall = Buffer.from('W1AW', 'ascii');
    aprsCall.copy(contents, 0x1200);
    contents.fill(0x00, 0x1200 + aprsCall.length, 0x1206);
    contents[0x1204] = 0x20;
    contents[0x1206] = '-'.charCodeAt(0);
    contents[0x1207] = '7'.charCodeAt(0);
    contents[0x1208] = 0x00;

    const original = Uint8Array.from(contents);
    const decoded = codec.decode({ contents, radioModel: modelId });
    const settings = asRecord(decoded.settings);

    expect(asRecord(settings.powerOnMessage).message).toBe('HELLO !!');
    expect(asRecord(settings.dstarMyCall)).toMatchObject({ callsign: 'W1AW', memo: 'HT' });
    expect(asRecord(settings.aprsMyCall)).toMatchObject({ callsign: 'W1AW', ssid: '-7' });

    const encoded = codec.encode(decoded, { contents: Uint8Array.from(contents), radioModel: modelId });

    expect(encoded.contents[0x10ca]).toBe(0x20);
    expect(encoded.contents[0x10cb]).toBe(0x20);
    expect(encoded.contents[0x02bc]).toBe(0x00);
    expect(encoded.contents[0x1204]).toBe(0x20);
    expect(encoded.contents).toEqual(original);

    const edited = codec.encode(
      {
        ...decoded,
        settings: {
          ...decoded.settings,
          powerOnMessage: { message: 'CQ CQ' },
          dstarMyCall: { callsign: 'W1AW', memo: 'MOB' },
        },
      },
      { contents: Uint8Array.from(original), radioModel: modelId },
    );

    expect(Buffer.from(edited.contents.subarray(0x10c0, 0x10c5)).toString('ascii')).toBe('CQ CQ');
    expect([...edited.contents.subarray(0x10c5, 0x10d0)].every((byte) => byte === 0x00)).toBe(true);
    expect(Buffer.from(edited.contents.subarray(0x02b9, 0x02bd)).toString('ascii')).toBe('MOB ');
    expect(edited.contents[0x02bc]).toBe(0x20);
  });
});
