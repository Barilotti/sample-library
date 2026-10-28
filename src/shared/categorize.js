// Автокатегоризация сэмплов по имени файла и пути папок.
// Работает и в Node (сканер), и в браузере (поиск в интерфейсе), поэтому без зависимостей.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Categorize = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const RULES_VERSION = 3;

  // Категории: id, название в интерфейсе, родитель, ключевые слова (en, ru, транслит).
  // Русские слова автоматически дополняются транслитом, поэтому "бочка" ловит и "bochka".
  const CATEGORIES = [
    { id: 'drums', label: 'Ударные', words: ['drum', 'drums', 'drumkit', 'kit', 'percussion', 'барабан', 'ударные', 'ударка'] },
    { id: 'kick', parent: 'drums', label: 'Бочка', words: ['kick', 'kik', 'kck', 'bd', 'bassdrum', 'бочка', 'бочки', 'кик', 'бас-бочка'] },
    { id: 'snare', parent: 'drums', label: 'Малый', words: ['snare', 'snr', 'sd', 'rimshot', 'rim', 'малый', 'снейр', 'снэр', 'рим'] },
    { id: 'clap', parent: 'drums', label: 'Хлопки', words: ['clap', 'claps', 'clp', 'snap', 'snaps', 'хлопок', 'хлопки', 'клэп', 'клап', 'щелчок пальцами'] },
    { id: 'hihat', parent: 'drums', label: 'Хэты', words: ['hihat', 'hat', 'hats', 'hh', 'oh', 'ch', 'openhat', 'closedhat', 'хэт', 'хет', 'хай-хэт', 'хайхэт'] },
    { id: 'cymbal', parent: 'drums', label: 'Тарелки', words: ['cymbal', 'crash', 'ride', 'splash', 'china', 'тарелка', 'тарелки', 'крэш', 'райд'] },
    { id: 'tom', parent: 'drums', label: 'Томы', words: ['tom', 'toms', 'floortom', 'том', 'томы'] },
    { id: 'perc', parent: 'drums', label: 'Перкуссия', words: ['perc', 'shaker', 'tambourine', 'conga', 'bongo', 'cowbell', 'clave', 'woodblock', 'triangle', 'cabasa', 'guiro', 'djembe', 'перкуссия', 'шейкер', 'бубен', 'конга', 'бонго', 'треугольник', 'маракас', 'джембе'] },
    { id: 'drumloop', parent: 'drums', label: 'Лупы ударных', words: ['break', 'breakbeat', 'breaks', 'groove', 'beat', 'topLoop', 'drumloop', 'брейк', 'бит', 'грув'] },

    { id: 'bass', label: 'Бас', words: ['bass', 'sub', 'subbass', '808', 'reese', 'bassline', 'бас', 'саб', 'басы'] },

    { id: 'synth', label: 'Синты и клавиши', words: ['synth', 'syn', 'lead', 'pluck', 'arp', 'arpeggio', 'chord', 'chords', 'stab', 'keys', 'piano', 'rhodes', 'organ', 'epiano', 'синт', 'синтезатор', 'лид', 'пианино', 'рояль', 'аккорд', 'аккорды', 'орган', 'клавиши', 'арпеджио'] },
    { id: 'pad', parent: 'synth', label: 'Пэды', words: ['pad', 'pads', 'пэд', 'пад', 'пэды'] },

    { id: 'instruments', label: 'Живые инструменты', words: ['guitar', 'gtr', 'strings', 'violin', 'cello', 'viola', 'brass', 'trumpet', 'trombone', 'horn', 'sax', 'flute', 'woodwind', 'harp', 'orchestra', 'orchestral', 'bell', 'bells', 'гитара', 'струнные', 'скрипка', 'виолончель', 'духовые', 'труба', 'тромбон', 'саксофон', 'флейта', 'арфа', 'оркестр', 'колокол', 'колокольчик', 'балалайка', 'баян', 'гармонь'] },

    { id: 'vocal', label: 'Вокал и голос', words: ['vocal', 'vocals', 'vox', 'voice', 'voices', 'choir', 'acapella', 'speech', 'talk', 'whisper', 'scream', 'shout', 'breath', 'laugh', 'вокал', 'голос', 'голоса', 'хор', 'речь', 'шёпот', 'шепот', 'крик', 'дыхание', 'смех', 'разговор', 'фраза'] },

    { id: 'ambient', label: 'Эмбиент и атмосферы', words: ['ambient', 'ambience', 'ambiance', 'amb', 'atmos', 'atmosphere', 'atmo', 'drone', 'texture', 'soundscape', 'roomtone', 'tone', 'bed', 'background', 'эмбиент', 'эмбиэнт', 'атмосфера', 'атмосферы', 'фон', 'дрон', 'текстура', 'гул', 'саундскейп', 'тишина'] },

    { id: 'field', label: 'Природа и город', words: ['field', 'fieldrec', 'nature', 'rain', 'wind', 'storm', 'thunder', 'forest', 'birds', 'bird', 'water', 'river', 'sea', 'ocean', 'waves', 'stream', 'fire', 'insects', 'night', 'city', 'street', 'traffic', 'crowd', 'market', 'park', 'subway', 'metro', 'station', 'cafe', 'restaurant', 'office', 'природа', 'дождь', 'ветер', 'гроза', 'гром', 'лес', 'птицы', 'птица', 'вода', 'река', 'море', 'океан', 'волны', 'ручей', 'огонь', 'костёр', 'костер', 'насекомые', 'сверчки', 'ночь', 'город', 'улица', 'трафик', 'толпа', 'рынок', 'парк', 'метро', 'вокзал', 'кафе', 'ресторан', 'офис', 'деревня', 'двор'] },

    { id: 'fx', label: 'Эффекты', words: ['fx', 'sfx', 'effect', 'effects', 'эффект', 'эффекты', 'звуковые'] },
    { id: 'transition', parent: 'fx', label: 'Переходы', words: ['riser', 'rise', 'uplifter', 'downlifter', 'sweep', 'whoosh', 'swoosh', 'swish', 'transition', 'reverse', 'rev', 'build', 'buildup', 'fall', 'downer', 'райзер', 'свуш', 'вжух', 'переход', 'реверс', 'подъём', 'подъем', 'нарастание', 'пролёт', 'пролет'] },
    { id: 'impact', parent: 'fx', label: 'Удары и импакты', words: ['impact', 'hit', 'hits', 'boom', 'braam', 'slam', 'thud', 'stinger', 'trailer', 'cinematic', 'импакт', 'удар', 'удары', 'бум', 'хит'] },
    { id: 'glitch', parent: 'fx', label: 'Глитч и шумы', words: ['glitch', 'noise', 'static', 'vinyl', 'crackle', 'hiss', 'distortion', 'stutter', 'bitcrush', 'глитч', 'шум', 'шумы', 'помехи', 'треск', 'винил', 'шипение'] },
    { id: 'ui', parent: 'fx', label: 'Интерфейс', words: ['ui', 'interface', 'click', 'button', 'beep', 'notification', 'alert', 'menu', 'hover', 'select', 'confirm', 'error', 'blip', 'интерфейс', 'клик', 'кнопка', 'писк', 'уведомление', 'меню', 'сигнал'] },
    { id: 'scifi', parent: 'fx', label: 'Sci-fi и магия', words: ['scifi', 'sci', 'laser', 'robot', 'spaceship', 'magic', 'spell', 'portal', 'energy', 'zap', 'teleport', 'лазер', 'робот', 'магия', 'заклинание', 'портал', 'энергия', 'космос'] },

    { id: 'foley', label: 'Фоли', words: ['foley', 'footstep', 'footsteps', 'steps', 'step', 'door', 'doors', 'cloth', 'clothes', 'fabric', 'glass', 'metal', 'wood', 'paper', 'keys', 'zipper', 'bag', 'cup', 'plate', 'chair', 'handle', 'squeak', 'creak', 'фоли', 'шаги', 'шаг', 'дверь', 'двери', 'одежда', 'ткань', 'стекло', 'металл', 'дерево', 'бумага', 'ключи', 'молния', 'сумка', 'чашка', 'тарелка', 'стул', 'скрип', 'ручка', 'посуда'] },

    { id: 'weapons', label: 'Оружие и взрывы', words: ['gun', 'guns', 'gunshot', 'shot', 'rifle', 'pistol', 'reload', 'weapon', 'weapons', 'sword', 'blade', 'punch', 'kick-hit', 'explosion', 'explode', 'blast', 'debris', 'bullet', 'ricochet', 'выстрел', 'выстрелы', 'оружие', 'пистолет', 'автомат', 'винтовка', 'перезарядка', 'меч', 'клинок', 'удар кулаком', 'взрыв', 'взрывы', 'обломки', 'пуля', 'рикошет'] },

    { id: 'vehicles', label: 'Транспорт', words: ['car', 'cars', 'engine', 'vehicle', 'truck', 'bus', 'train', 'tram', 'plane', 'airplane', 'jet', 'helicopter', 'motorcycle', 'bike', 'boat', 'ship', 'horn', 'brake', 'skid', 'машина', 'автомобиль', 'двигатель', 'мотор', 'грузовик', 'автобус', 'поезд', 'электричка', 'трамвай', 'самолёт', 'самолет', 'вертолёт', 'вертолет', 'мотоцикл', 'лодка', 'корабль', 'гудок', 'тормоз', 'клаксон'] },

    { id: 'animals', label: 'Животные', words: ['animal', 'animals', 'dog', 'cat', 'horse', 'cow', 'wolf', 'bark', 'meow', 'growl', 'roar', 'creature', 'monster', 'животное', 'животные', 'собака', 'пёс', 'пес', 'кошка', 'кот', 'лошадь', 'корова', 'волк', 'лай', 'мяу', 'рычание', 'рык', 'монстр', 'существо'] },

    { id: 'other', label: 'Без категории', words: [] },
  ];

  const BY_ID = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));

  // Транслитерация кириллицы, чтобы "veter" и "ветер" считались одним словом.
  const TR = {
    а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm',
    н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch',
    ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
  };
  const CYR = /[а-яё]/;

  function translit(s) {
    let out = '';
    for (const ch of s) out += TR[ch] !== undefined ? TR[ch] : ch;
    return out;
  }

  function normalize(s) {
    return String(s).toLowerCase().replace(/ё/g, 'е');
  }

  // Делит "KickDrum_Hard-01 (Бочка).wav" на ["kick", "drum", "hard", "бочка"].
  function tokenize(s) {
    const spaced = String(s)
      .replace(/\.[a-z0-9]{2,4}$/i, '')
      .replace(/one[\s_\-]?shots?/gi, 'oneshot')
      .replace(/([a-zа-яё])([A-ZА-ЯЁ])/g, '$1 $2')
      .replace(/([a-zA-Zа-яА-ЯёЁ])(\d)/g, '$1 $2')
      .replace(/(\d)([a-zA-Zа-яА-ЯёЁ])/g, '$1 $2');
    return normalize(spaced)
      .split(/[^a-zа-я0-9#]+/)
      .filter((t) => t && !/^\d+$/.test(t) || t === '808');
  }

  // Убирает типичные русские окончания: "бочкой" -> "бочк", "ударные" -> "ударн".
  function ruStem(w) {
    if (w.length <= 4) return w;
    return w.replace(/(ами|ями|ого|его|ому|ему|ой|ей|ий|ый|ая|яя|ое|ее|ые|ие|ов|ев|ам|ям|ах|ях|ом|ем|а|я|ы|и|у|ю|е|о|ь)$/, '');
  }

  // Индекс: слово -> [id категорий]. Многословные ключи ("удар кулаком") ищутся как фраза.
  const exact = new Map();
  const prefixes = []; // [prefix, catId]
  const phrases = []; // [phrase, catId]

  function addKey(key, id) {
    if (!exact.has(key)) exact.set(key, new Set());
    exact.get(key).add(id);
  }

  for (const cat of CATEGORIES) {
    for (const raw of cat.words) {
      const w = normalize(raw);
      if (/[\s-]/.test(w)) {
        phrases.push([w.replace(/-/g, ' '), cat.id]);
        continue;
      }
      addKey(w, cat.id);
      if (CYR.test(w)) {
        const stem = ruStem(w);
        if (stem.length >= 3) prefixes.push([stem, cat.id]);
        const lat = translit(w);
        addKey(lat, cat.id);
        if (lat.length >= 5) prefixes.push([translit(stem), cat.id]);
      } else if (w.length >= 4) {
        prefixes.push([w, cat.id]);
      }
    }
  }
  prefixes.sort((a, b) => b[0].length - a[0].length);

  // Окончания, которые разрешаем после коротких русских основ ("лес" -> "леса", но не "лестница").
  const RU_ENDINGS = /^(а|я|у|ю|е|и|ы|ом|ем|ой|ей|ам|ям|ах|ях|ов|ев|ами|ями)$/;
  function prefixOk(t, p) {
    if (t.length <= p.length || !t.startsWith(p)) return false;
    const rest = t.slice(p.length);
    if (CYR.test(p)) return p.length >= 4 ? RU_ENDINGS.test(rest) || rest.length <= 2 : RU_ENDINGS.test(rest);
    return rest.length <= 4;
  }

  function categoriesForToken(token) {
    const t = normalize(token);
    const hit = new Set(exact.get(t) || []);
    const lat = CYR.test(t) ? translit(t) : null;
    if (lat && exact.has(lat)) for (const id of exact.get(lat)) hit.add(id);
    if (hit.size) return hit;
    for (const [p, id] of prefixes) {
      if (prefixOk(t, p) || (lat && prefixOk(lat, p))) hit.add(id);
    }
    return hit;
  }

  // Ищет BPM: "120bpm", "bpm_120", "120 BPM", "_120_" в лупах.
  function detectBpm(name) {
    const s = name.replace(/\.[a-z0-9]{2,4}$/i, '');
    let m = s.match(/(\d{2,3}(?:[.,]\d+)?)\s*-?_?(?:bpm|бпм|уд)/i) || s.match(/(?:bpm|бпм|tempo)\s*-?_?(\d{2,3})/i);
    if (!m && /loop|луп|break|брейк|groove|грув/i.test(s)) m = s.match(/(?:^|[\s_\-])(\d{2,3})(?=[\s_\-]|$)/);
    if (!m) return null;
    const v = parseFloat(m[1].replace(',', '.'));
    return v >= 50 && v <= 220 ? Math.round(v * 10) / 10 : null;
  }

  // Ищет тональность: "Cmin", "F#m", "A minor", "Ab_maj", "key_Dm", "ля минор".
  // Голую ноту ("Pad_C.wav") принимаем только для мелодических звуков (allowBare).
  const RU_NOTES = { до: 'C', ре: 'D', ми: 'E', фа: 'F', соль: 'G', ля: 'A', си: 'B' };
  const B = '(?:^|[\\s_\\-(\\[])';
  const E = '(?=$|[\\s_\\-)\\].,])';
  const KEY_FULL = new RegExp(B + '([A-G])(#|b|♯|♭)?[\\s_]?([Mm]inor|[Mm]ajor|[Mm]in|[Mm]aj|moll|dur|m)' + E);
  const KEY_TAGGED = new RegExp('(?:key|tonality)[\\s_\\-]?([A-G])(#|b|♯|♭)?(m(?:in(?:or)?)?|maj(?:or)?)?' + E, 'i');
  const KEY_BARE = new RegExp(B + '([A-G])(#|b|♯|♭)?' + E);

  function fmtKey(note, acc, q) {
    const a = acc ? acc.replace('♯', '#').replace('♭', 'b') : '';
    const minor = q && /^(m|min|minor|moll)$/i.test(q) && q !== 'M';
    return note + a + (minor ? 'm' : '');
  }

  function detectKey(name, allowBare) {
    const s = name.replace(/\.[a-z0-9]{2,4}$/i, '');
    let m = s.match(KEY_FULL) || s.match(KEY_TAGGED);
    if (m) return fmtKey(m[1].toUpperCase(), m[2], m[3]);
    m = normalize(s).match(/(?:^|[\s_\-])(до|ре|ми|фа|соль|ля|си)(?:[\s_\-]?(диез|бемоль))?[\s_\-]?(минор|мажор)/);
    if (m) return RU_NOTES[m[1]] + (m[2] === 'диез' ? '#' : m[2] === 'бемоль' ? 'b' : '') + (m[3] === 'минор' ? 'm' : '');
    if (allowBare) {
      m = s.match(KEY_BARE);
      if (m) return fmtKey(m[1], m[2], null);
    }
    return null;
  }

  const MELODIC = new Set(['bass', 'synth', 'instruments', 'vocal']);

  // Главная функция: путь относительно корня библиотеки -> категория, тип, BPM, тональность.
  // segments: ["Drums", "Kicks", "Kick_01.wav"], последний элемент — имя файла.
  function classify(segments, durationSec) {
    const fileName = segments[segments.length - 1];
    const folders = segments.slice(0, -1);
    const scores = new Map();
    const add = (id, w) => scores.set(id, (scores.get(id) || 0) + w);

    const scoreText = (text, weight) => {
      const n = normalize(text).replace(/[_\-.]+/g, ' ');
      for (const [ph, id] of phrases) if (n.includes(ph)) add(id, weight);
      const seen = new Set();
      for (const tok of tokenize(text)) {
        for (const id of categoriesForToken(tok)) {
          if (seen.has(id)) continue;
          seen.add(id);
          add(id, weight);
        }
      }
    };

    scoreText(fileName, 3);
    // Ближайшая папка весит больше дальних.
    folders.forEach((f, i) => scoreText(f, 1 + (i + 1) / folders.length));

    // Подкатегория тянет за собой родителя.
    for (const [id, s] of [...scores]) {
      const p = BY_ID[id].parent;
      if (p) add(p, s * 0.5);
    }

    let best = 'other';
    let bestScore = 0;
    for (const [id, s] of scores) {
      // При равенстве предпочитаем более узкую подкатегорию.
      const adj = s + (BY_ID[id].parent ? 0.01 : 0);
      if (adj > bestScore) { best = id; bestScore = adj; }
    }

    // Если победила общая категория, но есть сигнал подкатегории ("Эффекты/Свуш"), берём подкатегорию.
    if (!BY_ID[best].parent) {
      let bestChild = null, childScore = 0;
      for (const [id, s] of scores) {
        if (BY_ID[id].parent === best && s > childScore) { bestChild = id; childScore = s; }
      }
      if (bestChild) best = bestChild;
    }

    const lowerAll = normalize(segments.join(' '));
    const bpm = detectBpm(fileName);
    const isLoop = /loop|луп|петля|break|брейк|groove|грув|\bbeat\b/.test(lowerAll) || bpm !== null;
    let type;
    if (isLoop) type = 'loop';
    else if (durationSec != null && durationSec < 3.5) type = 'oneshot';
    else if (/one.?shot|ваншот|oneshot|hit|single/.test(lowerAll)) type = 'oneshot';
    else if (durationSec != null && durationSec >= 20) type = 'long';
    else type = durationSec != null ? 'oneshot' : 'unknown';

    const cat = BY_ID[best];
    return {
      cat: cat.parent || cat.id,
      sub: cat.parent ? cat.id : null,
      type,
      bpm,
      key: detectKey(fileName, MELODIC.has(cat.parent || cat.id)),
    };
  }

  // Для поиска: какие категории означает слово из строки поиска ("бочка" -> kick).
  function categoriesForQueryWord(word) {
    if (normalize(word).length < 2) return new Set();
    return categoriesForToken(word);
  }

  function searchForms(word) {
    const n = normalize(word);
    const forms = new Set([n]);
    if (CYR.test(n)) forms.add(translit(n));
    return [...forms];
  }

  return {
    RULES_VERSION,
    CATEGORIES,
    BY_ID,
    classify,
    tokenize,
    translit,
    normalize,
    detectBpm,
    detectKey,
    categoriesForQueryWord,
    searchForms,
  };
});
