import {
  Frequency,
  type RadioMemoryConfig,
  type RadioMemoryMap,
  type RadioModelId,
  RadioToneType,
} from '@springfield/ham-radio-api';
import {
  createMemoryMapCodec,
  memoryMapChannelRecordCount,
  memoryMapRegularChannelCapacity,
  memoryMapSpecialChannelLabel,
  memoryMapSpecialsConsistencyErrors,
} from '@springfield/ham-radio-utils';
import { MockLogLayer } from 'loglayer';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const rootDirectory = join(dirname(fileURLToPath(import.meta.url)), '../..');

function loadThD74() {
  const memoryMap = JSON.parse(
    readFileSync(join(rootDirectory, 'src/shared/memory-maps/th-d74-settings.json'), 'utf8'),
  ) as RadioMemoryMap;
  const radioConfig = JSON.parse(readFileSync(join(rootDirectory, 'configs/kenwood-th-d74.json'), 'utf8')) as {
    version: string;
    minApiVersion: string;
    memoryConfig: RadioMemoryConfig;
    id: { model: string };
  };

  return {
    memoryMap,
    memoryConfig: radioConfig.memoryConfig,
    modelId: radioConfig.id.model as RadioModelId,
    version: radioConfig.version,
    minApiVersion: radioConfig.minApiVersion,
  };
}

function channelRecordOffset(index: number): number {
  const group = Math.floor(index / 6);
  const slot = index % 6;
  return 0x4000 + group * 256 + slot * 40;
}

function writeLittleEndian32(contents: Uint8Array, offset: number, hz: number): void {
  contents[offset] = hz & 0xff;
  contents[offset + 1] = (hz >> 8) & 0xff;
  contents[offset + 2] = (hz >> 16) & 0xff;
  contents[offset + 3] = (hz >> 24) & 0xff;
}

const WX_INDEX = 1101;
const WX_RECORD_OFFSET = 0xf778;
const WX_FLAGS_OFFSET = 0x3134;
const WX_NAME_OFFSET = 0x144d0;

function seedUnmappedWxSentinel(contents: Uint8Array): void {
  contents.fill(0x3c, WX_RECORD_OFFSET, WX_RECORD_OFFSET + 40);
  contents[WX_FLAGS_OFFSET] = 0x5a;
  contents[WX_FLAGS_OFFSET + 1] = 0xa5;
  contents.fill(0x7e, WX_NAME_OFFSET, WX_NAME_OFFSET + 16);
}

function snapshotUnmappedWx(contents: Uint8Array) {
  return {
    record: Uint8Array.from(contents.subarray(WX_RECORD_OFFSET, WX_RECORD_OFFSET + 40)),
    flags: Uint8Array.from(contents.subarray(WX_FLAGS_OFFSET, WX_FLAGS_OFFSET + 4)),
    name: Uint8Array.from(contents.subarray(WX_NAME_OFFSET, WX_NAME_OFFSET + 16)),
  };
}

function expectUnmappedWxUnchanged(contents: Uint8Array, expected: ReturnType<typeof snapshotUnmappedWx>): void {
  expect(contents.subarray(WX_RECORD_OFFSET, WX_RECORD_OFFSET + 40)).toEqual(expected.record);
  expect(contents.subarray(WX_FLAGS_OFFSET, WX_FLAGS_OFFSET + 4)).toEqual(expected.flags);
  expect(contents.subarray(WX_NAME_OFFSET, WX_NAME_OFFSET + 16)).toEqual(expected.name);
}

