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
    expect(memoryMap.version).toBe('1.7.1');
  });

  it('names each menu setting with the radio category and group', () => {
    function place(menu: number): { section: string; order: number; subgroup: string; label: string } {
      const rows: Array<{ from: number; to: number; section: string; order: number; subgroup: string; label: string }> = [
        { from: 100, to: 105, section: 'TX/RX', order: 1, subgroup: 'rx', label: 'RX' },
        { from: 110, to: 119, section: 'TX/RX', order: 1, subgroup: 'tx', label: 'TX' },
        { from: 120, to: 129, section: 'TX/RX', order: 1, subgroup: 'rx-filter', label: 'RX Filter' },
        { from: 130, to: 139, section: 'TX/RX', order: 1, subgroup: 'scan', label: 'Scan' },
        { from: 140, to: 149, section: 'TX/RX', order: 1, subgroup: 'repeater', label: 'Repeater' },
        { from: 150, to: 159, section: 'TX/RX', order: 1, subgroup: 'vox', label: 'VOX' },
        { from: 160, to: 169, section: 'TX/RX', order: 1, subgroup: 'dtmf', label: 'DTMF' },
        { from: 170, to: 179, section: 'TX/RX', order: 1, subgroup: 'cw', label: 'CW' },
        { from: 180, to: 189, section: 'TX/RX', order: 1, subgroup: 'others', label: 'Others' },
        { from: 200, to: 209, section: 'Memory', order: 2, subgroup: 'memory-channel', label: 'Memory Channel' },
        { from: 310, to: 319, section: 'Audio File', order: 3, subgroup: 'voice-message', label: 'Voice Message' },
        { from: 500, to: 509, section: 'APRS', order: 5, subgroup: 'basic-settings', label: 'Basic Settings' },
        { from: 510, to: 516, section: 'APRS', order: 5, subgroup: 'beacon-tx', label: 'Beacon TX Control' },
        { from: 520, to: 529, section: 'APRS', order: 5, subgroup: 'qsy', label: 'QSY Information' },
        { from: 530, to: 539, section: 'APRS', order: 5, subgroup: 'smartbeaconing', label: 'SmartBeaconing' },
        { from: 540, to: 549, section: 'APRS', order: 5, subgroup: 'waypoint', label: 'Waypoint' },
        { from: 550, to: 559, section: 'APRS', order: 5, subgroup: 'packet-filter', label: 'Packet Filter' },
        { from: 580, to: 589, section: 'APRS', order: 5, subgroup: 'others', label: 'Others' },
        { from: 610, to: 619, section: 'Digital', order: 6, subgroup: 'tx-rx', label: 'TX/RX' },
        { from: 900, to: 909, section: 'Configuration', order: 9, subgroup: 'display', label: 'Display' },
        { from: 910, to: 919, section: 'Configuration', order: 9, subgroup: 'audio', label: 'Audio' },
        { from: 920, to: 929, section: 'Configuration', order: 9, subgroup: 'battery', label: 'Battery' },
        { from: 940, to: 949, section: 'Configuration', order: 9, subgroup: 'auxiliary', label: 'Auxiliary' },
        { from: 960, to: 969, section: 'Configuration', order: 9, subgroup: 'lock', label: 'Lock' },
        { from: 970, to: 979, section: 'Configuration', order: 9, subgroup: 'units', label: 'Units' },
      ];
      const match = rows.find((row) => menu >= row.from && menu <= row.to);
      if (!match) {
        throw new Error(`unmapped menu ${menu}`);
      }
      return match;
    }

    const declared = new Map<string, Map<string, string>>();
    for (const group of memoryMap.groups ?? []) {
      const nested = new Map<string, string>();
      for (const subgroup of group.groups ?? []) {
        nested.set(subgroup.id, subgroup.label);
      }
      declared.set(group.id, nested);
    }

    const subgroupMenus = new Map<string, number>();
    const seen = new Map<number, string>();
    let previousMenu = 0;

    for (const struct of memoryMap.structs) {
      const menus = struct.fields
        .map((field) => (field.ui as { menu?: { number: number } } | undefined)?.menu?.number)
        .filter((menu): menu is number => typeof menu === 'number');

      if (menus.length > 0) {
        const menu = Math.min(...menus);
        expect(menu, struct.id).toBeGreaterThanOrEqual(previousMenu);
        previousMenu = menu;
      }

      for (const field of struct.fields) {
        const ui = field.ui as { section?: string; sectionOrder?: number; subgroup?: string; menu?: { number: number }; group?: string; order?: number } | undefined;

        if (!ui) {
          continue;
        }

        if (struct.id === 'groupNames') {
          expect(ui.group).toBe('memory');
          expect(ui.section).toBe('Memory');
          expect(ui.sectionOrder).toBe(2);
          expect(ui.subgroup).toBeUndefined();
          expect(ui.menu).toBeUndefined();
          continue;
        }

        if (ui.group === 'channel' || ui.menu === undefined) {
          expect(ui.section).toBeUndefined();
          expect(ui.sectionOrder).toBeUndefined();
          continue;
        }

        const expected = place(ui.menu.number);
        expect(ui.section, `${struct.id}.${field.id}`).toBe(expected.section);
        expect(ui.sectionOrder, `${struct.id}.${field.id}`).toBe(expected.order);
        expect(ui.subgroup, `${struct.id}.${field.id}`).toBe(expected.subgroup);
        expect(declared.get(ui.group)?.get(ui.subgroup ?? ''), `${struct.id}.${field.id}`).toBe(expected.label);
        expect(ui.order, `${struct.id}.${field.id}`).toBeGreaterThanOrEqual(ui.menu.number * 100);
        const firstMenu = subgroupMenus.get(`${ui.group}/${ui.subgroup}`);
        if (firstMenu === undefined || ui.menu.number < firstMenu) {
          subgroupMenus.set(`${ui.group}/${ui.subgroup}`, ui.menu.number);
        }
        seen.set(ui.menu.number, `${ui.section} / ${expected.label}`);
      }
    }

    for (const group of memoryMap.groups ?? []) {
      let previous = 0;
      for (const subgroup of group.groups ?? []) {
        const menu = subgroupMenus.get(`${group.id}/${subgroup.id}`);
        expect(menu, `${group.id}/${subgroup.id}`).toBeTypeOf('number');
        expect(menu ?? 0, subgroup.label).toBeGreaterThan(previous);
        previous = menu ?? 0;
      }
    }

    expect(seen.get(101)).toBe('TX/RX / RX');
    expect(seen.get(141)).toBe('TX/RX / Repeater');
    expect(seen.get(180)).toBe('TX/RX / Others');
    expect(seen.get(500)).toBe('APRS / Basic Settings');
    expect(seen.get(510)).toBe('APRS / Beacon TX Control');
    expect(seen.get(516)).toBe('APRS / Beacon TX Control');
    expect(seen.get(522)).toBe('APRS / QSY Information');
    expect(seen.get(551)).toBe('APRS / Packet Filter');
    expect(seen.get(585)).toBe('APRS / Others');
    expect(seen.get(610)).toBe('Digital / TX/RX');
    expect(seen.get(903)).toBe('Configuration / Display');
    expect(seen.has(104)).toBe(false);
    expect(seen.size).toBe(58);
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

  it('groups menu 516 objects for the settings layout', () => {
    const expectedOrder = [
      ['name', 51601],
      ['type', 51602],
      ['method', 51603],
      ['latitudeDegrees', 51604],
      ['latitudeMinutes', 51605],
      ['latitudeFraction', 51606],
      ['longitudeDegrees', 51607],
      ['longitudeMinutes', 51608],
      ['longitudeFraction', 51609],
      ['icon', 51610],
      ['comment', 51611],
    ] as const;

    for (const index of [1, 2, 3]) {
      const struct = memoryMap.structs.find((entry) => entry.id === `aprsObject${index}`);
      expect(struct?.seek).toBe(`0x${(0x1900 + (index - 1) * 0x40).toString(16).toUpperCase()}`);
      expect(struct?.count).toBeUndefined();
      expect(struct?.fields.some((field) => field.id === '_hemisphere' && field.reserved === true)).toBe(true);

      const visible = (struct?.fields ?? []).filter((field) => field.ui);
      const byOrder = [...visible].sort((left, right) => (left.ui?.order ?? 0) - (right.ui?.order ?? 0));
      expect(byOrder.map((field) => [field.id, field.ui?.order])).toEqual(expectedOrder.map(([id, order]) => [id, order]));
      expect(byOrder.map((field) => field.ui?.label)).toEqual([
        'Name',
        'Type',
        'Method',
        'Latitude Degrees',
        'Latitude Minutes',
        'Latitude Fraction',
        'Longitude Degrees',
        'Longitude Minutes',
        'Longitude Fraction',
        'Icon',
        'Comment',
      ]);

      for (const field of visible) {
        expect(field.ui?.record).toEqual({ id: 'aprs-object', index, label: `Object ${index}` });
      }

      expect(visible.find((field) => field.id === 'latitudeFraction')?.ui?.composite).toEqual({
        id: `obj${index}-lat`,
        kind: 'coordinate',
        axis: 'lat',
        part: 'fraction',
        fractionScale: 10000,
        label: 'Latitude',
      });
      expect(visible.find((field) => field.id === 'longitudeDegrees')?.ui?.composite).toEqual({
        id: `obj${index}-lon`,
        kind: 'coordinate',
        axis: 'lon',
        part: 'degrees',
        fractionScale: 10000,
        label: 'Longitude',
      });
      expect(visible.find((field) => field.id === 'name')?.ui?.composite).toBeUndefined();
    }
  });

  it('encodes and decodes measured APRS menu 516 object bytes', () => {
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
    contents.fill(0, 0x1900, 0x19c0);
    contents[0x038c] = 0x5a;
    contents[0x19c0] = 0x5a;
    for (const base of [0x1900, 0x1940, 0x1980]) {
      contents[base + 0x08] = 0x0b;
      contents[base + 0x13] = 0x01;
      contents[base + 0x14] = '/'.charCodeAt(0);
      contents[base + 0x15] = 'E'.charCodeAt(0);
    }
    contents[0x1908] = 0xa5;

    const iconChoices = (memoryMap.structs.find((struct) => struct.id === 'aprsIcon')?.fields[0]?.value as { choices?: Array<{ label: string; value: string }> } | undefined)?.choices ?? [];
    for (const structId of ['aprsObject1', 'aprsObject2', 'aprsObject3']) {
      const objectIcon = memoryMap.structs.find((struct) => struct.id === structId)?.fields.find((field) => field.id === 'icon');
      const objectChoices = (objectIcon?.value as { choices?: Array<{ label: string; value: string }> } | undefined)?.choices ?? [];
      expect(objectChoices, structId).toEqual(iconChoices);
      expect(objectChoices.find((choice) => choice.label === 'Eyeball')?.value).toBe('/E');
      expect(objectChoices.find((choice) => choice.label === 'Satellite')?.value).toBe('\\S');
    }

    const factoryObject = {
      latitudeDegrees: 0,
      latitudeMinutes: 0,
      latitudeFraction: 0,
      longitudeDegrees: 0,
      longitudeMinutes: 0,
      longitudeFraction: 0,
      name: '',
      type: 'Live Object',
      method: 'Temp.',
      icon: '/E',
      comment: '',
    };
    const oldObject = codec.decode({ contents, radioModel: modelId });
    const oldSettings = asRecord(oldObject.settings);
    const oldObjects = [1, 2, 3].map((index) => asRecord(oldSettings[`aprsObject${index}`]));
    expect(oldObjects[0]).toMatchObject(factoryObject);
    expect(oldObjects[1]).toMatchObject(factoryObject);
    expect(oldObjects[2]).toMatchObject(factoryObject);
    const encodedOld = codec.encode(oldObject, { contents: Uint8Array.from(contents), radioModel: modelId });
    expect(encodedOld.contents[0x1908]).toBe(0xa5);
    expect(encodedOld.contents[0x1948]).toBe(0x0b);
    expect(encodedOld.contents[0x1988]).toBe(0x0b);
    expect(encodedOld.contents[0x038c]).toBe(0x5a);
    expect(encodedOld.contents[0x19c0]).toBe(0x5a);
    expect(encodedOld.contents.subarray(0x1900, 0x19c0)).toEqual(contents.subarray(0x1900, 0x19c0));

    const measured = Uint8Array.from(contents);
    const position = [0x1e, 0x0c, 0x48, 0x0d, 0x61, 0x2d, 0x2c, 0x1a];
    position.forEach((byte, index) => {
      measured[0x1900 + index] = byte;
    });
    measured[0x1908] = 0x00;
    Buffer.from('TESTOBJ1', 'ascii').copy(measured, 0x1909);
    measured[0x1911] = 0x00;
    measured[0x1912] = 0x01;
    measured[0x1913] = 0x00;
    measured[0x1914] = '\\'.charCodeAt(0);
    measured[0x1915] = 'S'.charCodeAt(0);
    Buffer.from('ABCD', 'ascii').copy(measured, 0x1916);

    const newObject = codec.decode({ contents: measured, radioModel: modelId });
    const newSettings = asRecord(newObject.settings);
    expect(asRecord(newSettings.aprsObject1)).toMatchObject({
      latitudeDegrees: 30,
      latitudeMinutes: 12,
      latitudeFraction: 3400,
      longitudeDegrees: 97,
      longitudeMinutes: 45,
      longitudeFraction: 6700,
      name: 'TESTOBJ1',
      type: 'Killed Object',
      method: 'Off',
      icon: '\\S',
      comment: 'ABCD',
    });
    expect(asRecord(newSettings.aprsObject2)).toMatchObject(factoryObject);
    expect(asRecord(newSettings.aprsObject3)).toMatchObject(factoryObject);
    const encodedNew = codec.encode(newObject, { contents: Uint8Array.from(measured), radioModel: modelId });
    expect(encodedNew.contents[0x1908]).toBe(0x00);
    expect(encodedNew.contents[0x1948]).toBe(0x0b);
    expect(encodedNew.contents[0x1988]).toBe(0x0b);
    expect(encodedNew.contents[0x19c0]).toBe(0x5a);
    expect(encodedNew.contents.subarray(0x1900, 0x19c0)).toEqual(measured.subarray(0x1900, 0x19c0));

    const rewritten = codec.encode(
      {
        ...oldObject,
        settings: {
          ...oldObject.settings,
          aprsObject1: {
            latitudeDegrees: 30,
            latitudeMinutes: 12,
            latitudeFraction: 3400,
            longitudeDegrees: 97,
            longitudeMinutes: 45,
            longitudeFraction: 6700,
            name: 'TESTOBJ1',
            type: 'Killed Object',
            method: 'Off',
            icon: '\\S',
            comment: 'ABCD',
          },
          aprsObject2: oldObjects[1],
          aprsObject3: {
            ...factoryObject,
            name: 'OBJ2',
          },
        },
      },
      { contents: Uint8Array.from(contents), radioModel: modelId },
    );
    expect(rewritten.contents[0x1908]).toBe(0xa5);
    expect(rewritten.contents[0x038c]).toBe(0x5a);
    expect(rewritten.contents[0x19c0]).toBe(0x5a);
    expect(rewritten.contents.subarray(0x1940, 0x1980)).toEqual(contents.subarray(0x1940, 0x1980));
    expect(Buffer.from(rewritten.contents.subarray(0x1989, 0x1992)).toString('ascii')).toBe('OBJ2\0\0\0\0\0');
    expect(rewritten.contents[0x1988]).toBe(0x0b);
    expect(rewritten.contents[0x1992]).toBe(0x00);
    expect(rewritten.contents[0x1993]).toBe(0x01);
    expect(Buffer.from(rewritten.contents.subarray(0x1994, 0x1996)).toString('ascii')).toBe('/E');
    expect([...rewritten.contents.subarray(0x1900, 0x1908)]).toEqual(position);
    expect(Buffer.from(rewritten.contents.subarray(0x1909, 0x1912)).toString('ascii')).toBe('TESTOBJ1\0');
    expect(rewritten.contents[0x1912]).toBe(0x01);
    expect(rewritten.contents[0x1913]).toBe(0x00);
    expect(Buffer.from(rewritten.contents.subarray(0x1914, 0x1916)).toString('ascii')).toBe('\\S');
    expect(Buffer.from(rewritten.contents.subarray(0x1916, 0x191a)).toString('ascii')).toBe('ABCD');
    expect([...rewritten.contents.subarray(0x191a, 0x1940)].every((byte) => byte === 0)).toBe(true);

    const inferred: Array<{ offset: number; raw: number; field: string; expected: string }> = [
      { offset: 0x1912, raw: 2, field: 'type', expected: 'Live Item' },
      { offset: 0x1912, raw: 3, field: 'type', expected: 'Killed Item' },
      { offset: 0x1913, raw: 2, field: 'method', expected: 'Auto (15 min)' },
      { offset: 0x1913, raw: 3, field: 'method', expected: 'Auto (30 min)' },
      { offset: 0x1913, raw: 4, field: 'method', expected: 'Auto (60 min)' },
    ];

    for (const sample of inferred) {
      measured[sample.offset] = sample.raw;
      const decoded = codec.decode({ contents: measured, radioModel: modelId });
      expect(asRecord(asRecord(decoded.settings)[`aprsObject1`])[sample.field]).toBe(sample.expected);
      const encoded = codec.encode(decoded, { contents: Uint8Array.from(measured), radioModel: modelId });
      expect(encoded.contents[sample.offset]).toBe(sample.raw);
      expect(encoded.contents[0x1908]).toBe(0x00);
    }
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
    for (const base of [0x1900, 0x1940, 0x1980]) {
      contents.fill(0, base + 0x09, base + 0x40);
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
