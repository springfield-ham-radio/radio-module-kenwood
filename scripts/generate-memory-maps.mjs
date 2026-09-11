import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDirectory = join(dirname(fileURLToPath(import.meta.url)), '..');

const chirpTonesTenths = [
  670, 693, 719, 744, 770, 797, 825, 854, 885, 915, 948, 974, 1000, 1035, 1072, 1109, 1148, 1188, 1230, 1273, 1318, 1365,
  1413, 1462, 1514, 1567, 1598, 1622, 1655, 1679, 1713, 1738, 1773, 1799, 1835, 1862, 1899, 1928, 1966, 1995, 2035, 2065,
  2107, 2181, 2257, 2291, 2336, 2418, 2503, 2541,
];

const kenwoodTonesTenths = chirpTonesTenths.filter(
  (tone) => ![1598, 1655, 1713, 1773, 1835, 1899, 1966, 1995].includes(tone),
);

const dtcsCodes = [
  23, 25, 26, 31, 32, 36, 43, 47, 51, 53, 54, 65, 71, 72, 73, 74, 114, 115, 116, 122, 125, 131, 132, 134, 143, 145, 152,
  155, 156, 162, 165, 172, 174, 205, 212, 223, 225, 226, 243, 244, 245, 246, 251, 252, 255, 261, 263, 265, 266, 271, 274,
  306, 311, 315, 325, 331, 332, 343, 346, 351, 356, 364, 365, 371, 411, 412, 413, 423, 431, 432, 445, 446, 452, 454, 455,
  462, 464, 465, 466, 503, 506, 516, 523, 526, 532, 546, 565, 606, 612, 624, 627, 631, 632, 654, 662, 664, 703, 712, 723,
  731, 732, 734, 743, 754,
];

const tuneSteps = ['5', '6.25', '8.33', '9', '10', '12.5', '15', '20', '25', '30', '50', '100'];
const thf6Steps = ['5', '6.25', '8.33', '9', '10', '12.5', '15', '20', '25', '30', '50', '100'];
const thf6Modes = ['FM', 'WFM', 'AM', 'LSB', 'USB', 'CW'];

const ui = (group, label, widget, extra = {}) => ({ ui: { group, label, widget, ...extra } });

const thd74Map = {
  version: '1.0.0',
  description: 'Kenwood TH-D74 clone image: 1000 memories in 6-per-256-byte groups, flags, and names',
  structs: [
    {
      id: 'flags',
      seek: '0x2000',
      count: 1000,
      stride: 4,
      emptyWhen: { equals: 255 },
      clearEmpty: true,
      fields: [
        { id: 'used', type: 'u8', value: { kind: 'integer', min: 0, max: 255 } },
        { id: '_unknown1', type: 'bits', width: 7, reserved: true },
        {
          id: 'lockout',
          type: 'bits',
          width: 1,
          value: { kind: 'boolean' },
          ...ui('channel', 'Scan skip', 'switch'),
        },
        {
          id: 'group',
          type: 'u8',
          value: { kind: 'integer', min: 0, max: 29 },
          ...ui('channel', 'Memory group', 'integer'),
        },
        { id: '_unknownFF', type: 'u8', reserved: true },
      ],
    },
    {
      id: 'channels',
      seek: '0x4000',
      count: 1000,
      stride: 40,
      groupSize: 6,
      groupPad: 16,
      emptyWhen: { equals: 255 },
      clearEmpty: true,
      fields: [
        { id: 'freq', type: 'u32', value: { kind: 'integer' } },
        { id: 'offset', type: 'u32', value: { kind: 'integer' } },
        {
          id: 'tuning_step',
          type: 'bits',
          width: 4,
          value: { kind: 'enum', values: tuneSteps },
          ...ui('channel', 'Tuning step (kHz)', 'select'),
        },
        { id: 'split_tuning_step', type: 'bits', width: 3, value: { kind: 'enum', values: tuneSteps.slice(0, 8) } },
        { id: '_unknown2', type: 'bits', width: 1, reserved: true },
        { id: '_unknown3_0', type: 'bits', width: 1, reserved: true },
        {
          id: 'mode',
          type: 'bits',
          width: 3,
          value: { kind: 'enum', values: ['FM', 'DV', 'AM', 'LSB', 'USB', 'CW', 'NFM', 'DR'] },
          ...ui('channel', 'Mode', 'select'),
        },
        { id: 'narrow', type: 'bits', width: 1, value: { kind: 'boolean' } },
        { id: 'fine_mode', type: 'bits', width: 1, value: { kind: 'boolean' } },
        {
          id: 'fine_step',
          type: 'bits',
          width: 2,
          value: { kind: 'enum', values: ['20', '100', '500', '1000'] },
        },
        { id: 'tone_mode', type: 'bits', width: 1, value: { kind: 'boolean' } },
        { id: 'ctcss_mode', type: 'bits', width: 1, value: { kind: 'boolean' } },
        { id: 'dtcs_mode', type: 'bits', width: 1, value: { kind: 'boolean' } },
        { id: 'cross_mode', type: 'bits', width: 1, value: { kind: 'boolean' } },
        { id: '_unknown4_0', type: 'bits', width: 1, reserved: true },
        { id: 'split', type: 'bits', width: 1, value: { kind: 'boolean' } },
        {
          id: 'duplex',
          type: 'bits',
          width: 2,
          value: { kind: 'enum', values: ['', '+', '-'] },
          ...ui('channel', 'Duplex', 'select'),
        },
        { id: 'rtone', type: 'u8', value: { kind: 'ctcss-index', values: chirpTonesTenths } },
        { id: '_unknownctone', type: 'bits', width: 2, reserved: true },
        { id: 'ctone', type: 'bits', width: 6, value: { kind: 'ctcss-index', values: chirpTonesTenths } },
        { id: '_unknowndtcs', type: 'bits', width: 1, reserved: true },
        { id: 'dtcs_code', type: 'bits', width: 7, value: { kind: 'dcs-index', values: dtcsCodes } },
        { id: '_unknown5_1', type: 'bits', width: 2, reserved: true },
        {
          id: 'cross_mode_mode',
          type: 'bits',
          width: 2,
          value: { kind: 'enum', values: ['DTCS->', 'Tone->DTCS', 'DTCS->Tone', 'Tone->Tone'] },
        },
        { id: '_unknown5_2', type: 'bits', width: 2, reserved: true },
        {
          id: 'dig_squelch',
          type: 'bits',
          width: 2,
          value: { kind: 'enum', values: ['', 'Code', 'Callsign'] },
          ...ui('channel', 'D-STAR squelch', 'select'),
        },
        {
          id: 'dv_urcall',
          type: 'u8',
          value: { kind: 'ascii', length: 8, pad: 0 },
          ...ui('channel', 'URCALL', 'text'),
        },
        {
          id: 'dv_rpt1call',
          type: 'u8',
          value: { kind: 'ascii', length: 8, pad: 0 },
          ...ui('channel', 'RPT1', 'text'),
        },
        {
          id: 'dv_rpt2call',
          type: 'u8',
          value: { kind: 'ascii', length: 8, pad: 0 },
          ...ui('channel', 'RPT2', 'text'),
        },
        { id: '_unknown9', type: 'bits', width: 1, reserved: true },
        {
          id: 'dv_code',
          type: 'bits',
          width: 7,
          value: { kind: 'integer', min: 0, max: 127 },
          ...ui('channel', 'D-STAR code', 'integer'),
        },
      ],
    },
    {
      id: 'names',
      seek: '0x10000',
      count: 1000,
      stride: 16,
      fields: [
        {
          id: 'name',
          type: 'u8',
          value: { kind: 'ascii', length: 16, pad: 0 },
        },
      ],
    },
    {
      id: 'groupNames',
      seek: '0x14800',
      count: 30,
      stride: 16,
      fields: [
        {
          id: 'name',
          type: 'u8',
          value: { kind: 'ascii', length: 16, pad: 32 },
          ...ui('groups', 'Group name', 'text'),
        },
      ],
    },
  ],
  channelBindings: {
    records: 'channels',
    names: 'names',
    nameField: 'name',
    extras: 'flags',
    receiveFrequency: 'freq',
    transmitFrequency: 'offset',
    receiveTone: 'ctone',
    transmitTone: 'rtone',
  },
};

