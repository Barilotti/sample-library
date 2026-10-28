'use strict';
const test = require('node:test');
const assert = require('node:assert');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { scanFolder } = require('../src/main/scanner');

test('сканер читает WAV/AIFF, ACID-темп и не трогает файлы', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'samples-'));
  execFileSync(process.execPath, [path.join(__dirname, '..', 'scripts', 'make-demo-library.js'), dir]);
  const before = fs.readdirSync(dir, { recursive: true }).sort();
  const items = await scanFolder(dir);
  assert.strictEqual(items.length, 19);
  const by = (n) => items.find((i) => i.name === n);
  assert.strictEqual(by('Groove_Room').bpm, 124);
  assert.strictEqual(by('Groove_Room').type, 'loop');
  assert.strictEqual(by('KCK_Deep_02').bits, 24);
  assert.ok(Math.abs(by('Lead_Glassy_F#m').duration - 1.5) < 0.01);
  assert.strictEqual(by('Lead_Glassy_F#m').sampleRate, 44100);
  assert.strictEqual(by('бочка_жирная_03').sub, 'kick');
  assert.deepStrictEqual(fs.readdirSync(dir, { recursive: true }).sort(), before);

  // Повторный скан берёт неизменённые файлы из кэша.
  const prev = new Map(items.map((i) => [i.path, i]));
  const again = await scanFolder(dir, { previous: prev });
  assert.ok(again.every((i) => prev.get(i.path) === i));
  fs.rmSync(dir, { recursive: true, force: true });
});
