// Создаёт небольшую тестовую папку с настоящими WAV/AIFF-файлами (русские и английские имена),
// чтобы проверить сканер и интерфейс без своей библиотеки: node scripts/make-demo-library.js <папка>
'use strict';
const fs = require('fs');
const path = require('path');

function wav(samples, { sr = 44100, bits = 16, ch = 1, acidBpm = null } = {}) {
  const bps = bits / 8;
  const data = Buffer.alloc(samples.length * bps * ch);
  samples.forEach((v, i) => {
    for (let c = 0; c < ch; c++) {
      const o = (i * ch + c) * bps;
      const x = Math.max(-1, Math.min(1, v));
      if (bits === 16) data.writeInt16LE(Math.round(x * 32767), o);
      else data.writeIntLE(Math.round(x * 8388607), o, 3);
    }
  });
  const chunks = [];
  const fmt = Buffer.alloc(24);
  fmt.write('fmt ', 0); fmt.writeUInt32LE(16, 4); fmt.writeUInt16LE(1, 8); fmt.writeUInt16LE(ch, 10);
  fmt.writeUInt32LE(sr, 12); fmt.writeUInt32LE(sr * ch * bps, 16); fmt.writeUInt16LE(ch * bps, 20); fmt.writeUInt16LE(bits, 22);
  chunks.push(fmt);
  if (acidBpm) {
    const a = Buffer.alloc(32);
    a.write('acid', 0); a.writeUInt32LE(24, 4); a.writeUInt32LE(0, 8); a.writeFloatLE(acidBpm, 28);
    chunks.push(a);
  }
  const dh = Buffer.alloc(8); dh.write('data', 0); dh.writeUInt32LE(data.length, 4);
  chunks.push(dh, data);
  const body = Buffer.concat(chunks);
  const head = Buffer.alloc(12); head.write('RIFF', 0); head.writeUInt32LE(4 + body.length, 4); head.write('WAVE', 8);
  return Buffer.concat([head, body]);
}

function aiff(samples, sr = 44100) {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((v, i) => data.writeInt16BE(Math.round(v * 32767), i * 2));
  const comm = Buffer.alloc(26);
  comm.write('COMM', 0); comm.writeUInt32BE(18, 4); comm.writeUInt16BE(1, 8); comm.writeUInt32BE(samples.length, 10); comm.writeUInt16BE(16, 14);
  // 44100 в 80-битном формате
  const exp = 16383 + Math.floor(Math.log2(sr));
  comm.writeUInt16BE(exp, 16);
  comm.writeUInt32BE(Math.round((sr / 2 ** Math.floor(Math.log2(sr))) * 2 ** 31), 18);
  const ssnd = Buffer.alloc(16); ssnd.write('SSND', 0); ssnd.writeUInt32BE(8 + data.length, 4);
  const body = Buffer.concat([Buffer.from('AIFF'), comm, ssnd, data]);
  const head = Buffer.alloc(8); head.write('FORM', 0); head.writeUInt32BE(body.length, 4);
  return Buffer.concat([head, body]);
}

const SR = 44100;
const gen = {
  kick: (d) => Array.from({ length: d * SR }, (_, i) => { const t = i / SR; return Math.sin(2 * Math.PI * (50 + 120 * Math.exp(-t * 30)) * t) * Math.exp(-t * 6); }),
  noise: (d, decay = 8) => Array.from({ length: d * SR }, (_, i) => (Math.random() * 2 - 1) * Math.exp(-(i / SR) * decay) * 0.7),
  tone: (d, f = 220) => Array.from({ length: d * SR }, (_, i) => { const t = i / SR; return Math.sin(2 * Math.PI * f * t) * 0.4 * Math.min(1, t * 4) * Math.min(1, (d - t) * 2); }),
  amb: (d) => { let y = 0; return Array.from({ length: d * SR }, (_, i) => { y = y * 0.995 + (Math.random() * 2 - 1) * 0.02; return y * 3 * Math.min(1, i / SR / 2); }); },
};

const files = [
  ['Drums/Kicks/Kick_Punchy_01.wav', () => wav(gen.kick(0.5))],
  ['Drums/Kicks/KCK_Deep_02.wav', () => wav(gen.kick(0.7), { bits: 24 })],
  ['Drums/Snares/Snare_Tight_01.wav', () => wav(gen.noise(0.3, 14))],
  ['Drums/Hats/OH_Dusty_04.wav', () => wav(gen.noise(0.4, 10))],
  ['Ударные/Бочки/бочка_жирная_03.wav', () => wav(gen.kick(0.6), { bits: 24, sr: 48000 })],
  ['Ударные/Перкуссия/Шейкер_02.wav', () => wav(gen.noise(0.2, 20))],
  ['Loops/Funky_Break_95bpm.wav', () => wav(gen.noise(2.5, 0.5))],
  ['Loops/Groove_Room.wav', () => wav(gen.noise(2, 0.5), { acidBpm: 124 })],
  ['Synth/Pads/Pad_Warm_Cmin.wav', () => wav(gen.tone(6, 130.8), { ch: 2 })],
  ['Synth/Lead_Glassy_F#m.aif', () => aiff(gen.tone(1.5, 370))],
  ['Bass/808_Long_F.wav', () => wav(gen.tone(2, 43.6))],
  ['Атмосферы/Гул подвал.wav', () => wav(gen.amb(25), { ch: 2 })],
  ['Атмосферы/Ветер в поле 02.wav', () => wav(gen.amb(22))],
  ['Полевые записи/Дождь_по_крыше_01.wav', () => wav(gen.noise(4, 0))],
  ['Эффекты/Свуш_быстрый_01.wav', () => wav(gen.noise(1.2, 3))],
  ['FX/Risers/Riser_Dark_01.wav', () => wav(gen.noise(4, -0.5).map((v) => v * 0.1))],
  ['Фоли/Шаги_по_снегу_03.wav', () => wav(gen.noise(1.5, 4))],
  ['Голоса/Фраза_привет.wav', () => wav(gen.tone(1, 180))],
  ['Misc/rec_0042.wav', () => wav(gen.tone(1, 440))],
];

const out = process.argv[2] || path.join(process.cwd(), 'demo-samples');
for (const [rel, make] of files) {
  const p = path.join(out, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, make());
}
console.log(`Готово: ${files.length} файлов в ${out}`);
