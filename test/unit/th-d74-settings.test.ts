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
    expect(version).toBe('1.21.0');
    expect(memoryMap.version).toBe('1.7.0');
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
    expect(seen.get(505)).toBe('APRS');
    expect(seen.get(506)).toBe('APRS');
    expect(seen.get(507)).toBe('APRS');
    expect(seen.get(508)).toBe('APRS');
    expect(seen.get(509)).toBe('APRS');
    expect(seen.get(510)).toBe('APRS');
    expect(seen.get(511)).toBe('APRS');
    expect(seen.get(512)).toBe('APRS');
    expect(seen.get(513)).toBe('APRS');
    expect(seen.get(514)).toBe('APRS');
    expect(seen.get(515)).toBe('APRS');
    expect(seen.get(551)).toBe('APRS');
    expect(seen.get(101)).toBe('TX/RX');
    expect(seen.get(180)).toBe('TX/RX');
    expect(seen.has(104)).toBe(false);
    expect(seen.has(516)).toBe(false);
    expect(seen.size).toBe(57);
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
    for (const offset of [0x1000, 0x1001, 0x1003, 0x1006, 0x1008, 0x1009, 0x100a, 0x100c, 0x100d, 0x100e, 0x100f, 0x1012, 0x1018, 0x1019, 0x101a, 0x101b, 0x101c, 0x101d, 0x101e, 0x101f, 0x1020, 0x1021, 0x1024, 0x1026, 0x1027, 0x1030, 0x1032, 0x1060, 0x1062, 0x1071, 0x1076, 0x1077, 0x107f, 0x1085, 0x1088]) {
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
    for (const offset of [0x1000, 0x1001, 0x1003, 0x1006, 0x1008, 0x1009, 0x100a, 0x100c, 0x100d, 0x100e, 0x100f, 0x1012, 0x1018, 0x1019, 0x101a, 0x101b, 0x101c, 0x101d, 0x101e, 0x101f, 0x1020, 0x1021, 0x1024, 0x1026, 0x1027, 0x1030, 0x1032, 0x1060, 0x1062, 0x1071, 0x1076, 0x1077, 0x107f, 0x1085, 0x1088, 0x1213, 0x1363, 0x1364, 0x1365, 0x1366]) {
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

  it('round-trips each measured TX/RX byte from the latest image diffs', () => {
    const codec = createMemoryMapCodec({
      radioModel: modelId,
      memoryMap,
      memoryConfig,
      logger: new MockLogLayer(),
    });
    const contents = new Uint8Array(500480).fill(0xff);
    contents.fill(0x20, 0x14800, 0x14800 + 30 * 16);
    for (const offset of [0x1000, 0x1001, 0x1003, 0x1006, 0x1008, 0x1009, 0x100a, 0x100c, 0x100d, 0x100e, 0x100f, 0x1012, 0x1018, 0x1019, 0x101a, 0x101b, 0x101c, 0x101d, 0x101e, 0x101f, 0x1020, 0x1021, 0x1024, 0x1026, 0x1027, 0x1030, 0x1032, 0x1060, 0x1062, 0x1071, 0x1076, 0x1077, 0x107f, 0x1085, 0x1088]) {
      contents[offset] = 0;
    }

    const samples: Array<{ offset: number; raw: number; structId: string; field: string; expected: string }> = [
      { offset: 0x1000, raw: 0, structId: 'beatShift', field: 'type', expected: 'Type 1' },
      { offset: 0x1000, raw: 7, structId: 'beatShift', field: 'type', expected: 'Type 8' },
      { offset: 0x1012, raw: 0, structId: 'scanAutoBacklight', field: 'enabled', expected: 'false' },
      { offset: 0x1012, raw: 1, structId: 'scanAutoBacklight', field: 'enabled', expected: 'true' },
      { offset: 0x1019, raw: 0, structId: 'callKey', field: 'mode', expected: 'CALL' },
      { offset: 0x1019, raw: 1, structId: 'callKey', field: 'mode', expected: '1750Hz' },
      { offset: 0x101a, raw: 0, structId: 'tone1750Hold', field: 'enabled', expected: 'false' },
      { offset: 0x101a, raw: 1, structId: 'tone1750Hold', field: 'enabled', expected: 'true' },
      { offset: 0x101b, raw: 0, structId: 'vox', field: 'enabled', expected: 'false' },
      { offset: 0x101b, raw: 1, structId: 'vox', field: 'enabled', expected: 'true' },
      { offset: 0x101c, raw: 0, structId: 'voxGain', field: 'gain', expected: '0' },
      { offset: 0x101c, raw: 9, structId: 'voxGain', field: 'gain', expected: '9' },
      { offset: 0x101d, raw: 0, structId: 'voxDelay', field: 'delay', expected: '250ms' },
      { offset: 0x101d, raw: 3, structId: 'voxDelay', field: 'delay', expected: '1000ms' },
      { offset: 0x101d, raw: 6, structId: 'voxDelay', field: 'delay', expected: '3000ms' },
      { offset: 0x101e, raw: 0, structId: 'txOnBusy', field: 'enabled', expected: 'false' },
      { offset: 0x101e, raw: 1, structId: 'txOnBusy', field: 'enabled', expected: 'true' },
      { offset: 0x101f, raw: 0, structId: 'dtmfSpeed', field: 'speed', expected: '50ms' },
      { offset: 0x101f, raw: 1, structId: 'dtmfSpeed', field: 'speed', expected: '100ms' },
      { offset: 0x101f, raw: 2, structId: 'dtmfSpeed', field: 'speed', expected: '150ms' },
      { offset: 0x1020, raw: 0, structId: 'dtmfPause', field: 'pause', expected: '100ms' },
      { offset: 0x1020, raw: 4, structId: 'dtmfPause', field: 'pause', expected: '1000ms' },
      { offset: 0x1020, raw: 6, structId: 'dtmfPause', field: 'pause', expected: '2000ms' },
      { offset: 0x1021, raw: 0, structId: 'dtmfHold', field: 'enabled', expected: 'false' },
      { offset: 0x1021, raw: 1, structId: 'dtmfHold', field: 'enabled', expected: 'true' },
      { offset: 0x1026, raw: 0, structId: 'cwReverse', field: 'mode', expected: 'Normal' },
      { offset: 0x1026, raw: 1, structId: 'cwReverse', field: 'mode', expected: 'Reverse' },
      { offset: 0x1027, raw: 0, structId: 'qsoLog', field: 'enabled', expected: 'false' },
      { offset: 0x1027, raw: 1, structId: 'qsoLog', field: 'enabled', expected: 'true' },
    ];

    for (const sample of samples) {
      contents[sample.offset] = sample.raw;
      const decoded = codec.decode({ contents, radioModel: modelId });
      const settings = asRecord(decoded.settings);
      expect(String(asRecord(settings[sample.structId])[sample.field]), `${sample.structId}.${sample.field}`).toBe(sample.expected);
      const encoded = codec.encode(decoded, { contents: Uint8Array.from(contents), radioModel: modelId });
      expect(encoded.contents[sample.offset]).toBe(sample.raw);
      expect(encoded.contents[0x38c]).toBe(0xff);
    }

    const menus = new Set(samples.map((sample) => sample.structId));
    expect(menus.size).toBe(13);
  });

  it('encodes and decodes measured APRS menus 505 through 509', () => {
    const codec = createMemoryMapCodec({
      radioModel: modelId,
      memoryMap,
      memoryConfig,
      logger: new MockLogLayer(),
    });
    const contents = new Uint8Array(500480).fill(0xff);
    contents.fill(0x20, 0x14800, 0x14800 + 30 * 16);
    for (const offset of [0x1000, 0x1001, 0x1003, 0x1006, 0x1008, 0x1009, 0x100a, 0x100c, 0x100d, 0x100e, 0x100f, 0x1012, 0x1018, 0x1019, 0x101a, 0x101b, 0x101c, 0x101d, 0x101e, 0x101f, 0x1020, 0x1021, 0x1024, 0x1026, 0x1027, 0x1030, 0x1032, 0x1060, 0x1062, 0x1071, 0x1076, 0x1077, 0x107f, 0x1085, 0x1088, 0x120b, 0x120c, 0x120d, 0x120f, 0x1213, 0x1363, 0x1364, 0x1365]) {
      contents[offset] = 0;
    }
    contents.fill(0, 0x1367, 0x1369);
    contents.fill(0, 0x183b, 0x183b + 35);
    contents[0x1209] = 0x3c;
    contents[0x120e] = 0x5a;

    const samples: Array<{ offset: number; raw: number; structId: string; field: string; expected: string }> = [
      { offset: 0x120c, raw: 0, structId: 'aprsDataSpeed', field: 'speed', expected: '1200 bps' },
      { offset: 0x120c, raw: 1, structId: 'aprsDataSpeed', field: 'speed', expected: '9600 bps' },
      { offset: 0x120b, raw: 0, structId: 'aprsDataBand', field: 'band', expected: 'Band A' },
      { offset: 0x120b, raw: 1, structId: 'aprsDataBand', field: 'band', expected: 'Band B' },
      { offset: 0x120d, raw: 0, structId: 'aprsDcdSense', field: 'sense', expected: 'Busy' },
      { offset: 0x120d, raw: 1, structId: 'aprsDcdSense', field: 'sense', expected: 'Detect Data' },
      { offset: 0x120d, raw: 2, structId: 'aprsDcdSense', field: 'sense', expected: 'Off' },
      { offset: 0x120f, raw: 0, structId: 'aprsTxDelay', field: 'delay', expected: '100ms' },
      { offset: 0x120f, raw: 1, structId: 'aprsTxDelay', field: 'delay', expected: '150ms' },
      { offset: 0x120f, raw: 2, structId: 'aprsTxDelay', field: 'delay', expected: '200ms' },
      { offset: 0x120f, raw: 3, structId: 'aprsTxDelay', field: 'delay', expected: '300ms' },
      { offset: 0x120f, raw: 4, structId: 'aprsTxDelay', field: 'delay', expected: '400ms' },
      { offset: 0x120f, raw: 5, structId: 'aprsTxDelay', field: 'delay', expected: '500ms' },
      { offset: 0x120f, raw: 6, structId: 'aprsTxDelay', field: 'delay', expected: '750ms' },
      { offset: 0x120f, raw: 7, structId: 'aprsTxDelay', field: 'delay', expected: '1000ms' },
    ];

    for (const sample of samples) {
      contents[sample.offset] = sample.raw;
      const decoded = codec.decode({ contents, radioModel: modelId });
      const settings = asRecord(decoded.settings);
      expect(String(asRecord(settings[sample.structId])[sample.field]), `${sample.structId}.${sample.field}`).toBe(sample.expected);
      const encoded = codec.encode(decoded, { contents: Uint8Array.from(contents), radioModel: modelId });
      expect(encoded.contents[sample.offset]).toBe(sample.raw);
      expect(encoded.contents[0x1209]).toBe(0x3c);
      expect(encoded.contents[0x120e]).toBe(0x5a);
      expect(encoded.contents[0x38c]).toBe(0xff);
    }

    const lockCases: Array<{ raw: number; frequency: boolean; ptt: boolean; aprsKey: boolean }> = [
      { raw: 0xa8, frequency: false, ptt: false, aprsKey: false },
      { raw: 0xa9, frequency: true, ptt: false, aprsKey: false },
      { raw: 0xaa, frequency: false, ptt: true, aprsKey: false },
      { raw: 0xac, frequency: false, ptt: false, aprsKey: true },
      { raw: 0xaf, frequency: true, ptt: true, aprsKey: true },
      { raw: 0xff, frequency: true, ptt: true, aprsKey: true },
    ];

    for (const lockCase of lockCases) {
      contents[0x120a] = lockCase.raw;
      const decoded = codec.decode({ contents, radioModel: modelId });
      expect(asRecord(asRecord(decoded.settings).aprsLock)).toMatchObject({
        frequency: lockCase.frequency,
        ptt: lockCase.ptt,
        aprsKey: lockCase.aprsKey,
      });
      const encoded = codec.encode(decoded, { contents: Uint8Array.from(contents), radioModel: modelId });
      expect(encoded.contents[0x120a]).toBe(lockCase.raw);
      expect(encoded.contents[0x1209]).toBe(0x3c);
      expect(encoded.contents[0x120e]).toBe(0x5a);
    }

    contents[0x120a] = 0xa9;
    const frequencyOnly = codec.decode({ contents, radioModel: modelId });
    const withPtt = codec.encode(
      {
        ...frequencyOnly,
        settings: {
          ...frequencyOnly.settings,
          aprsLock: { frequency: true, ptt: true, aprsKey: false },
        },
      },
      { contents: Uint8Array.from(contents), radioModel: modelId },
    );
    // Frequency 0x01 and PTT 0x02, with the measured high bits 0xA8 left in place.
    expect(withPtt.contents[0x120a]).toBe(0xab);
    expect(withPtt.contents[0x1209]).toBe(0x3c);
    expect(withPtt.contents[0x120e]).toBe(0x5a);

    const cleared = codec.encode(
      {
        ...frequencyOnly,
        settings: {
          ...frequencyOnly.settings,
          aprsLock: { frequency: false, ptt: false, aprsKey: false },
        },
      },
      { contents: Uint8Array.from(contents), radioModel: modelId },
    );
    expect(cleared.contents[0x120a]).toBe(0xa8);
  });

  it('encodes and decodes measured APRS beacon menus 510 through 515', () => {
    const codec = createMemoryMapCodec({
      radioModel: modelId,
      memoryMap,
      memoryConfig,
      logger: new MockLogLayer(),
    });
    const contents = new Uint8Array(500480).fill(0xff);
    contents.fill(0x20, 0x14800, 0x14800 + 30 * 16);
    for (const offset of [0x1000, 0x1001, 0x1003, 0x1006, 0x1008, 0x1009, 0x100a, 0x100c, 0x100d, 0x100e, 0x100f, 0x1012, 0x1018, 0x1019, 0x101a, 0x101b, 0x101c, 0x101d, 0x101e, 0x101f, 0x1020, 0x1021, 0x1024, 0x1026, 0x1027, 0x1030, 0x1032, 0x1060, 0x1062, 0x1071, 0x1076, 0x1077, 0x107f, 0x1085, 0x1088, 0x120b, 0x120c, 0x120d, 0x120f, 0x1213, 0x1220, 0x1221, 0x1363, 0x1364, 0x1365, 0x136a, 0x136b, 0x136c, 0x136d]) {
      contents[offset] = 0;
    }
    contents.fill(0, 0x1367, 0x1369);
    contents.fill(0, 0x183b, 0x183b + 35);
    contents[0x038c] = 0x5a;
    contents[0x1369] = 0xa5;

    const samples: Array<{ offset: number; raw: number; structId: string; field: string; expected: string }> = [
      { offset: 0x136a, raw: 0, structId: 'aprsBeaconMethod', field: 'method', expected: 'Manual' },
      { offset: 0x136a, raw: 1, structId: 'aprsBeaconMethod', field: 'method', expected: 'PTT' },
      { offset: 0x136a, raw: 2, structId: 'aprsBeaconMethod', field: 'method', expected: 'Auto' },
      { offset: 0x136a, raw: 3, structId: 'aprsBeaconMethod', field: 'method', expected: 'SmartBeaconing' },
      { offset: 0x136b, raw: 0, structId: 'aprsInitialInterval', field: 'interval', expected: '0.2 min' },
      { offset: 0x136b, raw: 1, structId: 'aprsInitialInterval', field: 'interval', expected: '0.5 min' },
      { offset: 0x136b, raw: 2, structId: 'aprsInitialInterval', field: 'interval', expected: '1 min' },
      { offset: 0x136b, raw: 3, structId: 'aprsInitialInterval', field: 'interval', expected: '2 min' },
      { offset: 0x136b, raw: 4, structId: 'aprsInitialInterval', field: 'interval', expected: '3 min' },
      { offset: 0x136b, raw: 5, structId: 'aprsInitialInterval', field: 'interval', expected: '5 min' },
      { offset: 0x136b, raw: 6, structId: 'aprsInitialInterval', field: 'interval', expected: '10 min' },
      { offset: 0x136b, raw: 7, structId: 'aprsInitialInterval', field: 'interval', expected: '20 min' },
      { offset: 0x136b, raw: 8, structId: 'aprsInitialInterval', field: 'interval', expected: '30 min' },
      { offset: 0x136b, raw: 9, structId: 'aprsInitialInterval', field: 'interval', expected: '60 min' },
      { offset: 0x136c, raw: 0, structId: 'aprsDecayAlgorithm', field: 'enabled', expected: 'false' },
      { offset: 0x136c, raw: 1, structId: 'aprsDecayAlgorithm', field: 'enabled', expected: 'true' },
      { offset: 0x136d, raw: 0, structId: 'aprsProportionalPathing', field: 'enabled', expected: 'false' },
      { offset: 0x136d, raw: 1, structId: 'aprsProportionalPathing', field: 'enabled', expected: 'true' },
      { offset: 0x1220, raw: 0, structId: 'aprsBeaconSpeed', field: 'enabled', expected: 'false' },
      { offset: 0x1220, raw: 1, structId: 'aprsBeaconSpeed', field: 'enabled', expected: 'true' },
      { offset: 0x1221, raw: 0, structId: 'aprsBeaconAltitude', field: 'enabled', expected: 'false' },
      { offset: 0x1221, raw: 1, structId: 'aprsBeaconAltitude', field: 'enabled', expected: 'true' },
    ];

    for (const sample of samples) {
      contents[sample.offset] = sample.raw;
      const decoded = codec.decode({ contents, radioModel: modelId });
      const settings = asRecord(decoded.settings);
      expect(String(asRecord(settings[sample.structId])[sample.field]), `${sample.structId}.${sample.field}`).toBe(sample.expected);
      const encoded = codec.encode(decoded, { contents: Uint8Array.from(contents), radioModel: modelId });
      expect(encoded.contents[sample.offset]).toBe(sample.raw);
      expect(encoded.contents[0x038c]).toBe(0x5a);
      expect(encoded.contents[0x1369]).toBe(0xa5);
    }

    contents[0x136b] = 6;
    const tenMinutes = codec.decode({ contents, radioModel: modelId });
    const oneMinute = codec.encode(
      {
        ...tenMinutes,
        settings: {
          ...tenMinutes.settings,
          aprsInitialInterval: { interval: '1 min' },
        },
      },
      { contents: Uint8Array.from(contents), radioModel: modelId },
    );
    expect(oneMinute.contents[0x136b]).toBe(2);
    expect(oneMinute.contents[0x038c]).toBe(0x5a);
    expect(oneMinute.contents[0x1369]).toBe(0xa5);
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
    for (const offset of [0x1000, 0x1001, 0x1003, 0x1006, 0x1008, 0x1009, 0x100a, 0x100c, 0x100d, 0x1012, 0x1018, 0x1019, 0x101a, 0x101b, 0x101c, 0x101d, 0x101e, 0x101f, 0x1020, 0x1021, 0x1024, 0x1026, 0x1027, 0x1030, 0x1032, 0x1060, 0x1062, 0x1071, 0x1076, 0x1077, 0x107f, 0x1085, 0x1088, 0x120b, 0x120c, 0x120d, 0x120f, 0x1213, 0x1220, 0x1221, 0x1363, 0x1364, 0x1365, 0x136a, 0x136b, 0x136c, 0x136d]) {
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
