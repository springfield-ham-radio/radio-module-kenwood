import { Frequency, type RadioModelId, type RadioProgram, RadioToneType, type RadioMemoryConfig, type RadioMemoryMap } from '@springfield/ham-radio-api';
import { describe, expect, it } from 'vitest';
import { createMemoryMapCodec } from '@springfield/ham-radio-utils';
import { MockLogLayer } from 'loglayer';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDirectory = join(dirname(fileURLToPath(import.meta.url)), '../..');

function loadRadio(configRelativePath: string, mapRelativePath: string) {
  const memoryMap = JSON.parse(readFileSync(join(rootDirectory, mapRelativePath), 'utf8')) as RadioMemoryMap;
  const radioConfig = JSON.parse(readFileSync(join(rootDirectory, configRelativePath), 'utf8')) as {
    memoryConfig: RadioMemoryConfig;
    id: { model: string };
  };

  return {
    memoryMap,
    memoryConfig: radioConfig.memoryConfig,
    modelId: radioConfig.id.model as RadioModelId,
  };
}

function bufferSize(memoryConfig: RadioMemoryConfig): number {
  return Math.max(...Object.values(memoryConfig.segments).map((segment) => segment.endAddress)) + 1;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asList(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function pmEntry(settings: Record<string, unknown>, id: string, index = 0): Record<string, unknown> {
  return asRecord(asList(settings[id])[index]);
}

function writeAscii(contents: Uint8Array, offset: number, text: string, length: number, pad = 0xff): void {
  for (let index = 0; index < length; index += 1) {
    contents[offset + index] = index < text.length ? (text.codePointAt(index) ?? pad) : pad;
  }
}

function writeLittleEndian32(contents: Uint8Array, offset: number, value: number): void {
  contents[offset] = value & 0xff;
  contents[offset + 1] = (value >> 8) & 0xff;
  contents[offset + 2] = (value >> 16) & 0xff;
  contents[offset + 3] = (value >> 24) & 0xff;
}

function writeTmd710Record(
  contents: Uint8Array,
  index: number,
  record: { freq: number; offset?: number; step?: number; name?: string; band: number; skip: number },
): void {
  const memoryOffset = 0x1700 + index * 16;
  writeLittleEndian32(contents, memoryOffset, record.freq);
  contents[memoryOffset + 4] = record.step ?? 0;
  contents[memoryOffset + 5] = 0;
  contents[memoryOffset + 6] = 0;
  contents[memoryOffset + 7] = 8;
  contents[memoryOffset + 8] = 8;
  contents[memoryOffset + 9] = 0;
  writeLittleEndian32(contents, memoryOffset + 10, record.offset ?? 0);
  contents[0x0e00 + index * 2] = record.band;
  contents[0x0e00 + index * 2 + 1] = record.skip;

  if (record.name) {
    const nameOffset = 0x5800 + index * 8;
    const padded = record.name.padEnd(8, ' ');

    for (let indexInName = 0; indexInName < 8; indexInName += 1) {
      contents[nameOffset + indexInName] = padded.charCodeAt(indexInName);
    }
  }
}

describe('Kenwood TH-D74 module', () => {
  const { memoryMap, memoryConfig, modelId } = loadRadio('configs/kenwood-th-d74.json', 'src/shared/memory-maps/th-d74-settings.json');

  it('declares live clone protocol steps matching CHIRP image size', () => {
    const radioConfig = JSON.parse(readFileSync(join(rootDirectory, 'configs/kenwood-th-d74.json'), 'utf8')) as {
      version: string;
      minApiVersion: string;
      serialConfig: { dtr?: boolean; rts?: boolean };
      memoryConfig: RadioMemoryConfig;
      readMemory: Array<Record<string, unknown>>;
      writeMemory: Array<Record<string, unknown>>;
      onError: {
        readMemory: Array<Record<string, unknown>>;
        writeMemory: Array<Record<string, unknown>>;
      };
    };

    expect(radioConfig.version).toBe('1.17.0');
    expect(radioConfig.minApiVersion).toBe('18.3.0');
    expect(radioConfig.onError).toEqual({
      readMemory: [{ setBaudRate: 57600 }, { send: ['E'] }],
      writeMemory: [{ setBaudRate: 57600 }, { send: ['E'] }],
    });
    expect(radioConfig.serialConfig.dtr).toBe(true);
    expect(radioConfig.serialConfig.rts).toBe(true);
    expect(radioConfig.memoryConfig.segments.image.endAddress).toBe(500479);
    expect(bufferSize(radioConfig.memoryConfig)).toBe(500480);

    const wakeExpect = ['?', '0x0D', '?', '0x0D'];
    const idExpect = ['I', 'D', ' ', 'T', 'H', '-', 'D', '7', '4', '0x0D'];

    for (const steps of [radioConfig.readMemory, radioConfig.writeMemory]) {
      expect(steps[0].description).toContain('Wake');
      expect(steps[0].expect).toEqual(wakeExpect);
      expect(steps[1].expect).toEqual(idExpect);
      expect(steps[2].timeout).toBe(3000);
      expect(steps[3]).toEqual({ description: 'Switch to clone baud', setBaudRate: 57600 });
      expect(steps[steps.length - 1]).toEqual({ description: 'Leave programming mode', send: ['E'] });
    }

    const readStep = radioConfig.readMemory.find((step) => 'read' in step) as { read: Record<string, unknown> };
    expect(readStep.read.ack).toEqual({ send: ['0x06'], expect: '0x06', timeout: 50 });
    expect(readStep.read.ready).toBe('0x06');

    const writeStep = radioConfig.writeMemory.find((step) => 'write' in step) as {
      write: { skip: Array<{ startAddress: number; endAddress: number }> };
    };
    expect(writeStep.write.skip).toEqual([{ startAddress: 499968, endAddress: 500479 }]);
  });

  it('encodes and decodes a VHF channel with grouped stride', () => {
    const codec = createMemoryMapCodec({
      radioModel: modelId,
      memoryMap,
      memoryConfig,
      logger: new MockLogLayer(),
    });

    const originalProgram: RadioProgram = {
      channels: [
        {
          channelNumber: 0,
          radioChannel: {
            name: 'LOCAL',
            receiveFrequency: Frequency(146_520_000),
            receiveTone: { tone: 0, type: RadioToneType.CTCSS },
            transmitFrequency: Frequency(146_520_000),
            transmitTone: { tone: 885, type: RadioToneType.CTCSS },
          },
          settings: {
            mode: 'FM',
            tuning_step: '5',
            duplex: '',
          },
        },
        {
          channelNumber: 6,
          radioChannel: {
            name: 'RPT',
            receiveFrequency: Frequency(146_940_000),
            receiveTone: { tone: 0, type: RadioToneType.CTCSS },
            transmitFrequency: Frequency(146_340_000),
            transmitTone: { tone: 0, type: RadioToneType.CTCSS },
          },
          settings: {
            mode: 'FM',
            duplex: '-',
          },
        },
      ],
      settings: {},
    };

    const mockMemory = { contents: new Uint8Array(bufferSize(memoryConfig)).fill(0xff), radioModel: modelId };
    const encodedMemory = codec.encode(originalProgram, mockMemory);
    const decodedProgram = codec.decode(encodedMemory);

    expect(decodedProgram.channels.map((channel) => channel.channelNumber)).toEqual([0, 6]);

    const channel0 = decodedProgram.channels[0].radioChannel;
    if (typeof channel0 === 'object' && channel0 !== undefined) {
      expect(channel0.name).toBe('LOCAL');
      expect(channel0.receiveFrequency).toBe(146_520_000);
      expect(channel0.transmitFrequency).toBe(146_520_000);
      expect(channel0.transmitTone).toEqual({ tone: 885, type: RadioToneType.CTCSS });
    }

    const channel6 = decodedProgram.channels[1].radioChannel;
    if (typeof channel6 === 'object' && channel6 !== undefined) {
      expect(channel6.name).toBe('RPT');
      expect(channel6.receiveFrequency).toBe(146_940_000);
      expect(channel6.transmitFrequency).toBe(146_340_000);
    }

    expect(encodedMemory.contents[0x4000]).not.toBe(0xff);
    expect(encodedMemory.contents[0x4100]).not.toBe(0xff);
  });

  it('round-trips the first menu settings and leaves every other image byte unchanged', () => {
    const codec = createMemoryMapCodec({
      radioModel: modelId,
      memoryMap,
      memoryConfig,
      logger: new MockLogLayer(),
    });

    const contents = new Uint8Array(500480).fill(0xff);
    expect(contents.length).toBe(bufferSize(memoryConfig));
    // Group names are space-padded. Decoding an all-0xFF name and encoding it
    // writes spaces, so this region is primed to the stored empty value.
    contents.fill(0x20, 0x14800, 0x14800 + 30 * 16);

    // Clone framing byte. It is not a menu field.
    contents[0x01ea] = 0x01;
    // Volatile radio state. Do not map it.
    contents[0x038c] = 0x5a;
    // Gap between TX Inhibit and the time-out timer.
    contents[0x1002] = 0x22;

    contents[0x1001] = 1;
    contents[0x1003] = 0x09;
    contents[0x1006] = 0x01;
    contents[0x1008] = 0x04;
    contents[0x1009] = 0x04;
    contents[0x100a] = 0x02;
    contents[0x100c] = 1;
    contents[0x100d] = 2;
    contents[0x100e] = 5;
    contents[0x100f] = 2;
    contents[0x1018] = 1;
    contents[0x1024] = 0x06;
    contents[0x1030] = 0;
    contents[0x1032] = 1;
    contents[0x1060] = 3;
    contents[0x1062] = 0x02;
    contents[0x1071] = 1;
    contents[0x1076] = 5;
    contents[0x1077] = 2;
    contents[0x107f] = 0x03;
    contents[0x1085] = 1;
    contents[0x1088] = 0x02;
    writeAscii(contents, 0x10c0, 'HELLO !!', 16, 0);
    writeAscii(contents, 0x1200, 'W1AW', 6, 0);
    writeAscii(contents, 0x1206, '-7', 3, 0);
    writeAscii(contents, 0x02b1, 'W1AW', 8, 0x20);
    writeAscii(contents, 0x02b9, 'HT', 4, 0x20);

    const original = Uint8Array.from(contents);
    const decoded = codec.decode({ contents, radioModel: modelId });
    const settings = asRecord(decoded.settings);

    expect(asRecord(settings.txInhibit).txInhibit).toBe(true);
    expect(asRecord(settings.timeoutTimer).timeout).toBe('5.0min');
    expect(asRecord(settings.micSensitivity).sensitivity).toBe('Medium');
    expect(asRecord(settings.ssbHighCut).cutoff).toBe('3.0kHz');
    expect(asRecord(settings.cwWidth).width).toBe('2.0kHz');
    expect(asRecord(settings.amHighCut).cutoff).toBe('6.0kHz');
    expect(asRecord(settings.scanResume).resume).toBe('Carrier');
    expect(asRecord(settings.digitalScanResume).resume).toBe('Seek');
    expect(asRecord(settings.timeRestart).seconds).toBe(5);
    expect(asRecord(settings.carrierRestart).seconds).toBe(2);
    expect(asRecord(settings.autoOffset).enabled).toBe(true);
    expect(asRecord(settings.cwPitch).pitch).toBe('1000Hz');
    expect(asRecord(settings.recallMethod).method).toBe('All Bands');
    expect(asRecord(settings.txMonitor).monitor).toBe(true);
    expect(asRecord(settings.backlight).control).toBe('Auto (DC-IN)');
    expect(asRecord(settings.lcdBrightness).brightness).toBe('High');
    expect(asRecord(settings.beep).beep).toBe(true);
    expect(asRecord(settings.battery)).toMatchObject({ saver: '1.0s', apo: '30min' });
    expect(asRecord(settings.cursorShift).delay).toBe('2.0s');
    expect(asRecord(settings.dtmfKeysLock).locked).toBe(true);
    expect(asRecord(settings.speedDistance).unit).toBe('knots');
    expect(asRecord(settings.powerOnMessage).message).toBe('HELLO !!');
    expect(asRecord(settings.aprsMyCall)).toMatchObject({ callsign: 'W1AW', ssid: '-7' });
    expect(asRecord(settings.dstarMyCall)).toMatchObject({ callsign: 'W1AW', memo: 'HT' });

    const encoded = codec.encode(decoded, { contents: Uint8Array.from(contents), radioModel: modelId });
    const mappedRanges: Array<[number, number]> = [
      [0x02b1, 12],
      [0x1001, 1],
      [0x1003, 1],
      [0x1006, 1],
      [0x1008, 1],
      [0x1009, 1],
      [0x100a, 1],
      [0x100c, 1],
      [0x100d, 3],
      [0x1018, 1],
      [0x1024, 1],
      [0x1030, 1],
      [0x1032, 1],
      [0x1060, 1],
      [0x1062, 1],
      [0x1071, 1],
      [0x1076, 2],
      [0x107f, 1],
      [0x1085, 1],
      [0x1088, 1],
      [0x10c0, 16],
      [0x1200, 9],
    ];
    const changedOutsideMap: string[] = [];

    for (let offset = 0; offset < original.length; offset += 1) {
      const mapped = mappedRanges.some(([start, length]) => offset >= start && offset < start + length);

      if (!mapped && encoded.contents[offset] !== original[offset]) {
        changedOutsideMap.push(`0x${offset.toString(16)}: 0x${original[offset].toString(16)} -> 0x${encoded.contents[offset].toString(16)}`);
      }
    }

    expect(changedOutsideMap).toEqual([]);
    expect(encoded.contents[0x01ea]).toBe(0x01);
    expect(encoded.contents[0x038c]).toBe(0x5a);
    expect(encoded.contents[0x1002]).toBe(0x22);
    expect(encoded.contents).toEqual(original);

    const confirmed: Array<{ offset: number; raw: number; structId: string; field: string; expected: string }> = [
      { offset: 0x1076, raw: 5, structId: 'battery', field: 'saver', expected: '1.0s' },
      { offset: 0x1076, raw: 7, structId: 'battery', field: 'saver', expected: '3.0s' },
      { offset: 0x1076, raw: 9, structId: 'battery', field: 'saver', expected: '5.0s' },
      { offset: 0x1077, raw: 0, structId: 'battery', field: 'apo', expected: 'Off' },
      { offset: 0x1077, raw: 2, structId: 'battery', field: 'apo', expected: '30min' },
      { offset: 0x1003, raw: 0x09, structId: 'timeoutTimer', field: 'timeout', expected: '5.0min' },
      { offset: 0x1003, raw: 0x0a, structId: 'timeoutTimer', field: 'timeout', expected: '10min' },
      { offset: 0x1060, raw: 0, structId: 'backlight', field: 'control', expected: 'Manual' },
      { offset: 0x1060, raw: 3, structId: 'backlight', field: 'control', expected: 'Auto (DC-IN)' },
      { offset: 0x100c, raw: 0, structId: 'scanResume', field: 'resume', expected: 'Time' },
      { offset: 0x100c, raw: 1, structId: 'scanResume', field: 'resume', expected: 'Carrier' },
      { offset: 0x1071, raw: 0, structId: 'beep', field: 'beep', expected: 'false' },
      { offset: 0x1001, raw: 0, structId: 'txInhibit', field: 'txInhibit', expected: 'false' },
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
      const image = Uint8Array.from(original);
      image[sample.offset] = sample.raw;
      const sampleSettings = asRecord(asRecord(codec.decode({ contents: image, radioModel: modelId }).settings)[sample.structId]);
      const actual = sampleSettings[sample.field];
      expect(String(actual)).toBe(sample.expected);
    }

    // 500, 800, and 1000 Hz are measured. The other pitches follow that confirmed 100 Hz pattern from 400 Hz at 0x00.
    for (const step of [
      { raw: 0x00, expected: '400Hz' },
      { raw: 0x02, expected: '600Hz' },
      { raw: 0x03, expected: '700Hz' },
      { raw: 0x05, expected: '900Hz' },
    ]) {
      const image = Uint8Array.from(original);
      image[0x1024] = step.raw;
      expect(asRecord(asRecord(codec.decode({ contents: image, radioModel: modelId }).settings).cwPitch).pitch).toBe(step.expected);
    }

    const wideSsid = codec.encode(
      {
        ...decoded,
        settings: {
          ...decoded.settings,
          aprsMyCall: { callsign: 'N0CALL', ssid: '-15' },
        },
      },
      { contents: Uint8Array.from(original), radioModel: modelId },
    );
    expect(Buffer.from(wideSsid.contents.subarray(0x1200, 0x1209)).toString('ascii')).toBe('N0CALL-15');
    expect(wideSsid.contents[0x1209]).toBe(original[0x1209]);
    expect(wideSsid.contents[0x01ea]).toBe(0x01);
    expect(wideSsid.contents[0x038c]).toBe(0x5a);
  });
});

describe('Kenwood TH-F6 module', () => {
  const { memoryMap, memoryConfig, modelId } = loadRadio('configs/kenwood-th-f6.json', 'src/shared/memory-maps/th-f6-settings.json');

  it('declares live CAT memory steps', () => {
    const radioConfig = JSON.parse(readFileSync(join(rootDirectory, 'configs/kenwood-th-f6.json'), 'utf8')) as {
      readMemory: Array<Record<string, unknown>>;
      writeMemory: Array<Record<string, unknown>>;
    };

    expect(radioConfig.readMemory.some((step) => 'catRead' in step)).toBe(true);
    expect(radioConfig.writeMemory.some((step) => 'catWrite' in step)).toBe(true);
    expect(radioConfig.readMemory.some((step) => 'read' in step)).toBe(false);
    expect(radioConfig.writeMemory.some((step) => 'write' in step)).toBe(false);
  });

  it('encodes and decodes a logical live-mode channel image', () => {
    const codec = createMemoryMapCodec({
      radioModel: modelId,
      memoryMap,
      memoryConfig,
      logger: new MockLogLayer(),
    });

    const originalProgram: RadioProgram = {
      channels: [
        {
          channelNumber: 0,
          radioChannel: {
            name: 'CALL',
            receiveFrequency: Frequency(146_520_000),
            receiveTone: { tone: 0, type: RadioToneType.CTCSS },
            transmitFrequency: Frequency(146_520_000),
            transmitTone: { tone: 885, type: RadioToneType.CTCSS },
          },
          settings: {
            mode: 'FM',
            tuning_step: '5',
            duplex: '',
          },
        },
      ],
      settings: {
        settings: {
          apo: 'Off',
          att: false,
        },
      },
    };

    const mockMemory = { contents: new Uint8Array(bufferSize(memoryConfig)).fill(0xff), radioModel: modelId };
    const encodedMemory = codec.encode(originalProgram, mockMemory);
    const decodedProgram = codec.decode(encodedMemory);

    expect(decodedProgram.channels).toHaveLength(1);
    const radioChannel = decodedProgram.channels[0].radioChannel;
    if (typeof radioChannel === 'object' && radioChannel !== undefined) {
      expect(radioChannel.name).toBe('CALL');
      expect(radioChannel.receiveFrequency).toBe(146_520_000);
      expect(radioChannel.transmitTone).toEqual({ tone: 885, type: RadioToneType.CTCSS });
    }
  });

  it('decodes logical settings bytes at 12800 after a live CAT read', () => {
    const codec = createMemoryMapCodec({
      radioModel: modelId,
      memoryMap,
      memoryConfig,
      logger: new MockLogLayer(),
    });

    const mockMemory = { contents: new Uint8Array(bufferSize(memoryConfig)).fill(0xff), radioModel: modelId };
    mockMemory.contents[12800] = 1;
    mockMemory.contents[12801] = 0;
    mockMemory.contents[12802] = 5;
    mockMemory.contents[12807] = 1;
    mockMemory.contents[12809] = 8;
    Buffer.from('HELLO !!', 'ascii').copy(mockMemory.contents, 12810);

    const decodedProgram = codec.decode(mockMemory);
    const settings = asRecord(asRecord(decodedProgram.settings).settings);

    expect(settings.apo).toBe('30min');
    expect(settings.bat).toBe('Lithium');
    expect(settings.sv).toBe('1.0s');
    expect(settings.aro).toBe(true);
    expect(settings.cnt).toBe(8);
    expect(settings.mes).toBe('HELLO !!');
  });

  it('treats zero-filled contrast as an unread settings block, not a valid radio value', () => {
    const codec = createMemoryMapCodec({
      radioModel: modelId,
      memoryMap,
      memoryConfig,
      logger: new MockLogLayer(),
    });

    const mockMemory = { contents: new Uint8Array(bufferSize(memoryConfig)).fill(0), radioModel: modelId };
    const settings = asRecord(asRecord(codec.decode(mockMemory).settings).settings);

    expect(settings.cnt).toBe(0);
    expect(settings.apo).toBe('Off');
  });

  it('round-trips settings appended after the power-on message', () => {
    const codec = createMemoryMapCodec({
      radioModel: modelId,
      memoryMap,
      memoryConfig,
      logger: new MockLogLayer(),
    });

    const phase2 = {
      bep: true,
      txs: true,
      elk: false,
      mrm: 'Current band',
      vxb: true,
      vxg: 4,
      vxd: '3000ms',
      nar2m: true,
      nar125: false,
      nar70cm: true,
      mgl0: false,
      mgl1: true,
      mgl2: false,
      mgl3: true,
      mgl4: false,
      mgl5: true,
      mgl6: false,
      mgl7: true,
      tsp: 'Fast',
      txh: true,
      pt: '500ms',
      dlk: false,
      ckey: '1750 Hz',
      th: true,
      nsft: false,
      ant: true,
      lan: 'Japanese',
      datp: '9600',
    };

    const originalProgram: RadioProgram = {
      channels: [],
      settings: {
        settings: {
          apo: '30min',
          cnt: 8,
          mes: 'HELLO !!',
          ...phase2,
        },
      },
    };

    const mockMemory = { contents: new Uint8Array(bufferSize(memoryConfig)).fill(0xff), radioModel: modelId };
    const encodedMemory = codec.encode(originalProgram, mockMemory);
    const decodedSettings = asRecord(asRecord(codec.decode(encodedMemory).settings).settings);

    expect(encodedMemory.contents[12800]).toBe(1);
    expect(encodedMemory.contents[12809]).toBe(8);
    expect(Buffer.from(encodedMemory.contents.subarray(12810, 12818)).toString('ascii').replace(/\0/g, '')).toBe('HELLO !!');
    expect([...encodedMemory.contents.subarray(12818, 12846)]).toEqual([
      1, 1, 0, 1, 1, 4, 6, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1, 1, 2, 0, 1, 1, 0, 1, 1, 1,
    ]);
    expect(encodedMemory.contents[12846]).toBe(0xff);
    expect(encodedMemory.contents[12927]).toBe(0xff);
    expect(decodedSettings).toMatchObject({
      apo: '30min',
      cnt: 8,
      mes: 'HELLO !!',
      ...phase2,
    });
  });
});

describe('Kenwood TM-D710A module', () => {
  const { memoryMap, memoryConfig, modelId } = loadRadio('configs/kenwood-tm-d710a.json', 'src/shared/memory-maps/tm-d710a-settings.json');

  it('encodes and decodes 16-byte memories and 8-character names', () => {
    const codec = createMemoryMapCodec({
      radioModel: modelId,
      memoryMap,
      memoryConfig,
      logger: new MockLogLayer(),
    });

    const originalProgram: RadioProgram = {
      channels: [
        {
          channelNumber: 0,
          radioChannel: {
            name: 'LOCAL',
            receiveFrequency: Frequency(146_520_000),
            receiveTone: { tone: 0, type: RadioToneType.CTCSS },
            transmitFrequency: Frequency(146_520_000),
            transmitTone: { tone: 885, type: RadioToneType.CTCSS },
          },
          settings: {
            mode: 'FM',
            tuning_step: '5',
            duplex: '',
          },
        },
        {
          channelNumber: 1,
          radioChannel: {
            name: 'RPT',
            receiveFrequency: Frequency(146_940_000),
            receiveTone: { tone: 0, type: RadioToneType.CTCSS },
            transmitFrequency: Frequency(146_340_000),
            transmitTone: { tone: 0, type: RadioToneType.CTCSS },
          },
          settings: {
            mode: 'NFM',
            duplex: '-',
          },
        },
      ],
      settings: {},
    };

    const mockMemory = { contents: new Uint8Array(bufferSize(memoryConfig)).fill(0xff), radioModel: modelId };
    const encodedMemory = codec.encode(originalProgram, mockMemory);
    const decodedProgram = codec.decode(encodedMemory);

    expect(decodedProgram.channels.map((channel) => channel.channelNumber)).toEqual([0, 1]);

    const channel0 = decodedProgram.channels[0].radioChannel;
    if (typeof channel0 === 'object' && channel0 !== undefined) {
      expect(channel0.name).toBe('LOCAL');
      expect(channel0.receiveFrequency).toBe(146_520_000);
      expect(channel0.transmitFrequency).toBe(146_520_000);
      expect(channel0.transmitTone).toEqual({ tone: 885, type: RadioToneType.CTCSS });
    }

    const channel1 = decodedProgram.channels[1].radioChannel;
    if (typeof channel1 === 'object' && channel1 !== undefined) {
      expect(channel1.name).toBe('RPT');
      expect(channel1.receiveFrequency).toBe(146_940_000);
      expect(channel1.transmitFrequency).toBe(146_340_000);
    }

    expect(decodedProgram.channels[1].settings?.mode).toBe('NFM');
    expect(decodedProgram.channels[1].settings?.duplex).toBe('-');
    expect(encodedMemory.contents[0x1700]).not.toBe(0xff);
    expect(encodedMemory.contents[0x1710]).not.toBe(0xff);
    expect(encodedMemory.contents[0x5800]).toBe('L'.charCodeAt(0));
  });

  it('decodes weather and call specials past memory 999', () => {
    const codec = createMemoryMapCodec({
      radioModel: modelId,
      memoryMap,
      memoryConfig,
      logger: new MockLogLayer(),
    });

    const contents = new Uint8Array(bufferSize(memoryConfig)).fill(0xff);
    writeTmd710Record(contents, 1020, {
      freq: 162_550_000,
      name: 'WX   1',
      band: 5,
      skip: 0,
    });
    writeTmd710Record(contents, 1030, {
      freq: 144_000_000,
      offset: 600_000,
      band: 5,
      skip: 0xff,
    });
    writeTmd710Record(contents, 1031, {
      freq: 440_000_000,
      offset: 5_000_000,
      step: 7,
      band: 8,
      skip: 0xff,
    });

    const decodedProgram = codec.decode({ contents, radioModel: modelId });

    expect(decodedProgram.channels.map((channel) => channel.channelNumber)).toEqual([1020, 1030, 1031]);

    const wx = decodedProgram.channels[0].radioChannel;
    if (typeof wx === 'object' && wx !== undefined) {
      expect(wx.name).toBe('WX   1');
      expect(wx.receiveFrequency).toBe(162_550_000);
    }

    const callVhf = decodedProgram.channels[1].radioChannel;
    if (typeof callVhf === 'object' && callVhf !== undefined) {
      expect(callVhf.receiveFrequency).toBe(144_000_000);
      expect(callVhf.transmitFrequency).toBe(144_000_000);
    }

    const callUhf = decodedProgram.channels[2].radioChannel;
    if (typeof callUhf === 'object' && callUhf !== undefined) {
      expect(callUhf.receiveFrequency).toBe(440_000_000);
      expect(callUhf.transmitFrequency).toBe(440_000_000);
    }
  });

  it('decodes radio-wide and PM0 settings from known clone offsets', () => {
    const codec = createMemoryMapCodec({
      radioModel: modelId,
      memoryMap,
      memoryConfig,
      logger: new MockLogLayer(),
    });

    const contents = new Uint8Array(bufferSize(memoryConfig)).fill(0xff);
    contents[0x0016] = 2;
    contents[0x0021] = 3;
    contents[0x0023] = 1;
    writeAscii(contents, 0x002a, '12345', 6);
    writeAscii(contents, 0x0030, '146520*#', 16);
    writeAscii(contents, 0x00d0, 'HOME', 8);
    writeAscii(contents, 0x0170, 'W0ABC', 12);
    contents[0x0201] = 1;
    contents[0x0207] = 2;
    contents[0x020a] = 42;
    contents[0x020d] = 0;
    contents[0x0213] = 0;
    writeAscii(contents, 0x02e0, 'HELLO !!', 8);
    writeAscii(contents, 0x02f0, '0123456789', 10);
    contents[0x0350] = 1;
    contents[0x0351] = 4;
    contents[0x0374] = 2;
    contents[0x0390] = 1;
    contents[0x0395] = 0;
    writeAscii(contents, 0x04e0, 'PM ONE', 8);
    contents[0x0550] = 0;
    writeLittleEndian32(contents, 0x0240, 118_000_000);
    writeLittleEndian32(contents, 0x0250, 144_000_000);
    writeLittleEndian32(contents, 0x0300, 118_000_000);
    writeLittleEndian32(contents, 0x0304, 136_000_000);
    writeAscii(contents, 0x7da0, 'TRAVEL', 16);
    writeAscii(contents, 0x7df0, 'MCP comment', 32);
    writeAscii(contents, 0x8100, 'NOCALL', 9, 0);
    contents[0x810f] = 2;
    writeAscii(contents, 0x8315, 'TEMP', 42, 0);
    writeAscii(contents, 0x83f6, 'ALL,QST,CQ,KWD', 32, 0);
    writeAscii(contents, 0x8540, 'HELLO !!', 8, 0);
    writeAscii(contents, 0x8660, 'N0CMD', 10, 0);
    writeAscii(contents, 0x866a, 'N0TPT', 10, 0);
    contents[0x8674] = 8;
    writeAscii(contents, 0xff00, 'PM 1', 16, 0);

    const decodedProgram = codec.decode({ contents, radioModel: modelId });
    const { settings } = decodedProgram;

    expect(asRecord(settings.block1).pmrecall).toBe(2);
    expect(asRecord(settings.block1).pcbaud).toBe('57600');
    expect(asRecord(settings.block1).pwdon).toBe(true);
    expect(asRecord(settings.block1).pswd).toBe('12345');
    expect(pmEntry(settings, 'powerOn').pwron).toBe('HELLO !!');
    expect(pmEntry(settings, 'powerOn', 1).pwron).toBe('PM ONE');
    expect(pmEntry(settings, 'pm0A').a_mr).toBe('Mem Recall');
    expect(pmEntry(settings, 'pm0A').a_pwr).toBe('Low (5W)');
    expect(pmEntry(settings, 'pm0A').a_chn).toBe(42);
    expect(pmEntry(settings, 'pm0B').b_mr).toBe('VFO');
    expect(pmEntry(settings, 'pm0B').b_pwr).toBe('High (50W)');
    expect(pmEntry(settings, 'pm0Memory').memgrplk).toBe('0123456789');
    expect(pmEntry(settings, 'pm0').beepon).toBe(true);
    expect(pmEntry(settings, 'pm0').beepvol).toBe('5');
    expect(pmEntry(settings, 'pm0').apo).toBe('60');
    expect(pmEntry(settings, 'pm0', 1).beepon).toBe(false);
    expect(pmEntry(settings, 'pm0Bands').abnd118).toBe(true);
    expect(pmEntry(settings, 'pm0Bands').bbnd144).toBe(false);
    expect(asRecord(asList(settings.vfos)[0]).freq).toBe(118_000_000);
    expect(asRecord(asList(settings.vfos)[1]).freq).toBe(144_000_000);
    expect(asRecord(asList(settings.progvfo)[0]).blow).toBe(118_000_000);
    expect(asRecord(asList(settings.progvfo)[0]).bhigh).toBe(136_000_000);
    expect(asRecord(settings.repeaterId).rptrid).toBe('W0ABC');
    expect(asRecord(asList(settings.dtmfCodes)[0]).code).toBe('146520*#');
    expect(asRecord(asList(settings.dtmfNames)[0]).name).toBe('HOME');
    expect(asRecord(asList(settings.pmNames)[0]).pmname).toBe('TRAVEL');
    expect(asRecord(asList(settings.pmListNames)[0]).name).toBe('PM 1');
    expect(asRecord(settings.mcpComment).comment).toBe('MCP comment');
    expect(asRecord(settings.aprs).mycall).toBe('NOCALL');
    expect(asRecord(settings.aprs).ssid).toBe('-2');
    expect(asRecord(settings.aprsStatus).text).toBe('TEMP');
    expect(asRecord(settings.aprsMsgGroup).groups).toBe('ALL,QST,CQ,KWD');
    expect(asRecord(settings.aprsComment).comment).toBe('HELLO !!');
    expect(asRecord(settings.skyCommand).cmdr).toBe('N0CMD');
    expect(asRecord(settings.skyCommand).tptr).toBe('N0TPT');
    expect(asRecord(settings.skyCommand).skytone).toBe('88.5');
  });

  it('round-trips mapped TM-D710A settings without moving other bytes', () => {
    const codec = createMemoryMapCodec({
      radioModel: modelId,
      memoryMap,
      memoryConfig,
      logger: new MockLogLayer(),
    });

    const contents = new Uint8Array(bufferSize(memoryConfig)).fill(0xff);
    contents[0x0021] = 0;
    writeAscii(contents, 0x02e0, 'HELLO !!', 8);
    contents[0x0350] = 1;
    contents[0x0122] = 0xaa;

    const decodedProgram = codec.decode({ contents, radioModel: modelId });
    const nextSettings = {
      ...decodedProgram.settings,
      block1: { ...asRecord(decodedProgram.settings.block1), pcbaud: '38400' },
      powerOn: asList(decodedProgram.settings.powerOn).map((item, index) =>
        index === 0 ? { ...asRecord(item), pwron: 'HAMBENCH' } : item,
      ),
      pm0: asList(decodedProgram.settings.pm0).map((item, index) =>
        index === 0 ? { ...asRecord(item), beepon: false, apo: 'Off' } : item,
      ),
    };

    const encodedMemory = codec.encode(
      { channels: decodedProgram.channels, settings: nextSettings },
      { contents, radioModel: modelId },
    );

    expect(encodedMemory.contents[0x0021]).toBe(2);
    expect(String.fromCharCode(...encodedMemory.contents.slice(0x02e0, 0x02e8))).toBe('HAMBENCH');
    expect(encodedMemory.contents[0x0350]).toBe(0);
    expect(encodedMemory.contents[0x0374]).toBe(0);
    expect(encodedMemory.contents[0x0122]).toBe(0xaa);
  });
});
