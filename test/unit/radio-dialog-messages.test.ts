import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hydrateRadioConfig, validateConfiguration } from '@springfield/ham-radio-registry';
import { describe, expect, it } from 'vitest';
import { filePathFromRef } from '../../scripts/ref-closure.mjs';

const rootDirectory = join(dirname(fileURLToPath(import.meta.url)), '../..');

const TH_F6_MESSAGE = {
  title: 'Set Menu 9 to PC',
  body:
    'This radio answers the computer only when Menu 9 (SP/MIC JACK) is PC. The default is SP/MIC.\n\n' +
    'Press [MNU], choose menu 9, press [MNU] again, select PC, then press [MNU] to store. Turn the radio off, connect the programming cable to the SP/MIC jack (the two-plug Kenwood cable), and turn the radio on.\n\n' +
    'The PC port is 9600 baud, 8 data bits, no parity, 1 stop bit. Leave HamBench at 9600 unless a read fails. Menu 28 (PACKET) is the TNC speed, not this baud.',
  severity: 'info',
} as const;

const TH_D74_MESSAGE = {
  title: 'Use the micro-USB port',
  body:
    'Connect a data-capable USB-A to micro-USB cable to the micro-USB connector on the side of the radio. A charge-only cable will not show a COM port.\n\n' +
    'Do not use the two-plug speaker/mic programming cable (K-type) that other Kenwood handhelds use. This radio is not programmed from the SP/MIC jacks.\n\n' +
    "Menu 980 (USB Function) must be COM + AF/IF Output, not Mass Storage. Install Kenwood's virtual COM port driver before the first USB connection.",
  severity: 'warning',
} as const;

function loadConfig(fileName: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(rootDirectory, 'configs', fileName), 'utf8')) as Record<string, unknown>;
}

function documentsByRefForConfig(fileName: string): Record<string, unknown> {
  const configPath = join(rootDirectory, 'configs', fileName);
  const documentsByRef: Record<string, unknown> = {};

  function resolveRefs(value: unknown, baseDir: string): void {
    if (Array.isArray(value)) {
      for (const item of value) {
        resolveRefs(item, baseDir);
      }

      return;
    }

    if (!value || typeof value !== 'object') {
      return;
    }

    const record = value as Record<string, unknown>;

    if (typeof record.$ref === 'string') {
      const ref = record.$ref;

      if (!(ref in documentsByRef)) {
        const filePath = filePathFromRef(ref);

        if (filePath) {
          const absolutePath = join(baseDir, filePath);
          const loaded = JSON.parse(readFileSync(absolutePath, 'utf8')) as unknown;
          documentsByRef[ref] = loaded;
          resolveRefs(loaded, dirname(absolutePath));
        }
      }
    }

    for (const child of Object.values(record)) {
      resolveRefs(child, baseDir);
    }
  }

  resolveRefs(loadConfig(fileName), dirname(configPath));

  return documentsByRef;
}

describe('Kenwood radio dialog messages', () => {
  it('ships setup text on TH-F6 and TH-D74 only', () => {
    const thF6 = loadConfig('kenwood-th-f6.json');
    const thD74 = loadConfig('kenwood-th-d74.json');
    const tmD710a = loadConfig('kenwood-tm-d710a.json');

    expect(thF6.readMessage).toEqual(TH_F6_MESSAGE);
    expect(thF6.writeMessage).toEqual(TH_F6_MESSAGE);
    expect(thD74.readMessage).toEqual(TH_D74_MESSAGE);
    expect(thD74.writeMessage).toEqual(TH_D74_MESSAGE);
    expect(tmD710a.readMessage).toBeUndefined();
    expect(tmD710a.writeMessage).toBeUndefined();
  });

  it('passes registry validation for every shipping config', () => {
    for (const fileName of ['kenwood-th-f6.json', 'kenwood-th-d74.json', 'kenwood-tm-d710a.json']) {
      const raw = loadConfig(fileName);
      const hydrated = hydrateRadioConfig(raw, documentsByRefForConfig(fileName));
      const result = validateConfiguration(hydrated);

      expect(result.isValid, `${fileName}: ${result.errors?.join(', ')}`).toBe(true);
    }
  });

  it('preserves readMessage through hydration on TH-F6', () => {
    const raw = loadConfig('kenwood-th-f6.json');
    const hydrated = hydrateRadioConfig(raw, documentsByRefForConfig('kenwood-th-f6.json')) as {
      readMessage?: typeof TH_F6_MESSAGE;
    };

    expect(hydrated.readMessage).toEqual(TH_F6_MESSAGE);
  });
});
