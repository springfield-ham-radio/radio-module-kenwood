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
  listenMs?: number;
  kissExit?: number[];
  promptNudge?: number[];
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
    expect(tmD710a.version).toBe('1.15.1');
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
        listenMs: 3000,
        kissExit: [192, 255, 192],
        promptNudge: [13],
        enter: [
          { text: 'KISS ON\r', label: 'KISS ON' },
          { text: 'RESTART\r', label: 'RESTART' },
        ],
        flows: ['software', 'none', 'hardware'],
        defaultFlow: 'software',
        flowHelp:
          'Software is the default and keeps RTS and DTR low, as does Off. Hardware (RTS/CTS) is required when the TNC already shows XFLOW OFF. The driver handles RTS. It does not force RTS low and it does not send XFLOW.',
        setup: [
          'Connect listens, then enters KISS on its own. A cmd: runs KISS ON, then RESTART after another cmd:. Monitor text without cmd: sends three Ctrl+C once. If text continues without cmd:, Connect writes one carriage return after that interrupt and waits. Silence sends three Ctrl+C once, then the KISS exit frame once if it stays silent. Connect does not transmit RF: no beacon, HB, RESET, XFLOW, or KISS OFF.',
          'Head COM is not the CAT or memory port. Menu 528 is the COM baud. The tested host path is menu 529 PACKET data band B on 144.390. Menu 604 OUTPUT is the passive monitor only. HamBench does not change those menus.',
        ],
        recovery: [
          'On this radio KISS did not persist across a power cycle. After the radio was off overnight on 11 Nov 2026, the TNC came up in command mode, emitted TNC2 monitor text and cmd:, and replied KISS was OFF.',
          'kissExit is the KISS specification return-from-KISS frame C0 FF C0. The Kenwood manuals have not verified that frame on the TM-D710. It is not a manual-verified exit. The A/E KISS sentence says power OFF then ON causes the TNC to enter (or exit) KISS when the parameter is ON. The G sentence uses RESTART for that wording. Neither says the result alternates. A startup banner is not proof of PACKET mode.',
          'promptNudge is one carriage return (byte 13). Connect writes it at most once, only after the three Ctrl+C interrupt, and only when printable command text arrived after that interrupt without cmd:. It is not written on silence, before the interrupt, or after a KISS data frame. A terminal session observed a fresh cmd: after a carriage return at an existing prompt. The manuals do not document that reply. SENDPAC $0D sends a packet only in Converse. With MONITOR on, this TNC streamed TNC2 lines and did not answer three Ctrl+C with cmd:.',
        ],
      },
    });

    const recovery = tmD710a.aprs?.host.recovery.join('\n') ?? '';
    const setup = tmD710a.aprs?.host.setup.join('\n') ?? '';
    expect(recovery).not.toMatch(/second cycle|toggles again|successive/i);
    expect(recovery).toContain('Neither says the result alternates');
    expect(recovery).toContain('did not persist across a power cycle');
    expect(recovery).toContain('KISS was OFF');
    expect(recovery).toContain('not a manual-verified exit');
    expect(setup).not.toMatch(/Connect writes nothing/);
    expect(setup).toContain('does not transmit RF');
    expect(tmD710a.aprs?.host.kissExit).toEqual([0xc0, 0xff, 0xc0]);
    expect(tmD710a.aprs?.host.promptNudge).toEqual([0x0d]);
    expect(recovery).toContain('only after the three Ctrl+C interrupt');
    expect(recovery).toContain('do not document that reply');
    expect(tmD710a.aprs?.host.enter.map((step) => step.text).join('')).not.toMatch(/XFLOW/);

    const withoutDetection = structuredClone(tmD710a.aprs);
    delete withoutDetection?.host.kissExit;
    delete withoutDetection?.host.listenMs;
    delete withoutDetection?.host.promptNudge;
    expect(aprsReceiveValidator(withoutDetection), JSON.stringify(aprsReceiveValidator.errors)).toBe(true);

    for (const fileName of ['kenwood-th-d74.json', 'kenwood-th-f6.json']) {
      const config = loadConfig(fileName);
      expect(config.capabilities?.aprsReceive, fileName).toBeUndefined();
      expect(config.aprs, fileName).toBeUndefined();
    }
  });
});
