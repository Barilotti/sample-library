'use strict';
const test = require('node:test');
const assert = require('node:assert');
const C = require('../src/shared/categorize');

const cases = [
  ['Drums/Kicks/Kick_Hard_01.wav', 'drums', 'kick'],
  ['Сэмплы/Ударные/бочки/бочка_жирная.wav', 'drums', 'kick'],
  ['misc/bochka_02.wav', 'drums', 'kick'],
  ['Kick One Shot 4.wav', 'drums', 'kick'],
  ['Hats/OH_02.wav', 'drums', 'hihat'],
  ['Перкуссия/Шейкер.wav', 'drums', 'perc'],
  ['Synth/Pad_Warm_Cmin.wav', 'synth', 'pad'],
  ['FX/Risers/Riser_Long_01.wav', 'fx', 'transition'],
  ['Эффекты/Свуш_быстрый_01.wav', 'fx', 'transition'],
  ['UI/Click_Soft.wav', 'fx', 'ui'],
  ['Звуки/Шаги по снегу 03.wav', 'foley', null],
  ['Звуки/Выстрел_пистолет_01.wav', 'weapons', null],
  ['city/Улица_Москва_трафик.wav', 'field', null],
  ['Атмосферы/Гул подвал.wav', 'ambient', null],
  ['Голос/фраза_привет.wav', 'vocal', null],
  ['Животные/Лай собаки.wav', 'animals', null],
  ['Random/лестница.wav', 'other', null],
];

test('категории по имени и папкам (RU/EN)', () => {
  for (const [p, cat, sub] of cases) {
    const r = C.classify(p.split('/'), 1);
    assert.strictEqual(r.cat, cat, p);
    if (sub !== undefined) assert.strictEqual(r.sub, sub, p);
  }
});

test('BPM и тональность', () => {
  assert.strictEqual(C.detectBpm('Funky_Break_95bpm'), 95);
  assert.strictEqual(C.detectBpm('Loop_Trap_140_Am'), 140);
  assert.strictEqual(C.detectBpm('Kick_808_01'), null);
  assert.strictEqual(C.detectKey('Pad_Warm_Cmin'), 'Cm');
  assert.strictEqual(C.detectKey('Choir_Ah_A minor'), 'Am');
  assert.strictEqual(C.detectKey('Pad_ля минор'), 'Am');
  assert.strictEqual(C.detectKey('Kick_A'), null);
  assert.strictEqual(C.detectKey('808_Long_F#', true), 'F#');
});

test('поиск понимает русский и транслит', () => {
  assert.ok(C.categoriesForQueryWord('бочка').has('kick'));
  assert.ok(C.categoriesForQueryWord('бочки').has('kick'));
  assert.ok(C.categoriesForQueryWord('veter').has('field'));
  assert.ok(C.categoriesForQueryWord('дождь').has('field'));
});

test('тип: луп, ваншот, длинный', () => {
  assert.strictEqual(C.classify(['Loops', 'Break_95bpm.wav'], 4).type, 'loop');
  assert.strictEqual(C.classify(['Kick.wav'], 0.4).type, 'oneshot');
  assert.strictEqual(C.classify(['Атмосферы', 'Гул.wav'], 60).type, 'long');
});
