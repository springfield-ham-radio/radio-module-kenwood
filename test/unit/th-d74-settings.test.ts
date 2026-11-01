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
    expect(version).toBe('1.18.1');
    expect(memoryMap.version).toBe('1.5.1');
  });

  it('names each menu setting with the manual section for that hundred', () => {
    const sections: Record<number, string> = {
      1: 'TX/RX',
      2: 'Memory',
      3: 'Audio File',
      4: 'GPS',
      5: 'APRS',
      6: 'Digital',
      7: 'FM Broadcasting',
      8: 'SD Card',
      9: 'Configuration',
    };
    const seen = new Map<number, string>();

    for (const struct of memoryMap.structs) {
      for (const field of struct.fields) {
        const ui = field.ui as { section?: string; sectionOrder?: number; menu?: { number: number }; group?: string; label?: string } | undefined;

        if (!ui) {
          continue;
        }

        if (ui.group === 'groups') {
          expect(ui.section).toBe('Memory');
          expect(ui.sectionOrder).toBe(2);
          continue;
        }

        if (ui.group === 'channel' || ui.menu === undefined) {
          expect(ui.section).toBeUndefined();
          expect(ui.sectionOrder).toBeUndefined();
          continue;
        }

        const hundred = Math.floor(ui.menu.number / 100);
        expect(ui.section, `${struct.id}.${field.id}`).toBe(sections[hundred]);
        expect(ui.sectionOrder, `${struct.id}.${field.id}`).toBe(hundred);
        seen.set(ui.menu.number, ui.section ?? '');
      }
    }

    expect(seen.get(500)).toBe('APRS');
    expect(seen.get(141)).toBe('TX/RX');
    expect(seen.get(501)).toBe('APRS');
    expect(seen.get(551)).toBe('APRS');
    expect(seen.size).toBe(33);
  });

  it('decodes confirmed menu bytes, including CW pitch steps on the confirmed 100 Hz pattern', () => {
    const codec = createMemoryMapCodec({
      radioModel: modelId,
      memoryMap,
      memoryConfig,
      logger: new MockLogLayer(),
    });
    const contents = new Uint8Array(500480).fill(0xff);
    contents.fill(0x20, 0x14800, 0x14800 + 30 * 16);

    const confirmed: Array<{ offset: number; raw: number; structId: string; field: string; expected: string }> = [
      { offset: 0x1006, raw: 0x00, structId: 'micSensitivity', field: 'sensitivity', expected: 'High' },
      { offset: 0x1006, raw: 0x01, structId: 'micSensitivity', field: 'sensitivity', expected: 'Medium' },
      { offset: 0x1006, raw: 0x02, structId: 'micSensitivity', field: 'sensitivity', expected: 'Low' },
      { offset: 0x1008, raw: 0x00, structId: 'ssbHighCut', field: 'cutoff', expected: '2.2kHz' },
      { offset: 0x1008, raw: 0x01, structId: 'ssbHighCut', field: 'cutoff', expected: '2.4kHz' },
      { offset: 0x1008, raw: 0x02, structId: 'ssbHighCut', field: 'cutoff', expected: '2.6kHz' },
      { offset: 0x1008, raw: 0x03, structId: 'ssbHighCut', field: 'cutoff', expected: '2.8kHz' },
      { offset: 0x1008, raw: 0x04, structId: 'ssbHighCut', field: 'cutoff', expected: '3.0kHz' },
      { offset: 0x1024, raw: 0x01, structId: 'cwPitch', field: 'pitch', expected: '500Hz' },
      { offset: 0x1024, raw: 0x04, structId: 'cwPitch', field: 'pitch', expected: '800Hz' },
      { offset: 0x1024, raw: 0x06, structId: 'cwPitch', field: 'pitch', expected: '1000Hz' },
      { offset: 0x1030, raw: 0, structId: 'recallMethod', field: 'method', expected: 'All Bands' },
      { offset: 0x1030, raw: 1, structId: 'recallMethod', field: 'method', expected: 'Current Band' },
      { offset: 0x1032, raw: 1, structId: 'txMonitor', field: 'monitor', expected: 'true' },
      { offset: 0x1032, raw: 0, structId: 'txMonitor', field: 'monitor', expected: 'false' },
      { offset: 0x1062, raw: 0x00, structId: 'lcdBrightness', field: 'brightness', expected: 'Low' },
      { offset: 0x1062, raw: 0x01, structId: 'lcdBrightness', field: 'brightness', expected: 'Medium' },
      { offset: 0x1062, raw: 0x02, structId: 'lcdBrightness', field: 'brightness', expected: 'High' },
      { offset: 0x107f, raw: 0x00, structId: 'cursorShift', field: 'delay', expected: 'Off' },
      { offset: 0x107f, raw: 0x01, structId: 'cursorShift', field: 'delay', expected: '1.0s' },
      { offset: 0x107f, raw: 0x02, structId: 'cursorShift', field: 'delay', expected: '1.5s' },
      { offset: 0x107f, raw: 0x03, structId: 'cursorShift', field: 'delay', expected: '2.0s' },
      { offset: 0x1085, raw: 0, structId: 'dtmfKeysLock', field: 'locked', expected: 'false' },
      { offset: 0x1085, raw: 1, structId: 'dtmfKeysLock', field: 'locked', expected: 'true' },
      { offset: 0x1088, raw: 0x00, structId: 'speedDistance', field: 'unit', expected: 'mi/h' },
      { offset: 0x1088, raw: 0x01, structId: 'speedDistance', field: 'unit', expected: 'km/h' },
      { offset: 0x1088, raw: 0x02, structId: 'speedDistance', field: 'unit', expected: 'knots' },
    ];

    for (const sample of confirmed) {
      contents[sample.offset] = sample.raw;
      const settings = asRecord(codec.decode({ contents, radioModel: modelId }).settings);
      expect(String(asRecord(settings[sample.structId])[sample.field])).toBe(sample.expected);
    }

    // 0x02 used to be unmapped and encode rewrote it as Low.
    contents[0x1062] = 0x02;
    const highBrightness = codec.decode({ contents, radioModel: modelId });
    expect(asRecord(asRecord(highBrightness.settings).lcdBrightness).brightness).toBe('High');
    const encodedHigh = codec.encode(highBrightness, { contents: Uint8Array.from(contents), radioModel: modelId });
    expect(encodedHigh.contents[0x1062]).toBe(0x02);

    // 500, 800, and 1000 Hz are measured. The other pitches follow that confirmed 100 Hz pattern from 400 Hz at 0x00.
    const cwPitchPattern = [
      { raw: 0x00, expected: '400Hz' },
      { raw: 0x02, expected: '600Hz' },
      { raw: 0x03, expected: '700Hz' },
      { raw: 0x05, expected: '900Hz' },
    ];

    for (const step of cwPitchPattern) {
      contents[0x1024] = step.raw;
      const settings = asRecord(codec.decode({ contents, radioModel: modelId }).settings);
      expect(asRecord(settings.cwPitch).pitch).toBe(step.expected);
    }
  });

  it('encodes and decodes the measured TX/RX menu bytes', () => {
    const codec = createMemoryMapCodec({
      radioModel: modelId,
      memoryMap,
      memoryConfig,
      logger: new MockLogLayer(),
    });
    const contents = new Uint8Array(500480).fill(0xff);
    contents.fill(0x20, 0x14800, 0x14800 + 30 * 16);
    for (const offset of [0x1001, 0x1003, 0x1006, 0x1008, 0x1009, 0x100a, 0x100c, 0x100d, 0x100e, 0x100f, 0x1018, 0x1024, 0x1030, 0x1032, 0x1060, 0x1062, 0x1071, 0x1076, 0x1077, 0x107f, 0x1085, 0x1088]) {
      contents[offset] = 0;
    }

    const samples: Array<{ offset: number; raw: number; structId: string; field: string; expected: string }> = [
      { offset: 0x1009, raw: 0, structId: 'cwWidth', field: 'width', expected: '0.3kHz' },
      { offset: 0x1009, raw: 1, structId: 'cwWidth', field: 'width', expected: '0.5kHz' },
      { offset: 0x1009, raw: 2, structId: 'cwWidth', field: 'width', expected: '1.0kHz' },
      { offset: 0x1009, raw: 3, structId: 'cwWidth', field: 'width', expected: '1.5kHz' },
      { offset: 0x1009, raw: 4, structId: 'cwWidth', field: 'width', expected: '2.0kHz' },
      { offset: 0x100a, raw: 0, structId: 'amHighCut', field: 'cutoff', expected: '3.0kHz' },
      { offset: 0x100a, raw: 1, structId: 'amHighCut', field: 'cutoff', expected: '4.5kHz' },
      { offset: 0x100a, raw: 2, structId: 'amHighCut', field: 'cutoff', expected: '6.0kHz' },
      { offset: 0x100a, raw: 3, structId: 'amHighCut', field: 'cutoff', expected: '7.5kHz' },
      { offset: 0x100d, raw: 0, structId: 'digitalScanResume', field: 'resume', expected: 'Time' },
      { offset: 0x100d, raw: 1, structId: 'digitalScanResume', field: 'resume', expected: 'Carrier' },
      { offset: 0x100d, raw: 2, structId: 'digitalScanResume', field: 'resume', expected: 'Seek' },
      { offset: 0x100e, raw: 1, structId: 'timeRestart', field: 'seconds', expected: '1' },
      { offset: 0x100e, raw: 5, structId: 'timeRestart', field: 'seconds', expected: '5' },
      { offset: 0x100e, raw: 10, structId: 'timeRestart', field: 'seconds', expected: '10' },
      { offset: 0x100f, raw: 1, structId: 'carrierRestart', field: 'seconds', expected: '1' },
      { offset: 0x100f, raw: 2, structId: 'carrierRestart', field: 'seconds', expected: '2' },
      { offset: 0x100f, raw: 10, structId: 'carrierRestart', field: 'seconds', expected: '10' },
      { offset: 0x1018, raw: 0, structId: 'autoOffset', field: 'enabled', expected: 'false' },
      { offset: 0x1018, raw: 1, structId: 'autoOffset', field: 'enabled', expected: 'true' },
    ];

    for (const sample of samples) {
      contents[sample.offset] = sample.raw;
      const decoded = codec.decode({ contents, radioModel: modelId });
      const settings = asRecord(decoded.settings);
      expect(String(asRecord(settings[sample.structId])[sample.field])).toBe(sample.expected);

      const encoded = codec.encode(decoded, { contents: Uint8Array.from(contents), radioModel: modelId });
      expect(encoded.contents[sample.offset]).toBe(sample.raw);
    }

    contents[0x1018] = 1;
    const on = codec.decode({ contents, radioModel: modelId });
    const turnedOff = codec.encode(
      {
        ...on,
        settings: {
          ...on.settings,
          autoOffset: { enabled: false },
        },
      },
      { contents: Uint8Array.from(contents), radioModel: modelId },
    );
    expect(turnedOff.contents[0x1018]).toBe(0);
    expect(turnedOff.contents[0x38c]).toBe(0xff);
  });

  it('encodes and decodes the measured APRS menu bytes', () => {
    const codec = createMemoryMapCodec({
      radioModel: modelId,
      memoryMap,
      memoryConfig,
      logger: new MockLogLayer(),
    });
    const contents = new Uint8Array(500480).fill(0xff);
    contents.fill(0x20, 0x14800, 0x14800 + 30 * 16);
    for (const offset of [0x1001, 0x1003, 0x1006, 0x1008, 0x1009, 0x100a, 0x100c, 0x100d, 0x100e, 0x100f, 0x1018, 0x1024, 0x1030, 0x1032, 0x1060, 0x1062, 0x1071, 0x1076, 0x1077, 0x107f, 0x1085, 0x1088, 0x1213, 0x1363, 0x1364, 0x1365, 0x1366]) {
      contents[offset] = 0;
    }
    contents.fill(0, 0x1367, 0x1369);
    contents.fill(0, 0x183b, 0x183b + 35);

    const samples: Array<{ offset: number; raw: number; structId: string; field: string; expected: string }> = [
      { offset: 0x1363, raw: 0, structId: 'aprsShiftOffset', field: 'enabled', expected: 'false' },
      { offset: 0x1363, raw: 1, structId: 'aprsShiftOffset', field: 'enabled', expected: 'true' },
      { offset: 0x1364, raw: 0, structId: 'aprsQsyLimit', field: 'distance', expected: 'Off' },
      { offset: 0x1364, raw: 1, structId: 'aprsQsyLimit', field: 'distance', expected: '10 mi' },
      { offset: 0x1364, raw: 246, structId: 'aprsQsyLimit', field: 'distance', expected: '2460 mi' },
      { offset: 0x1364, raw: 250, structId: 'aprsQsyLimit', field: 'distance', expected: '2500 mi' },
      { offset: 0x1370, raw: 1, structId: 'aprsSlowRate', field: 'minutes', expected: '1' },
      { offset: 0x1370, raw: 30, structId: 'aprsSlowRate', field: 'minutes', expected: '30' },
      { offset: 0x1370, raw: 100, structId: 'aprsSlowRate', field: 'minutes', expected: '100' },
      { offset: 0x1213, raw: 0, structId: 'aprsWaypointFormat', field: 'format', expected: 'NMEA' },
      { offset: 0x1213, raw: 1, structId: 'aprsWaypointFormat', field: 'format', expected: 'MAGELLAN' },
      { offset: 0x1213, raw: 2, structId: 'aprsWaypointFormat', field: 'format', expected: 'KENWOOD' },
      { offset: 0x1365, raw: 0, structId: 'aprsPositionLimit', field: 'distance', expected: 'Off' },
      { offset: 0x1365, raw: 248, structId: 'aprsPositionLimit', field: 'distance', expected: '2480 mi' },
      { offset: 0x1365, raw: 250, structId: 'aprsPositionLimit', field: 'distance', expected: '2500 mi' },
    ];

    for (const sample of samples) {
      contents[sample.offset] = sample.raw;
      const decoded = codec.decode({ contents, radioModel: modelId });
      const settings = asRecord(decoded.settings);
      expect(String(asRecord(settings[sample.structId])[sample.field])).toBe(sample.expected);
      const encoded = codec.encode(decoded, { contents: Uint8Array.from(contents), radioModel: modelId });
      expect(encoded.contents[sample.offset]).toBe(sample.raw);
    }

    const iconField = memoryMap.structs.find((struct) => struct.id === 'aprsIcon')?.fields[0];
    const iconChoices = (iconField?.value as { choices?: Array<{ label: string; value: string }> } | undefined)?.choices ?? [];
    expect(iconField?.ui?.widget).toBe('select');
    expect(iconChoices.length).toBeGreaterThanOrEqual(60);
    expect(iconChoices.find((choice) => choice.label === 'Radio')?.value).toBe('\\Y');
    expect(iconChoices.find((choice) => choice.label === 'RV')?.value).toBe('/R');
    expect(new Set(iconChoices.map((choice) => choice.value)).size).toBe(iconChoices.length);

    contents[0x1367] = '\\'.charCodeAt(0);
    contents[0x1368] = 'Y'.charCodeAt(0);
    const radioIcon = codec.decode({ contents, radioModel: modelId });
    expect(asRecord(asRecord(radioIcon.settings).aprsIcon).symbol).toBe('\\Y');
    contents[0x1367] = '/'.charCodeAt(0);
    contents[0x1368] = 'R'.charCodeAt(0);
    const rvIcon = codec.decode({ contents, radioModel: modelId });
    expect(asRecord(asRecord(rvIcon.settings).aprsIcon).symbol).toBe('/R');
    const customIcon = codec.encode(
      {
        ...rvIcon,
        settings: { ...rvIcon.settings, aprsIcon: { symbol: 'Z9' } },
      },
      { contents: Uint8Array.from(contents), radioModel: modelId },
    );
    expect(Buffer.from(customIcon.contents.subarray(0x1367, 0x1369)).toString('ascii')).toBe('Z9');

    for (const choice of iconChoices) {
      const chosen = codec.encode(
        {
          ...rvIcon,
          settings: { ...rvIcon.settings, aprsIcon: { symbol: choice.value } },
        },
        { contents: Uint8Array.from(contents), radioModel: modelId },
      );
      expect(Buffer.from(chosen.contents.subarray(0x1367, 0x1369)).toString('ascii')).toBe(choice.value);
    }

    contents[0x1366] = 0x7f;
    const allFilters = codec.decode({ contents, radioModel: modelId });
    expect(asRecord(allFilters.settings).aprsFilterType).toMatchObject({
      weather: true,
      digipeater: true,
      mobile: true,
      object: true,
      navitra: true,
      oneWay: true,
      others: true,
    });
    const filtered = codec.encode(
      {
        ...allFilters,
        settings: {
          ...allFilters.settings,
          aprsFilterType: {
            weather: true,
            digipeater: true,
            mobile: false,
            object: true,
            navitra: true,
            oneWay: false,
            others: true,
          },
        },
      },
      { contents: Uint8Array.from(contents), radioModel: modelId },
    );
    // Mobile is 0x04 and 1-WAY is 0x20. Both off: 0x7F & ~0x24 = 0x5B.
    expect(filtered.contents[0x1366]).toBe(0x5b);
    contents[0x1366] = 0xff;
    const withHighBit = codec.decode({ contents, radioModel: modelId });
    const keptHighBit = codec.encode(withHighBit, { contents: Uint8Array.from(contents), radioModel: modelId });
    expect(keptHighBit.contents[0x1366]).toBe(0xff);

    contents.fill(0, 0x183b, 0x183b + 35);
    const emptyBulletin = codec.decode({ contents, radioModel: modelId });
    expect(asRecord(asRecord(emptyBulletin.settings).aprsBulletinGroup).codes).toBe('');
    const writtenBulletin = codec.encode(
      {
        ...emptyBulletin,
        settings: { ...emptyBulletin.settings, aprsBulletinGroup: { codes: 'CQ,BLN1' } },
      },
      { contents: Uint8Array.from(contents), radioModel: modelId },
    );
    expect(Buffer.from(writtenBulletin.contents.subarray(0x183b, 0x183b + 7)).toString('ascii')).toBe('CQ,BLN1');
    expect([...writtenBulletin.contents.subarray(0x183b + 7, 0x183b + 35)].every((byte) => byte === 0)).toBe(true);
    expect(writtenBulletin.contents[0x38c]).toBe(0xff);
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
    for (const offset of [0x1001, 0x1003, 0x1006, 0x1008, 0x1009, 0x100a, 0x100c, 0x100d, 0x1018, 0x1024, 0x1030, 0x1032, 0x1060, 0x1062, 0x1071, 0x1076, 0x1077, 0x107f, 0x1085, 0x1088, 0x1213, 0x1363, 0x1364, 0x1365]) {
      contents[offset] = 0;
    }
    contents.fill(0, 0x1367, 0x1369);
    contents.fill(0, 0x183b, 0x183b + 35);

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
