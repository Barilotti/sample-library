'use strict';
const test = require('node:test');
const assert = require('node:assert');
const C = require('../src/shared/categorize');

const cases = [
  ['Drums/Kicks/Kick_Hard_01.wav', 'music', 'music.drums'],
  ['Сэмплы/Ударные/бочки/бочка_жирная.wav', 'music', 'music.drums'],
  ['misc/bochka_02.wav', 'music', 'music.drums'],
  ['Synth/Pad_Warm_Cmin.wav', 'music', 'music.synth'],
  ['FX/Risers/Riser_Long_01.wav', 'whoosh', 'whoosh.risers'],
  ['Эффекты/Свуш_быстрый_01.wav', 'whoosh', null],
  ['UI/Click_Soft.wav', 'ui', 'ui.clicks'],
  ['Звуки/Шаги по снегу 03.wav', 'foley', 'foley.footsteps'],
  ['Звуки/Выстрел_пистолет_01.wav', 'weapons', 'weapons.guns'],
  ['city/Улица_Москва_трафик.wav', 'ambience', 'ambience.city'],
  ['Атмосферы/Гул подвал.wav', 'ambience', 'ambience.drones'],
  ['Голос/фраза_привет.wav', 'human', 'human.speech'],
  ['Животные/Лай собаки.wav', 'animals', 'animals.dogs'],
  ['Random/кракозябра.wav', 'other', null],
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
  assert.ok(C.categoriesForQueryWord('бочка').has('music.drums'));
  assert.ok(C.categoriesForQueryWord('бочки').has('music.drums'));
  assert.ok(C.categoriesForQueryWord('veter').has('weather.wind'));
  assert.ok(C.categoriesForQueryWord('дождь').has('weather.rain'));
});

test('тип: луп, ваншот, длинный', () => {
  assert.strictEqual(C.classify(['Loops', 'Break_95bpm.wav'], 4).type, 'loop');
  assert.strictEqual(C.classify(['Kick.wav'], 0.4).type, 'oneshot');
  assert.strictEqual(C.classify(['Атмосферы', 'Гул.wav'], 60).type, 'long');
});

test('перевод запросов RU/EN и слитные слова', () => {
  assert.ok(C.synonymForms('dog').includes('собак'));
  assert.ok(C.synonymForms('dogs').includes('собак'));
  assert.ok(C.synonymForms('bark').includes('лай'));
  assert.ok(C.synonymForms('дождь').includes('rain'));
  assert.ok(C.synonymForms('шаги').includes('footsteps'));
  assert.deepStrictEqual(C.synonymForms('docs'), []);
  assert.deepStrictEqual(C.splitCompound('dogbark'), ['dog', 'bark']);
  assert.deepStrictEqual(C.splitCompound('kickdrum'), ['kick', 'drum']);
  assert.strictEqual(C.splitCompound('notification'), null);
});

test('реальные названия из библиотеки команды', () => {
  const cat = (p) => { const r = C.classify(p.split('/'), null); return r.sub || r.cat; };
  const real = [
    ['Boom Library - Magic Bundle/boom35_1/MACK Effect Impact Sub Rumble.wav', 'magic'],
    ['Boom Library - Magic Bundle/boom35_3/MACK Fire Burst Spirit Light.wav', 'magic.fire'],
    ['Element Series - Water [SoundMorph]/WAV/Acid/MAGElem_WATER - Acid Demon 05.wav', 'magic.dark'],
    ['BOOM.Library.DOGS.WAV/Dogs_01-07/Australian Shepherd (Pepper) Bark, Yelp 1.wav', 'animals.dogs'],
    ['BOOM.Library.DOGS.WAV/Dogs_01-07/Border Collie (Lilu) Eat 1.wav', 'animals.dogs'],
    ['KROTOS/Krotos Gun Foley SFX Library WAV/Pistol Slide.wav', 'weapons.guns'],
    ['Boom ONE/BLUNT/WEAPBlnt_Hammer 1h Movement Soft_B00M_ONE.wav', 'weapons.melee'],
    ['Новая папка/Аварии/Лобовое столкновение.mp3', 'vehicles.crash'],
    ['Новая папка/Анатомические звуки/Мужчина зевает.mp3', 'human.body'],
    ['Armas/1. Fornite SFX PACK/Shield Break 1.mp3', 'weapons.melee'],
    ["Ambients/Дощ б'є по підвіконню.wav", 'weather.rain'],
    ['Ambients/Ніч біля ставка.flac', 'ambience.nature'],
    ['Ambients/звукилеса.wav', 'ambience.nature'],
    ['Ambients/Сукалёгкийдождь.wav', 'weather.rain'],
    ['Ambients/ахуєнийгул6хвилин.flac', 'ambience.drones'],
    ['Ambients/Хлопають1годину.flac', 'crowds.applause'],
    ['Ambients/ES_City Traffic 18 - SFX Producer.mp3', 'ambience.city'],
    ['Новая папка/Видео и аудио техника/ГРАММОФОН, ПОЦАРАПАННАЯ ДОРОЖКА.mp3', 'tech.computers'],
    ['Новая папка/Другие/ЛЕД, КРОШЕНИЕ, ОДИН РАЗ 11.mp3', 'weather.snow'],
  ];
  for (const [p, want] of real) assert.strictEqual(cat(p), want, p);
});

test('ошибки из первой версии больше не повторяются', () => {
  const cat = (p) => { const r = C.classify(p.split('/'), null); return r.sub || r.cat; };
  // «Автомат» — не всегда оружие.
  assert.strictEqual(cat('Новая папка/Казино/Рулетка крутится.mp3'), 'tech.arcade');
  assert.strictEqual(cat('Новая папка/Техника/Торговый раздатчик бутылок.mp3'), 'tech.arcade');
  assert.strictEqual(cat('Новая папка/Игровой автомат, джекпот.mp3'), 'tech.arcade');
  assert.strictEqual(cat('Оружие/Автомат, очередь.mp3'), 'weapons.guns');
  // Имя файла важнее названия пака.
  assert.strictEqual(cat('KROTOS/Krotos Gun Foley SFX Library WAV/Leather Steady Soft loop.wav'), 'foley.leather');
  assert.strictEqual(cat('Boom Library - Guns Bundle/Guns - Designed/Rifle Shot 01.wav'), 'weapons.guns');
});

test('названия категорий на двух языках', () => {
  assert.strictEqual(C.labelOf('magic.fire', 'ru'), 'Огонь и фаерболы');
  assert.strictEqual(C.labelOf('magic.fire', 'en'), 'Fire Spells');
  for (const c of C.CATEGORIES) {
    assert.ok(c.labels.ru && c.labels.en, c.id);
    if (c.parent) assert.ok(C.BY_ID[c.parent], c.id);
  }
});
