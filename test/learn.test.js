'use strict';
const test = require('node:test');
const assert = require('node:assert');
const C = require('../src/shared/categorize');
const L = require('../src/shared/learn');

function item(rel) {
  const seg = rel.split('/');
  const r = C.classify(seg, 2);
  return { path: '/lib/' + rel, rel, name: seg[seg.length - 1].replace(/\.[^.]+$/, ''), duration: 2, cat: r.cat, sub: r.sub };
}

test('учится на ручном исправлении и переносит похожие звуки', () => {
  const items = [
    item('Recordings/Hydrophone Soap Drop 01.wav'),
    item('Recordings/Hydrophone Pool 02.wav'),
    item('Other pack/Hydrophone Lake.wav'),
    item('Other pack/Kick Hard.wav'),
  ];
  assert.notStrictEqual(items[1].sub, 'weather.water');
  const res = L.relearn({ items, overrides: { [items[0].path]: { cat: 'weather', sub: 'weather.water' } } });
  assert.ok(res.learned.some((l) => l.word === 'hydrophone' && l.id === 'weather.water'));
  assert.strictEqual(res.items[1].sub, 'weather.water');
  assert.strictEqual(res.items[2].sub, 'weather.water');
  assert.strictEqual(res.items[3].sub, 'music.drums');
  // Забытое слово больше не действует.
  const again = L.relearn({ items, overrides: { [items[0].path]: { cat: 'weather', sub: 'weather.water' } }, forgotten: ['hydrophone'] });
  assert.notStrictEqual(again.items[2].sub, 'weather.water');
});

test('свои категории важнее встроенных', () => {
  const items = [item('Pack/Kick Project X.wav'), item('Pack/Rain soft.wav')];
  const res = L.relearn({ items, custom: [{ id: 'user-x', name: 'Проект X', words: ['project x', 'проект икс'] }] });
  assert.strictEqual(res.items[0].cat, 'user-x');
  assert.strictEqual(res.items[1].sub, 'weather.rain');
});

test('сам выучивает незнакомое слово из библиотеки', () => {
  const items = [];
  for (let i = 0; i < 6; i++) items.push(item(`Folder${i}/Explosion Kaboom ${i}.wav`));
  items.push(item('Misc/Kaboom 99.wav'));
  assert.strictEqual(items[6].cat, 'other');
  const res = L.relearn({ items });
  assert.strictEqual(res.items[6].sub, 'weapons.explosions');
});

test('соседи по папке и нейросеть помогают звукам без категории', () => {
  const items = [item('Pack1/Dog bark 1.wav'), item('Pack1/Dog bark 2.wav'), item('Pack1/Dog growl 3.wav'), item('Pack1/zzqx 4.wav'), item('Misc/rec_0042.wav')];
  items[4].ai = { cat: 'animals.cats', conf: 0.8, labels: [['Meow', 0.8]] };
  const res = L.relearn({ items });
  assert.strictEqual(res.items[3].sub, 'animals.dogs');
  assert.strictEqual(res.items[3].how, 'folder');
  assert.strictEqual(res.items[4].sub, 'animals.cats');
  assert.strictEqual(res.items[4].how, 'audio');
});
