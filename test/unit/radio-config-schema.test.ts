import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SchemaValidator } from '@springfield/ham-radio-utils';
import { Ajv } from 'ajv';
import { describe, expect, it } from 'vitest';

const rootDirectory = join(dirname(fileURLToPath(import.meta.url)), '../..');
const validator = new SchemaValidator();

type AprsEnterStep = { text: string; label: string };

type AprsHost = {
  interrupt: number[];
  prompt: string;
  errorReply: string;
  waitMs: number;
  enter: AprsEnterStep[];
  flows: string[];
  defaultFlow: string;
  flowHelp: string;
  setup: string[];
  recovery: string[];
};

type AprsReceive = {
  mode: string;
  baudRate: number;
  baudRates: number[];
  help: string;
  monitorNote: string;
  host: AprsHost;
};

type KenwoodConfig = {
  id: { model: string };
  version?: string;
  minApiVersion?: string;
  capabilities?: { aprsReceive?: boolean };
  aprs?: AprsReceive;
  serialConfig?: { rtscts?: boolean };
  onError?: {
    readMemory?: unknown[];
    writeMemory?: unknown[];
  };
};

const aprsReceiveSchema = JSON.parse(readFileSync(join(rootDirectory, 'src/shared/schemas/aprs-receive-v1.json'), 'utf8')) as object;
const aprsReceiveValidator = new Ajv({ allErrors: true, strict: true }).compile(aprsReceiveSchema);

function loadConfig(fileName: string): KenwoodConfig {
  return JSON.parse(readFileSync(join(rootDirectory, 'configs', fileName), 'utf8')) as KenwoodConfig;
}

describe('Kenwood radio configs (schema)', () => {
  it('validates every config against the radio protocol schema', () => {
    const configFiles = readdirSync(join(rootDirectory, 'configs')).filter((entry) => entry.endsWith('.json'));

    for (const fileName of configFiles) {
      const config = loadConfig(fileName);
      const result = validator.validateRadioProtocol(config);

      expect(result.valid, `${fileName}: ${result.errors?.join('; ')}`).toBe(true);
    }
  });

  it('declares onError cleanup for clone-mode Kenwood models', () => {
    const thD74 = loadConfig('kenwood-th-d74.json');
    expect(thD74.minApiVersion).toBe('18.3.0');
    expect(thD74.onError).toEqual({
      readMemory: [{ setBaudRate: 57600 }, { send: ['E'] }],
      writeMemory: [{ setBaudRate: 57600 }, { send: ['E'] }],
    });

    const tmD710a = loadConfig('kenwood-tm-d710a.json');
    expect(tmD710a.minApiVersion).toBe('18.3.0');
    expect(tmD710a.onError).toEqual({
      readMemory: [{ send: ['E'] }],
      writeMemory: [{ send: ['E'] }],
    });
  });

  it('does not declare onError for TH-F6 live CAT', () => {
    const thF6 = loadConfig('kenwood-th-f6.json');
    expect(thF6.minApiVersion).toBe('18.0.1');
    expect(thF6.onError).toBeUndefined();
  });

  it('publishes the tested TM-D710A APRS host procedure and leaves other models without it', () => {
    const tmD710a = loadConfig('kenwood-tm-d710a.json');
    expect(tmD710a.version).toBe('1.14.0');
    expect(tmD710a.capabilities?.aprsReceive).toBe(true);
    expect(tmD710a.serialConfig?.rtscts).toBe(false);
    expect(aprsReceiveValidator(tmD710a.aprs), JSON.stringify(aprsReceiveValidator.errors)).toBe(true);
    expect(tmD710a.aprs).toEqual({
      mode: 'monitor',
      baudRate: 9600,
      baudRates: [9600, 19200, 38400, 57600],
      help: 'Control-head COM jack, not the body PC memory or CAT port. Match menu 528 to this baud. HamBench does not change radio menus.',
      monitorNote:
        'Passive monitor only. Menu 604 OUTPUT ON copies heard APRS while the radio is showing APRS. COM baud is menu 528. HamBench does not change that menu.',
      host: {
        interrupt: [3, 3, 3],
        prompt: 'cmd:',
        errorReply: '?EH',
        waitMs: 5000,
        enter: [
          { text: 'KISS ON\r', label: 'KISS ON' },
          { text: 'RESTART\r', label: 'RESTART' },
        ],
        flows: ['software', 'none', 'hardware'],
        defaultFlow: 'software',
        flowHelp:
          'Software is the default and keeps RTS and DTR low, as does Off. Hardware (RTS/CTS) is required when the TNC already shows XFLOW OFF. The driver handles RTS. It does not force RTS low and it does not send XFLOW.',
        setup: [
          'Connect writes nothing. Request writes three Ctrl+C only when this connection has no cmd:. Enter host KISS writes KISS ON only after that cmd:, then RESTART only after another cmd:. An ?EH reply stops the sequence before RESTART. cmd: is not proof of PACKET mode.',
          'Head COM is not the CAT or memory port. Menu 528 is the COM baud. The tested host path is menu 529 PACKET data band B on 144.390. Menu 604 OUTPUT is the passive monitor only. HamBench does not change those menus and does not send XFLOW.',
        ],
        recovery: [
          'The A/E KISS sentence says power OFF then ON causes the TNC to enter (or exit) KISS when the parameter is ON. The G sentence uses RESTART for that wording. Neither says the result alternates, and different editions do not prove that repeating a power cycle alternates. One cycle with the COM port still open and hardware RTS ready can show the startup banner. That banner is not a guaranteed reset or exit, and cmd: in it is not proof of PACKET mode. No binary KISS exit is manual-verified. HamBench does not send KISS OFF, XFLOW, Ctrl+C, or a carriage return to probe an unknown mode.',
        ],
      },
    });

    const recovery = tmD710a.aprs?.host.recovery.join('\n') ?? '';
    expect(recovery).not.toMatch(/second cycle|toggles again|successive/i);
    expect(recovery).toContain('Neither says the result alternates');
    expect(recovery).toContain('not a guaranteed reset or exit');
    expect(recovery).toContain('No binary KISS exit is manual-verified');
    expect(tmD710a.aprs?.host.enter.map((step) => step.text).join('')).not.toMatch(/XFLOW/);

    for (const fileName of ['kenwood-th-d74.json', 'kenwood-th-f6.json']) {
      const config = loadConfig(fileName);
      expect(config.capabilities?.aprsReceive, fileName).toBeUndefined();
      expect(config.aprs, fileName).toBeUndefined();
    }
  });
});
