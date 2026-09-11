import { Frequency, type RadioModelId, type RadioProgram, RadioToneType, type RadioMemoryConfig, type RadioMemoryMap } from '@springfield/ham-radio-api';
import { describe, it } from 'node:test';
import { createMemoryMapCodec } from '@springfield/ham-radio-utils';
import { MockLogLayer } from 'loglayer';
import { expect } from 'chai';
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

    expect(decodedProgram.channels.map((channel) => channel.channelNumber)).to.deep.equal([0, 6]);

    const channel0 = decodedProgram.channels[0].radioChannel;
    if (typeof channel0 === 'object' && channel0 !== undefined) {
      expect(channel0.name).to.equal('LOCAL');
      expect(channel0.receiveFrequency).to.equal(146_520_000);
      expect(channel0.transmitFrequency).to.equal(146_520_000);
      expect(channel0.transmitTone).to.deep.equal({ tone: 885, type: RadioToneType.CTCSS });
    }

    const channel6 = decodedProgram.channels[1].radioChannel;
    if (typeof channel6 === 'object' && channel6 !== undefined) {
      expect(channel6.name).to.equal('RPT');
      expect(channel6.receiveFrequency).to.equal(146_940_000);
      expect(channel6.transmitFrequency).to.equal(146_340_000);
    }

    expect(encodedMemory.contents[0x4000]).to.not.equal(0xff);
    expect(encodedMemory.contents[0x4100]).to.not.equal(0xff);
  });
});

