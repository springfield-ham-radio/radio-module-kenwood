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