describe('TH-D74 special channels', () => {
  const { memoryMap, memoryConfig, modelId, version, minApiVersion } = loadThD74();

  it('bumps the map and driver for special channel metadata', () => {
    expect(version).toBe('1.32.0');
    expect(minApiVersion).toBe('18.5.1');
    expect(memoryMap.version).toBe('1.16.0');
  });

  it('validates specials metadata against ham-radio-utils', () => {
    expect(memoryMapSpecialsConsistencyErrors(memoryMap)).toEqual([]);
    expect(memoryMapChannelRecordCount(memoryMap)).toBe(1101);
    expect(memoryMapRegularChannelCapacity(memoryMap)).toBe(1000);
    expect(memoryMap.channelBindings?.specials?.labels).toHaveLength(101);
  });

  it('maps L0, U49, and Pri labels to the CHIRP indices', () => {
    const labels = memoryMap.channelBindings!.specials!.labels;

    for (let n = 0; n < 50; n += 1) {
      expect(labels[2 * n]).toBe(`L${n}`);
      expect(labels[2 * n + 1]).toBe(`U${n}`);
    }
    expect(labels[100]).toBe('Pri');

    expect(memoryMapSpecialChannelLabel(memoryMap, 1000)).toBe('L0');
    expect(memoryMapSpecialChannelLabel(memoryMap, 1099)).toBe('U49');
    expect(memoryMapSpecialChannelLabel(memoryMap, 1100)).toBe('Pri');
    expect(memoryMapSpecialChannelLabel(memoryMap, 999)).toBeUndefined();
    expect(memoryMapSpecialChannelLabel(memoryMap, 1101)).toBeUndefined();
  });

  it('decodes Pri at 146.520 MHz and programmed L0/U0 scan-edge slots', () => {
    const codec = createMemoryMapCodec({
      radioModel: modelId,
      memoryMap,
      memoryConfig,
      logger: new MockLogLayer(),
    });
    const contents = new Uint8Array(500480).fill(0xff);
    contents.fill(0x20, 0x14800, 0x14800 + 30 * 16);

    const priHz = 146_520_000;
    const l0Hz = 146_520_000;
    const u0Hz = 146_540_000;

    writeLittleEndian32(contents, channelRecordOffset(1100), priHz);
    writeLittleEndian32(contents, channelRecordOffset(1100) + 10, priHz);
    contents[0x3130] = 0x01;
    contents[0x144c0] = 'P'.charCodeAt(0);
    contents[0x144c1] = 'r'.charCodeAt(0);
    contents[0x144c2] = 'i'.charCodeAt(0);

    writeLittleEndian32(contents, channelRecordOffset(1000), l0Hz);
    writeLittleEndian32(contents, channelRecordOffset(1001), u0Hz);
    contents[0x2fa0] = 0x01;
    contents[0x2fa4] = 0x01;

    const decoded = codec.decode({ contents, radioModel: modelId });
    const byNumber = new Map(decoded.channels.map((entry) => [entry.channelNumber, entry]));

    expect(byNumber.get(1100)?.radioChannel).toMatchObject({
      receiveFrequency: priHz,
      transmitFrequency: priHz,
      name: 'Pri',
    });
    expect(byNumber.get(1000)?.radioChannel).toMatchObject({ receiveFrequency: l0Hz });
    expect(byNumber.get(1001)?.radioChannel).toMatchObject({ receiveFrequency: u0Hz });
  });

  it('round-trips encode without altering channel 999 or the unmapped WX index 1101 bytes', () => {
    const codec = createMemoryMapCodec({
      radioModel: modelId,
      memoryMap,
      memoryConfig,
      logger: new MockLogLayer(),
    });
    const contents = new Uint8Array(500480).fill(0xff);
    contents.fill(0x20, 0x14800, 0x14800 + 30 * 16);

    seedUnmappedWxSentinel(contents);
    const wxBeforeEncode = snapshotUnmappedWx(contents);

    const channel999 = {
      channelNumber: 999,
      radioChannel: {
        name: 'CH999',
        receiveFrequency: Frequency(146_520_000),
        receiveTone: { tone: 0, type: RadioToneType.CTCSS },
        transmitFrequency: Frequency(146_520_000),
        transmitTone: { tone: 0, type: RadioToneType.CTCSS },
      },
      settings: { mode: 'FM', duplex: '' },
    };

    const with999 = codec.encode(
      { channels: [channel999], settings: {} },
      { contents: Uint8Array.from(contents), radioModel: modelId },
    );
    const offset999 = channelRecordOffset(999);
    const snapshot999 = Uint8Array.from(with999.contents.subarray(offset999, offset999 + 40));
    const snapshot999Flags = Uint8Array.from(with999.contents.subarray(0x2000 + 999 * 4, 0x2000 + 999 * 4 + 4));
    const snapshot999Name = Uint8Array.from(with999.contents.subarray(0x10000 + 999 * 16, 0x10000 + 999 * 16 + 16));
    const decoded = codec.decode(with999);
    expectUnmappedWxUnchanged(with999.contents, wxBeforeEncode);
    const roundTrip = codec.encode(decoded, { contents: Uint8Array.from(with999.contents), radioModel: modelId });

    expect(decoded.channels.find((entry) => entry.channelNumber === 999)?.radioChannel).toMatchObject({
      receiveFrequency: 146_520_000,
      name: 'CH999',
    });

    expect(roundTrip.contents.subarray(offset999, offset999 + 40)).toEqual(snapshot999);
    expect(roundTrip.contents.subarray(0x2000 + 999 * 4, 0x2000 + 999 * 4 + 4)).toEqual(snapshot999Flags);
    expect(roundTrip.contents.subarray(0x10000 + 999 * 16, 0x10000 + 999 * 16 + 16)).toEqual(snapshot999Name);
    expectUnmappedWxUnchanged(roundTrip.contents, wxBeforeEncode);
    expect(decoded.channels.some((entry) => entry.channelNumber === WX_INDEX)).toBe(false);
  });

  it('round-trips Pri frequency edits through encode', () => {
    const codec = createMemoryMapCodec({
      radioModel: modelId,
      memoryMap,
      memoryConfig,
      logger: new MockLogLayer(),
    });
    const contents = new Uint8Array(500480).fill(0xff);
    contents.fill(0x20, 0x14800, 0x14800 + 30 * 16);
    seedUnmappedWxSentinel(contents);
    const wxBeforeEncode = snapshotUnmappedWx(contents);

    const decoded = codec.decode({ contents, radioModel: modelId });
    const edited = codec.encode(
      {
        channels: [
          {
            channelNumber: 1100,
            radioChannel: {
              name: 'Pri',
              receiveFrequency: Frequency(146_520_000),
              receiveTone: { tone: 0, type: RadioToneType.CTCSS },
              transmitFrequency: Frequency(146_520_000),
              transmitTone: { tone: 0, type: RadioToneType.CTCSS },
            },
            settings: { mode: 'FM', duplex: '' },
          },
        ],
        settings: decoded.settings,
      },
      { contents: Uint8Array.from(contents), radioModel: modelId },
    );

    expect(edited.contents.subarray(channelRecordOffset(1100), channelRecordOffset(1100) + 4)).toEqual(
      writeAndReadFreq(146_520_000),
    );
    expectUnmappedWxUnchanged(edited.contents, wxBeforeEncode);
  });
});

function writeAndReadFreq(hz: number): Uint8Array {
  const bytes = new Uint8Array(4);
  writeLittleEndian32(bytes, 0, hz);
  return bytes;
}