describe('Kenwood TH-F6 module', () => {
  const { memoryMap, memoryConfig, modelId } = loadRadio('configs/kenwood-th-f6.json', 'src/shared/memory-maps/th-f6-settings.json');

  it('declares live CAT memory steps', () => {
    const radioConfig = JSON.parse(readFileSync(join(rootDirectory, 'configs/kenwood-th-f6.json'), 'utf8')) as {
      readMemory: Array<Record<string, unknown>>;
      writeMemory: Array<Record<string, unknown>>;
    };

    expect(radioConfig.readMemory.some((step) => 'catRead' in step)).to.equal(true);
    expect(radioConfig.writeMemory.some((step) => 'catWrite' in step)).to.equal(true);
    expect(radioConfig.readMemory.some((step) => 'read' in step)).to.equal(false);
    expect(radioConfig.writeMemory.some((step) => 'write' in step)).to.equal(false);
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

    expect(decodedProgram.channels).to.have.length(1);
    const radioChannel = decodedProgram.channels[0].radioChannel;
    if (typeof radioChannel === 'object' && radioChannel !== undefined) {
      expect(radioChannel.name).to.equal('CALL');
      expect(radioChannel.receiveFrequency).to.equal(146_520_000);
      expect(radioChannel.transmitTone).to.deep.equal({ tone: 885, type: RadioToneType.CTCSS });
    }
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

    expect(decodedProgram.channels.map((channel) => channel.channelNumber)).to.deep.equal([0, 1]);

    const channel0 = decodedProgram.channels[0].radioChannel;
    if (typeof channel0 === 'object' && channel0 !== undefined) {
      expect(channel0.name).to.equal('LOCAL');
      expect(channel0.receiveFrequency).to.equal(146_520_000);
      expect(channel0.transmitFrequency).to.equal(146_520_000);
      expect(channel0.transmitTone).to.deep.equal({ tone: 885, type: RadioToneType.CTCSS });
    }

    const channel1 = decodedProgram.channels[1].radioChannel;
    if (typeof channel1 === 'object' && channel1 !== undefined) {
      expect(channel1.name).to.equal('RPT');
      expect(channel1.receiveFrequency).to.equal(146_940_000);
      expect(channel1.transmitFrequency).to.equal(146_340_000);
    }

    expect(decodedProgram.channels[1].settings?.mode).to.equal('NFM');
    expect(decodedProgram.channels[1].settings?.duplex).to.equal('-');
    expect(encodedMemory.contents[0x1700]).to.not.equal(0xff);
    expect(encodedMemory.contents[0x1710]).to.not.equal(0xff);
    expect(encodedMemory.contents[0x5800]).to.equal('L'.charCodeAt(0));
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

    expect(decodedProgram.channels.map((channel) => channel.channelNumber)).to.deep.equal([1020, 1030, 1031]);

    const wx = decodedProgram.channels[0].radioChannel;
    if (typeof wx === 'object' && wx !== undefined) {
      expect(wx.name).to.equal('WX   1');
      expect(wx.receiveFrequency).to.equal(162_550_000);
    }

    const callVhf = decodedProgram.channels[1].radioChannel;
    if (typeof callVhf === 'object' && callVhf !== undefined) {
      expect(callVhf.receiveFrequency).to.equal(144_000_000);
      expect(callVhf.transmitFrequency).to.equal(144_000_000);
    }

    const callUhf = decodedProgram.channels[2].radioChannel;
    if (typeof callUhf === 'object' && callUhf !== undefined) {
      expect(callUhf.receiveFrequency).to.equal(440_000_000);
      expect(callUhf.transmitFrequency).to.equal(440_000_000);
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

    expect(asRecord(settings.block1).pmrecall).to.equal(2);
    expect(asRecord(settings.block1).pcbaud).to.equal('57600');
    expect(asRecord(settings.block1).pwdon).to.equal(true);
    expect(asRecord(settings.block1).pswd).to.equal('12345');
    expect(pmEntry(settings, 'powerOn').pwron).to.equal('HELLO !!');
    expect(pmEntry(settings, 'powerOn', 1).pwron).to.equal('PM ONE');
    expect(pmEntry(settings, 'pm0A').a_mr).to.equal('Mem Recall');
    expect(pmEntry(settings, 'pm0A').a_pwr).to.equal('Low (5W)');
    expect(pmEntry(settings, 'pm0A').a_chn).to.equal(42);
    expect(pmEntry(settings, 'pm0B').b_mr).to.equal('VFO');
    expect(pmEntry(settings, 'pm0B').b_pwr).to.equal('High (50W)');
    expect(pmEntry(settings, 'pm0Memory').memgrplk).to.equal('0123456789');
    expect(pmEntry(settings, 'pm0').beepon).to.equal(true);
    expect(pmEntry(settings, 'pm0').beepvol).to.equal('5');
    expect(pmEntry(settings, 'pm0').apo).to.equal('60');
    expect(pmEntry(settings, 'pm0', 1).beepon).to.equal(false);
    expect(pmEntry(settings, 'pm0Bands').abnd118).to.equal(true);
    expect(pmEntry(settings, 'pm0Bands').bbnd144).to.equal(false);
    expect(asRecord(asList(settings.vfos)[0]).freq).to.equal(118_000_000);
    expect(asRecord(asList(settings.vfos)[1]).freq).to.equal(144_000_000);
    expect(asRecord(asList(settings.progvfo)[0]).blow).to.equal(118_000_000);
    expect(asRecord(asList(settings.progvfo)[0]).bhigh).to.equal(136_000_000);
    expect(asRecord(settings.repeaterId).rptrid).to.equal('W0ABC');
    expect(asRecord(asList(settings.dtmfCodes)[0]).code).to.equal('146520*#');
    expect(asRecord(asList(settings.dtmfNames)[0]).name).to.equal('HOME');
    expect(asRecord(asList(settings.pmNames)[0]).pmname).to.equal('TRAVEL');
    expect(asRecord(asList(settings.pmListNames)[0]).name).to.equal('PM 1');
    expect(asRecord(settings.mcpComment).comment).to.equal('MCP comment');
    expect(asRecord(settings.aprs).mycall).to.equal('NOCALL');
    expect(asRecord(settings.aprs).ssid).to.equal('-2');
    expect(asRecord(settings.aprsStatus).text).to.equal('TEMP');
    expect(asRecord(settings.aprsMsgGroup).groups).to.equal('ALL,QST,CQ,KWD');
    expect(asRecord(settings.aprsComment).comment).to.equal('HELLO !!');
    expect(asRecord(settings.skyCommand).cmdr).to.equal('N0CMD');
    expect(asRecord(settings.skyCommand).tptr).to.equal('N0TPT');
    expect(asRecord(settings.skyCommand).skytone).to.equal('88.5');
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

    expect(encodedMemory.contents[0x0021]).to.equal(2);
    expect(String.fromCharCode(...encodedMemory.contents.slice(0x02e0, 0x02e8))).to.equal('HAMBENCH');
    expect(encodedMemory.contents[0x0350]).to.equal(0);
    expect(encodedMemory.contents[0x0374]).to.equal(0);
    expect(encodedMemory.contents[0x0122]).to.equal(0xaa);
  });
});