const thf6Map = {
  version: '1.0.0',
  description: 'Kenwood TH-F6 logical channel image (32-byte records). Radio I/O is live CAT, not this image.',
  structs: [
    {
      id: 'channels',
      seek: 0,
      count: 400,
      stride: 32,
      emptyWhen: { equals: 255 },
      clearEmpty: true,
      fields: [
        { id: 'freq', type: 'u32', value: { kind: 'integer' } },
        { id: 'offset', type: 'u32', value: { kind: 'integer' } },
        {
          id: 'tuning_step',
          type: 'u8',
          value: { kind: 'enum', values: thf6Steps },
          ...ui('channel', 'Tuning step (kHz)', 'select'),
        },
        {
          id: 'duplex',
          type: 'u8',
          value: { kind: 'enum', values: ['', '+', '-', 'split'] },
          ...ui('channel', 'Duplex', 'select'),
        },
        { id: 'tone_mode', type: 'u8', value: { kind: 'boolean' } },
        { id: 'ctcss_mode', type: 'u8', value: { kind: 'boolean' } },
        { id: 'dtcs_mode', type: 'u8', value: { kind: 'boolean' } },
        { id: 'rtone', type: 'u8', value: { kind: 'ctcss-index', values: kenwoodTonesTenths } },
        { id: 'ctone', type: 'u8', value: { kind: 'ctcss-index', values: kenwoodTonesTenths } },
        { id: 'dtcs_code', type: 'u8', value: { kind: 'dcs-index', values: dtcsCodes } },
        {
          id: 'mode',
          type: 'u8',
          value: { kind: 'enum', values: thf6Modes },
          ...ui('channel', 'Mode', 'select'),
        },
        { id: 'skip', type: 'u8', value: { kind: 'boolean' } },
        { id: 'split', type: 'u8', value: { kind: 'boolean' } },
        { id: '_pad', type: 'u8', reserved: true, value: { kind: 'ascii', length: 5 } },
        {
          id: 'name',
          type: 'u8',
          value: { kind: 'ascii', length: 8, pad: 0 },
        },
      ],
    },
    {
      id: 'settings',
      seek: 12800,
      fields: [
        {
          id: 'apo',
          type: 'u8',
          value: { kind: 'enum', values: ['Off', '30min', '60min'] },
          ...ui('save', 'Automatic Power Off', 'select'),
        },
        {
          id: 'bat',
          type: 'u8',
          value: { kind: 'enum', values: ['Lithium', 'Alkaline'] },
          ...ui('save', 'Battery Type', 'select'),
        },
        {
          id: 'sv',
          type: 'u8',
          value: { kind: 'enum', values: ['Off', '0.2s', '0.4s', '0.6s', '0.8s', '1.0s', '2s', '3s', '4s', '5s'] },
          ...ui('save', 'Battery Save', 'select'),
        },
        {
          id: 'bal',
          type: 'u8',
          value: { kind: 'enum', values: ['100%:0%', '75%:25%', '50%:50%', '25%:75%', '0%:100%'] },
          ...ui('main', 'Balance', 'select'),
        },
        {
          id: 'mnf',
          type: 'u8',
          value: { kind: 'enum', values: ['Name', 'Frequency'] },
          ...ui('main', 'Memory Display Mode', 'select'),
        },
        {
          id: 'scr',
          type: 'u8',
          value: { kind: 'enum', values: ['Time', 'Carrier', 'Seek'] },
          ...ui('main', 'Scan Resume', 'select'),
        },
        { id: 'att', type: 'u8', value: { kind: 'boolean' }, ...ui('main', 'Attenuator', 'switch') },
        { id: 'aro', type: 'u8', value: { kind: 'boolean' }, ...ui('main', 'Automatic Repeater Offset', 'switch') },
        { id: 'vox', type: 'u8', value: { kind: 'boolean' }, ...ui('aux', 'VOX Enable', 'switch') },
        {
          id: 'cnt',
          type: 'u8',
          value: { kind: 'integer', min: 1, max: 16 },
          ...ui('display', 'Contrast', 'integer'),
        },
        {
          id: 'mes',
          type: 'u8',
          value: { kind: 'ascii', length: 8, pad: 0 },
          ...ui('display', 'Power-on Message', 'text'),
        },
      ],
    },
  ],
  channelBindings: {
    records: 'channels',
    nameField: 'name',
    receiveFrequency: 'freq',
    transmitFrequency: 'offset',
    receiveTone: 'ctone',
    transmitTone: 'rtone',
  },
};

