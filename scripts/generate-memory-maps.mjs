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

writeFileSync(join(rootDirectory, 'src/shared/memory-maps/th-d74-settings.json'), `${JSON.stringify(thd74Map, null, 2)}\n`);
writeFileSync(join(rootDirectory, 'src/shared/memory-maps/th-f6-settings.json'), `${JSON.stringify(thf6Map, null, 2)}\n`);
console.log('wrote Kenwood memory maps');