const tmd710Steps = ['5', '6.25', '8.33', '10', '12.5', '15', '20', '25', '30', '50', '100'];
const tmd710Pad = (id, length = 1) =>
  length === 1 ? { id, type: 'u8', reserved: true } : { id, type: 'u8', reserved: true, value: { kind: 'ascii', length } };
const tmd710Level = (from, to) => Array.from({ length: to - from + 1 }, (_, index) => String(from + index));
const tmd710PfFront = [
  'WX CH',
  'FRQ.BAND',
  'CTRL',
  'MONITOR',
  'VGS',
  'VOICE',
  'GROUP UP',
  'MENU',
  'MUTE',
  'SHIFT',
  'DUAL',
  'M>V',
  '1750 Tone',
];
const tmd710PfMic = [
  ...tmd710PfFront.slice(0, 12),
  'VFO',
  'MR',
  'CALL',
  'MHz',
  'TONE',
  'REV',
  'LOW',
  'LOCK',
  'A/B',
  'ENTER',
  '1750 Tone',
  'M.LIST',
  'S.LIST',
  'MSG.NEW',
  'REPLY',
  'POS',
  'P.MONI',
  'BEACON',
  'DX',
  'WX',
];
const tmd710SkyTones = kenwoodTonesTenths.map((tenths) => (tenths / 10).toFixed(1));
const tmd710TncBand = ['A-Band', 'B-Band', 'TX-A / RX-B', 'RX-A / TX-B'];
const tmd710Power = ['High (50W)', 'Medium (10W)', 'Low (5W)'];
const tmd710VfoMr = ['VFO', 'Mem Recall', 'Call', 'WX'];
const tmd710PmGroups = { count: 6, stride: 512 };
const tmd710Ssid = ['None', '-1', '-2', '-3', '-4', '-5', '-6', '-7', '-8', '-9', '-10', '-11', '-12', '-13', '-14', '-15'];

const tmd710Map = {
  version: '1.0.0',
  description:
    'Kenwood TM-D710A clone image: 1032 memories, radio-wide / PM0–PM5 settings, VFOs, APRS, and tail PM names',
  structs: [
    {
      id: 'flags',
      seek: '0x0e00',
      count: 1032,
      stride: 2,
      emptyWhen: { equals: 255 },
      clearEmpty: true,
      fields: [
        {
          id: 'band',
          type: 'u8',
          value: { kind: 'integer', min: 0, max: 9 },
          ...ui('channel', 'Band code', 'integer'),
        },
        {
          id: 'lockout',
          type: 'u8',
          value: { kind: 'boolean' },
          ...ui('channel', 'Scan skip', 'switch'),
        },
      ],
    },
    {
      id: 'channels',
      seek: '0x1700',
      count: 1032,
      stride: 16,
      emptyWhen: { equals: 255 },
      clearEmpty: true,
      fields: [
        { id: 'freq', type: 'u32', value: { kind: 'integer' } },
        {
          id: 'tuning_step',
          type: 'u8',
          value: { kind: 'enum', values: tmd710Steps },
          ...ui('channel', 'Tuning step (kHz)', 'select'),
        },
        {
          id: 'mode',
          type: 'u8',
          value: { kind: 'enum', values: ['FM', 'NFM', 'AM'] },
          ...ui('channel', 'Mode', 'select'),
        },
        { id: '_tmode_hi', type: 'bits', width: 1, reserved: true },
        { id: 'tone_mode', type: 'bits', width: 1, value: { kind: 'boolean' } },
        { id: 'ctcss_mode', type: 'bits', width: 1, value: { kind: 'boolean' } },
        { id: 'dtcs_mode', type: 'bits', width: 1, value: { kind: 'boolean' } },
        {
          id: 'duplex',
          type: 'bits',
          width: 4,
          value: { kind: 'enum', values: ['', '+', '-', '', 'split'] },
          ...ui('channel', 'Duplex', 'select'),
        },
        { id: 'rtone', type: 'u8', value: { kind: 'ctcss-index', values: kenwoodTonesTenths } },
        { id: 'ctone', type: 'u8', value: { kind: 'ctcss-index', values: kenwoodTonesTenths } },
        { id: 'dtcs_code', type: 'u8', value: { kind: 'dcs-index', values: dtcsCodes } },
        { id: 'offset', type: 'u32', value: { kind: 'integer' } },
        {
          id: 'split_tuning_step',
          type: 'u8',
          value: { kind: 'enum', values: tmd710Steps },
          ...ui('channel', 'Split TX step (kHz)', 'select'),
        },
        { id: '_cross', type: 'u8', reserved: true },
      ],
    },
    {
      id: 'names',
      seek: '0x5800',
      count: 1032,
      stride: 8,
      emptyWhen: { equals: 255 },
      clearEmpty: true,
      fields: [
        {
          id: 'name',
          type: 'u8',
          value: { kind: 'ascii', length: 8, pad: 255 },
        },
      ],
    },
    {
      id: 'block1',
      seek: '0x0015',
      fields: [
        { id: 'ansbck', type: 'u8', value: { kind: 'boolean' }, ...ui('aux', 'Remote control answerback', 'switch') },
        {
          id: 'pmrecall',
          type: 'u8',
          value: { kind: 'integer', min: 0, max: 5 },
          ...ui('basic', 'Current PM select', 'integer'),
        },
        { id: 'pnlklk', type: 'u8', value: { kind: 'boolean' }, ...ui('keys', 'Panel lock', 'switch') },
        {
          id: 'dspmemch',
          type: 'u8',
          value: { kind: 'boolean' },
          ...ui('memory', 'Display memory channel number', 'switch'),
        },
        { id: 'm10mz', type: 'u8', value: { kind: 'boolean' }, ...ui('aux', '10 MHz mode', 'switch') },
        {
          id: 'micsens',
          type: 'u8',
          value: { kind: 'enum', values: ['High', 'Medium', 'Low'] },
          ...ui('transmit', 'Microphone sensitivity', 'select'),
        },
        tmd710Pad('_opband'),
        tmd710Pad('_unk01c'),
        {
          id: 'rptrmode',
          type: 'u8',
          value: { kind: 'enum', values: ['Cross Band', 'TX:A-Band / RX:B-Band', 'RX:A-Band / TX:B-Band'] },
          ...ui('repeater', 'Repeater mode', 'select'),
        },
        { id: 'rptrhold', type: 'u8', value: { kind: 'boolean' }, ...ui('repeater', 'Repeater transmit hold', 'switch') },
        {
          id: 'rptridx',
          type: 'u8',
          value: { kind: 'enum', values: ['Off', 'Morse', 'Voice'] },
          ...ui('repeater', 'Repeater ID transmit', 'select'),
        },
        tmd710Pad('_unk020'),
        {
          id: 'pcbaud',
          type: 'u8',
          value: { kind: 'enum', values: ['9600', '19200', '38400', '57600'] },
          ...ui('aux', 'PC port baud rate', 'select'),
        },
        tmd710Pad('_unk022'),
        { id: 'pwdon', type: 'u8', value: { kind: 'boolean' }, ...ui('basic', 'Password enabled', 'switch') },
        tmd710Pad('_unk024', 6),
        {
          id: 'pswd',
          type: 'u8',
          value: { kind: 'ascii', length: 6, pad: 255 },
          ...ui('basic', 'Password', 'text', { description: 'Numerals 1–5 when password is enabled' }),
        },
      ],
    },
    {
      id: 'pm0A',
      seek: '0x0201',
      ...tmd710PmGroups,
      fields: [
        {
          id: 'a_mr',
          type: 'u8',
          value: { kind: 'enum', values: tmd710VfoMr },
          ...ui('display', 'A: Left side VFO/MR', 'select'),
        },
        tmd710Pad('_unk0202', 5),
        {
          id: 'a_pwr',
          type: 'u8',
          value: { kind: 'enum', values: tmd710Power },
          ...ui('transmit', 'A-band transmit power', 'select'),
        },
        { id: 'wxalerta', type: 'u8', value: { kind: 'boolean' }, ...ui('transmit', 'WX alert A-band', 'switch') },
        { id: 'asmsql', type: 'u8', value: { kind: 'boolean' }, ...ui('transmit', 'A-band S-meter SQL', 'switch') },
        {
          id: 'a_chn',
          type: 'u8',
          value: { kind: 'integer', min: 0, max: 255 },
          ...ui('display', 'A: Left side MR channel', 'integer', { description: 'Stored as one byte (0–255)' }),
        },
      ],
    },
    {
      id: 'pm0B',
      seek: '0x020d',
      ...tmd710PmGroups,
      fields: [
        {
          id: 'b_mr',
          type: 'u8',
          value: { kind: 'enum', values: tmd710VfoMr },
          ...ui('display', 'B: Right side VFO/MR', 'select'),
        },
        tmd710Pad('_unk020e', 5),
        {
          id: 'b_pwr',
          type: 'u8',
          value: { kind: 'enum', values: tmd710Power },
          ...ui('transmit', 'B-band transmit power', 'select'),
        },
        { id: 'wxalertb', type: 'u8', value: { kind: 'boolean' }, ...ui('transmit', 'WX alert B-band', 'switch') },
        { id: 'bsmsql', type: 'u8', value: { kind: 'boolean' }, ...ui('transmit', 'B-band S-meter SQL', 'switch') },
        {
          id: 'b_chn',
          type: 'u8',
          value: { kind: 'integer', min: 0, max: 255 },
          ...ui('display', 'B: Right side MR channel', 'integer', { description: 'Stored as one byte (0–255)' }),
        },
      ],
    },
    {
      id: 'pm0Control',
      seek: '0x0232',
      ...tmd710PmGroups,
      fields: [
        {
          id: 'sqclogic',
          type: 'u8',
          value: { kind: 'enum', values: ['Low', 'High'] },
          ...ui('aux', 'SQC logic', 'select'),
        },
        {
          id: 'txband',
          type: 'u8',
          value: { kind: 'enum', values: ['A: Left', 'B: Right'] },
          ...ui('transmit', 'TX side (PTT)', 'select'),
        },
        { id: 'single', type: 'u8', value: { kind: 'boolean' }, ...ui('display', 'Single band display', 'switch') },
        tmd710Pad('_unk0235'),
        { id: 'mute', type: 'u8', value: { kind: 'boolean' }, ...ui('audio', 'Mute', 'switch') },
      ],
    },
    {
      id: 'powerOn',
      seek: '0x02e0',
      ...tmd710PmGroups,
      fields: [
        {
          id: 'pwron',
          type: 'u8',
          value: { kind: 'ascii', length: 8, pad: 255 },
          ...ui('display', 'PM power-on message', 'text', {
            description: '1 is PM0 (current profile), 2–6 are PM 1–5',
          }),
        },
      ],
    },
    {
      id: 'pm0Memory',
      seek: '0x02f0',
      ...tmd710PmGroups,
      fields: [
        {
          id: 'memgrplk',
          type: 'u8',
          value: { kind: 'ascii', length: 10, pad: 255 },
          ...ui('memory', 'Group link', 'text'),
        },
      ],
    },
    {
      id: 'pm0',
      seek: '0x0350',
      ...tmd710PmGroups,
      fields: [
        { id: 'beepon', type: 'u8', value: { kind: 'boolean' }, ...ui('audio', 'Beep on', 'switch') },
        {
          id: 'beepvol',
          type: 'u8',
          value: { kind: 'enum', values: tmd710Level(1, 7) },
          ...ui('audio', 'Beep volume', 'select'),
        },
        {
          id: 'extspkr',
          type: 'u8',
          value: { kind: 'enum', values: ['Mode1', 'Mode2'] },
          ...ui('audio', 'External speaker', 'select'),
        },
        {
          id: 'ance',
          type: 'u8',
          value: { kind: 'enum', values: ['Off', 'Auto', 'Manual'] },
          ...ui('audio', 'Announce mode', 'select'),
        },
        {
          id: 'lang',
          type: 'u8',
          value: { kind: 'enum', values: ['English', 'Japanese'] },
          ...ui('audio', 'Announce language', 'select'),
        },
        {
          id: 'vcvol',
          type: 'u8',
          value: { kind: 'enum', values: tmd710Level(1, 7) },
          ...ui('audio', 'Voice volume', 'select'),
        },
        {
          id: 'vcspd',
          type: 'u8',
          value: { kind: 'integer', min: 0, max: 4 },
          ...ui('audio', 'Voice speed', 'integer'),
        },
        { id: 'pbkrpt', type: 'u8', value: { kind: 'boolean' }, ...ui('audio', 'VGS playback repeat', 'switch') },
        {
          id: 'pbkint',
          type: 'u8',
          value: { kind: 'integer', min: 0, max: 60 },
          ...ui('audio', 'VGS playback interval (s)', 'integer'),
        },
        { id: 'cntrec', type: 'u8', value: { kind: 'boolean' }, ...ui('audio', 'Continuous recording', 'switch') },
        { id: 'vhfaip', type: 'u8', value: { kind: 'boolean' }, ...ui('transmit', 'VHF band AIP', 'switch') },
        { id: 'uhfaip', type: 'u8', value: { kind: 'boolean' }, ...ui('transmit', 'UHF band AIP', 'switch') },
        {
          id: 'ssqlhu',
          type: 'u8',
          value: { kind: 'enum', values: ['Off', '125', '250', '500'] },
          ...ui('transmit', 'S-meter SQL hang time (ms)', 'select'),
        },
        {
          id: 'mutehu',
          type: 'u8',
          value: { kind: 'enum', values: ['Off', '125', '250', '500', '750', '1000'] },
          ...ui('transmit', 'RX mute hang time (ms)', 'select'),
        },
        { id: 'beatshft', type: 'u8', value: { kind: 'boolean' }, ...ui('transmit', 'Beat shift', 'switch') },
        {
          id: 'tot',
          type: 'u8',
          value: { kind: 'enum', values: ['3', '5', '10'] },
          ...ui('transmit', 'Time-out timer (min)', 'select'),
        },
        {
          id: 'recall',
          type: 'u8',
          value: { kind: 'enum', values: ['All Bands', 'Current Band'] },
          ...ui('memory', 'Memory recall method', 'select'),
        },
        {
          id: 'eclnkspd',
          type: 'u8',
          value: { kind: 'enum', values: ['Fast', 'Slow'] },
          ...ui('memory', 'EchoLink speed', 'select'),
        },
        { id: 'dtmfhld', type: 'u8', value: { kind: 'boolean' }, ...ui('dtmf', 'DTMF hold', 'switch') },
        {
          id: 'dtmfspd',
          type: 'u8',
          value: { kind: 'enum', values: ['Fast', 'Slow'] },
          ...ui('dtmf', 'DTMF speed', 'select'),
        },
        {
          id: 'dtmfpau',
          type: 'u8',
          value: { kind: 'enum', values: ['100', '250', '500', '750', '1000', '1500', '2000'] },
          ...ui('dtmf', 'DTMF pause (ms)', 'select'),
        },
        { id: 'dtmflck', type: 'u8', value: { kind: 'boolean' }, ...ui('dtmf', 'DTMF lock', 'switch') },
        { id: 'rptrofst', type: 'u8', value: { kind: 'boolean' }, ...ui('repeater', 'Auto repeater offset', 'switch') },
        { id: 'rptr1750', type: 'u8', value: { kind: 'boolean' }, ...ui('repeater', '1750 Hz transmit hold', 'switch') },
        {
          id: 'bright',
          type: 'u8',
          value: { kind: 'integer', min: 0, max: 8 },
          ...ui('display', 'Brightness', 'integer'),
        },
        { id: 'autobri', type: 'u8', value: { kind: 'boolean' }, ...ui('display', 'Auto brightness', 'switch') },
        {
          id: 'bkltclr',
          type: 'u8',
          value: { kind: 'enum', values: ['Amber', 'Green'] },
          ...ui('display', 'Backlight color', 'select'),
        },
        {
          id: 'pf1key',
          type: 'u8',
          value: { kind: 'enum', values: tmd710PfFront },
          ...ui('keys', 'Front panel PF1', 'select'),
        },
        {
          id: 'pf2key',
          type: 'u8',
          value: { kind: 'enum', values: tmd710PfFront },
          ...ui('keys', 'Front panel PF2', 'select'),
        },
        {
          id: 'micpf1',
          type: 'u8',
          value: { kind: 'enum', values: tmd710PfMic },
          ...ui('keys', 'Microphone PF1', 'select'),
        },
        {
          id: 'micpf2',
          type: 'u8',
          value: { kind: 'enum', values: tmd710PfMic },
          ...ui('keys', 'Microphone PF2', 'select'),
        },
        {
          id: 'micpf3',
          type: 'u8',
          value: { kind: 'enum', values: tmd710PfMic },
          ...ui('keys', 'Microphone PF3', 'select'),
        },
        {
          id: 'micpf4',
          type: 'u8',
          value: { kind: 'enum', values: tmd710PfMic },
          ...ui('keys', 'Microphone PF4', 'select'),
        },
        { id: 'miclck', type: 'u8', value: { kind: 'boolean' }, ...ui('keys', 'Microphone key lock', 'switch') },
        tmd710Pad('_unk0372'),
        {
          id: 'scnrsm',
          type: 'u8',
          value: { kind: 'enum', values: ['Time (TO)', 'Carrier (CO)', 'Seek'] },
          ...ui('aux', 'Scan resume', 'select'),
        },
        {
          id: 'apo',
          type: 'u8',
          value: { kind: 'enum', values: ['Off', '30', '60', '90', '120', '180'] },
          ...ui('aux', 'Auto power off (min)', 'select'),
        },
        {
          id: 'extband',
          type: 'u8',
          value: { kind: 'enum', values: tmd710TncBand },
          ...ui('aux', 'External TNC band', 'select'),
        },
        {
          id: 'extbaud',
          type: 'u8',
          value: { kind: 'enum', values: ['1200', '9600'] },
          ...ui('aux', 'External TNC baud', 'select'),
        },
        {
          id: 'sqcsrc',
          type: 'u8',
          value: { kind: 'enum', values: ['Off', 'BUSY', 'SQL', 'TX', 'BUSY/TX', 'SQL/TX'] },
          ...ui('aux', 'SQC output source', 'select'),
        },
        { id: 'autopm', type: 'u8', value: { kind: 'boolean' }, ...ui('display', 'Auto PM store', 'switch') },
        { id: 'dispbar', type: 'u8', value: { kind: 'boolean' }, ...ui('display', 'Display partition bar', 'switch') },
        tmd710Pad('_unk037a'),
        {
          id: 'bkltcont',
          type: 'u8',
          value: { kind: 'enum', values: tmd710Level(1, 16) },
          ...ui('display', 'Contrast', 'select'),
        },
        {
          id: 'dsprev',
          type: 'u8',
          value: { kind: 'enum', values: ['Positive', 'Negative'] },
          ...ui('display', 'Color mode', 'select'),
        },
        {
          id: 'vsmode',
          type: 'u8',
          value: { kind: 'enum', values: ['Mode 1: 1ch', 'Mode 2: 61ch', 'Mode 3: 91ch', 'Mode 4: 181ch'] },
          ...ui('aux', 'Visual scan', 'select'),
        },
        {
          id: 'intband',
          type: 'u8',
          value: { kind: 'enum', values: tmd710TncBand },
          ...ui('aux', 'Internal TNC band', 'select'),
        },
        {
          id: 'wxscntm',
          type: 'u8',
          value: { kind: 'enum', values: ['Off', '15', '30', '60'] },
          ...ui('transmit', 'WX alert scan time (min)', 'select'),
        },
        {
          id: 'scntot',
          type: 'u8',
          value: { kind: 'enum', values: tmd710Level(1, 10) },
          ...ui('aux', 'Scan TO delay (s)', 'select'),
        },
        {
          id: 'scncot',
          type: 'u8',
          value: { kind: 'enum', values: tmd710Level(1, 10) },
          ...ui('aux', 'Scan CO delay (s)', 'select'),
        },
      ],
    },
    {
      id: 'pm0Bands',
      seek: '0x0390',
      ...tmd710PmGroups,
      fields: [
        { id: 'abnd118', type: 'u8', value: { kind: 'boolean' }, ...ui('bands', 'A/Left: 118 MHz', 'switch') },
        { id: 'abnd144', type: 'u8', value: { kind: 'boolean' }, ...ui('bands', 'A/Left: 144 MHz', 'switch') },
        { id: 'abnd220', type: 'u8', value: { kind: 'boolean' }, ...ui('bands', 'A/Left: 220 MHz', 'switch') },
        { id: 'abnd300', type: 'u8', value: { kind: 'boolean' }, ...ui('bands', 'A/Left: 300 MHz', 'switch') },
        { id: 'abnd430', type: 'u8', value: { kind: 'boolean' }, ...ui('bands', 'A/Left: 430 MHz', 'switch') },
        { id: 'bbnd144', type: 'u8', value: { kind: 'boolean' }, ...ui('bands', 'B/Right: 144 MHz', 'switch') },
        { id: 'bbnd220', type: 'u8', value: { kind: 'boolean' }, ...ui('bands', 'B/Right: 220 MHz', 'switch') },
        { id: 'bbnd300', type: 'u8', value: { kind: 'boolean' }, ...ui('bands', 'B/Right: 300 MHz', 'switch') },
        { id: 'bbnd430', type: 'u8', value: { kind: 'boolean' }, ...ui('bands', 'B/Right: 430 MHz', 'switch') },
        { id: 'bbnd800', type: 'u8', value: { kind: 'boolean' }, ...ui('bands', 'B/Right: 800 MHz', 'switch') },
      ],
    },
    {
      id: 'vfos',
      seek: '0x0240',
      count: 10,
      stride: 16,
      fields: [
        {
          id: 'freq',
          type: 'u32',
          value: { kind: 'integer' },
          ...ui('vfo', 'VFO frequency (Hz)', 'integer'),
        },
        {
          id: 'tuning_step',
          type: 'u8',
          value: { kind: 'enum', values: tmd710Steps },
          ...ui('vfo', 'VFO tuning step (kHz)', 'select'),
        },
        {
          id: 'mode',
          type: 'u8',
          value: { kind: 'enum', values: ['FM', 'NFM', 'AM'] },
          ...ui('vfo', 'VFO mode', 'select'),
        },
        { id: '_tmode_hi', type: 'bits', width: 1, reserved: true },
        { id: 'tone_mode', type: 'bits', width: 1, value: { kind: 'boolean' } },
        { id: 'ctcss_mode', type: 'bits', width: 1, value: { kind: 'boolean' } },
        { id: 'dtcs_mode', type: 'bits', width: 1, value: { kind: 'boolean' } },
        {
          id: 'duplex',
          type: 'bits',
          width: 4,
          value: { kind: 'enum', values: ['', '+', '-', '', 'split'] },
          ...ui('vfo', 'VFO duplex', 'select'),
        },
        { id: 'rtone', type: 'u8', value: { kind: 'ctcss-index', values: kenwoodTonesTenths } },
        { id: 'ctone', type: 'u8', value: { kind: 'ctcss-index', values: kenwoodTonesTenths } },
        { id: 'dtcs_code', type: 'u8', value: { kind: 'dcs-index', values: dtcsCodes } },
        { id: 'offset', type: 'u32', value: { kind: 'integer' } },
        {
          id: 'split_tuning_step',
          type: 'u8',
          value: { kind: 'enum', values: tmd710Steps },
        },
        { id: '_cross', type: 'u8', reserved: true },
      ],
    },
    {
      id: 'progvfo',
      seek: '0x0300',
      count: 10,
      stride: 8,
      fields: [
        {
          id: 'blow',
          type: 'u32',
          value: { kind: 'integer' },
          ...ui('vfo', 'VFO low limit (Hz)', 'integer'),
        },
        {
          id: 'bhigh',
          type: 'u32',
          value: { kind: 'integer' },
          ...ui('vfo', 'VFO high limit (Hz)', 'integer'),
        },
      ],
    },
    {
      id: 'dtmfCodes',
      seek: '0x0030',
      count: 10,
      stride: 16,
      fields: [
        {
          id: 'code',
          type: 'u8',
          value: { kind: 'ascii', length: 16, pad: 255 },
          ...ui('dtmf', 'DTMF code', 'text'),
        },
      ],
    },
    {
      id: 'dtmfNames',
      seek: '0x00d0',
      count: 10,
      stride: 8,
      fields: [
        {
          id: 'name',
          type: 'u8',
          value: { kind: 'ascii', length: 8, pad: 255 },
          ...ui('dtmf', 'DTMF name', 'text'),
        },
      ],
    },
    {
      id: 'repeaterId',
      seek: '0x0170',
      fields: [
        {
          id: 'rptrid',
          type: 'u8',
          value: { kind: 'ascii', length: 12, pad: 255 },
          ...ui('repeater', 'Repeater ID', 'text'),
        },
      ],
    },
    {
      id: 'pmNames',
      seek: '0x7da0',
      count: 5,
      stride: 16,
      fields: [
        {
          id: 'pmname',
          type: 'u8',
          value: { kind: 'ascii', length: 16, pad: 255 },
          ...ui('basic', 'PM group name', 'text', { description: 'MCP names at 0x7DA0 (PM 1–5)' }),
        },
      ],
    },
    {
      id: 'pmListNames',
      seek: '0xff00',
      count: 5,
      stride: 16,
      fields: [
        {
          id: 'name',
          type: 'u8',
          value: { kind: 'ascii', length: 16, pad: 0 },
          ...ui('basic', 'PM list name', 'text', { description: 'Names stored in the clone tail (PM 1–5)' }),
        },
      ],
    },
    {
      id: 'mcpComment',
      seek: '0x7df0',
      fields: [
        {
          id: 'comment',
          type: 'u8',
          value: { kind: 'ascii', length: 32, pad: 255 },
          ...ui('basic', 'Comment', 'text'),
        },
      ],
    },
    {
      id: 'aprs',
      seek: '0x8100',
      fields: [
        {
          id: 'mycall',
          type: 'u8',
          value: { kind: 'ascii', length: 9, pad: 0 },
          ...ui('aprs', 'My callsign', 'text'),
        },
        tmd710Pad('_unk8109', 6),
        {
          id: 'ssid',
          type: 'u8',
          value: { kind: 'enum', values: tmd710Ssid },
          ...ui('aprs', 'My SSID', 'select'),
        },
      ],
    },
    {
      id: 'aprsStatus',
      seek: '0x8314',
      fields: [
        { id: 'enabled', type: 'u8', value: { kind: 'boolean' }, ...ui('aprs', 'Status text enabled', 'switch') },
        {
          id: 'text',
          type: 'u8',
          value: { kind: 'ascii', length: 42, pad: 0 },
          ...ui('aprs', 'Status text', 'text'),
        },
      ],
    },
    {
      id: 'aprsMsgGroup',
      seek: '0x83f6',
      fields: [
        {
          id: 'groups',
          type: 'u8',
          value: { kind: 'ascii', length: 32, pad: 0 },
          ...ui('aprs', 'Message group', 'text'),
        },
      ],
    },
    {
      id: 'aprsComment',
      seek: '0x8540',
      fields: [
        {
          id: 'comment',
          type: 'u8',
          value: { kind: 'ascii', length: 8, pad: 0 },
          ...ui('aprs', 'APRS comment', 'text'),
        },
      ],
    },
    {
      id: 'skyCommand',
      seek: '0x8660',
      fields: [
        {
          id: 'cmdr',
          type: 'u8',
          value: { kind: 'ascii', length: 10, pad: 0 },
          ...ui('sky', 'Commander call sign', 'text'),
        },
        {
          id: 'tptr',
          type: 'u8',
          value: { kind: 'ascii', length: 10, pad: 0 },
          ...ui('sky', 'Transporter call sign', 'text'),
        },
        {
          id: 'skytone',
          type: 'u8',
          value: { kind: 'enum', values: tmd710SkyTones },
          ...ui('sky', 'Sky Command tone (Hz)', 'select'),
        },
      ],
    },
  ],
  channelBindings: {
    records: 'channels',
    names: 'names',
    nameField: 'name',
    extras: 'flags',
    receiveFrequency: 'freq',
    transmitFrequency: 'offset',
    receiveTone: 'ctone',
    transmitTone: 'rtone',
  },
};

writeFileSync(join(rootDirectory, 'src/shared/memory-maps/th-d74-settings.json'), `${JSON.stringify(thd74Map, null, 2)}\n`);
writeFileSync(join(rootDirectory, 'src/shared/memory-maps/th-f6-settings.json'), `${JSON.stringify(thf6Map, null, 2)}\n`);
writeFileSync(join(rootDirectory, 'src/shared/memory-maps/tm-d710a-settings.json'), `${JSON.stringify(tmd710Map, null, 2)}\n`);
console.log('wrote Kenwood memory maps');
