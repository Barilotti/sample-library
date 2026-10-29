// Автокатегоризация сэмплов по имени файла и пути папок.
// Работает и в Node (сканер), и в браузере (поиск в интерфейсе), поэтому без зависимостей.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Categorize = factory(root);
})(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';

  const Tax = typeof module === 'object' && module.exports ? require('./taxonomy') : root.Taxonomy;
  const RULES_VERSION = 5;

  // Дерево категорий живёт в taxonomy.js. Здесь превращаем его в удобный вид:
  // { id, parent, label (рус.), labels: {ru, en}, words, phrases }.
  const CATEGORIES = Tax.CATEGORIES.map((c) => {
    const dot = c.id.indexOf('.');
    const words = [];
    const phrases = (c.p || []).slice();
    for (const w of (c.w || '').split(/\s+/)) {
      if (!w) continue;
      if (w.includes('_')) phrases.push(w.replace(/_/g, ' '));
      else words.push(w);
    }
    return { id: c.id, parent: dot > 0 ? c.id.slice(0, dot) : null, label: c.ru, labels: { ru: c.ru, en: c.en }, words, phrases };
  });

  // Слабые слова весят меньше: "Arrow Hit", "Door Hit" — главное здесь не hit.
  const WEAK = new Set(Tax.WEAK.split(/\s+/).filter(Boolean));

  const BY_ID = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));

  // Транслитерация кириллицы, чтобы "veter" и "ветер" считались одним словом.
  const TR = {
    а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm',
    н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch',
    ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya', і: 'i', ї: 'yi', є: 'ye', ґ: 'g',
  };
  const CYR = /[а-яёіїєґ]/;

  function translit(s) {
    let out = '';
    for (const ch of s) out += TR[ch] !== undefined ? TR[ch] : ch;
    return out;
  }

  function normalize(s) {
    return String(s).toLowerCase().replace(/ё/g, 'е').replace(/['’ʼ`]/g, '');
  }

  // Делит "KickDrum_Hard-01 (Бочка).wav" на ["kick", "drum", "hard", "бочка"].
  function tokenize(s) {
    const spaced = String(s)
      .replace(/\.[a-z0-9]{2,4}$/i, '')
      .replace(/one[\s_\-]?shots?/gi, 'oneshot')
      .replace(/([a-zа-яёіїєґ])([A-ZА-ЯЁІЇЄҐ])/g, '$1 $2')
      .replace(/([a-zA-Zа-яА-ЯёЁіїєґІЇЄҐ])(\d)/g, '$1 $2')
      .replace(/(\d)([a-zA-Zа-яА-ЯёЁіїєґІЇЄҐ])/g, '$1 $2');
    return normalize(spaced)
      .split(/[^a-zа-яіїєґ0-9#]+/)
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
      if (w.length < 2) continue;
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
  for (const cat of CATEGORIES) {
    for (const raw of cat.phrases) {
      const ph = normalize(raw).replace(/[-_]/g, ' ').trim();
      phrases.push([ph, cat.id]);
      if (CYR.test(ph)) phrases.push([translit(ph), cat.id]);
    }
  }
  // Длинные фразы проверяем первыми, чтобы «автомат калашникова» не съела фраза покороче.
  phrases.sort((a, b) => b[0].length - a[0].length);
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
    if (!hit.size && CYR.test(t) && t.length >= 7) for (const id of gluedHits(t)) hit.add(id);
    return hit;
  }

  // Слитные русские/украинские названия: «звукилеса», «сукалёгкийдождь», «ахуєнийгул».
  // Длинные основы ищем внутри слова, короткие (гул, лес) — только в конце.
  let gluedKeys = null;
  function gluedHits(t) {
    if (!gluedKeys) {
      gluedKeys = [];
      // «фон» в конце слова — это почти всегда телефон, микрофон, граммофон, а не фон.
      for (const [w, ids] of exact) if (CYR.test(w) && w.length >= 3 && w !== 'фон') gluedKeys.push([w, ids]);
      for (const [p, id] of prefixes) if (CYR.test(p) && p.length >= 4) gluedKeys.push([p, new Set([id])]);
    }
    const out = new Set();
    for (const [k, ids] of gluedKeys) {
      let ok = false;
      if (k.length >= 5) ok = t.includes(k);
      else if (k.length === 4) ok = t.endsWith(k) || t.slice(0, -1).endsWith(k) || t.slice(0, -2).endsWith(k);
      else ok = t.endsWith(k) || (t.length > 4 && RU_ENDINGS.test(t.slice(t.lastIndexOf(k) + 3)) && t.lastIndexOf(k) > 2 && t.lastIndexOf(k) + 3 >= t.length - 2);
      if (ok) for (const id of ids) out.add(id);
    }
    return out;
  }

  // Словарь переводов для поиска: одно понятие на двух языках. Запрос «dog» найдёт «Лай собаки»,
  // «дождь» найдёт «Rain_Roof», «лай» найдёт «Dog_Bark». Слова внутри группы равноправны.
  const SYNONYMS = [
'dog dogs puppy hound собака собаки пёс пес щенок',
'bark barking woof лай лает гавкает',
'cat cats kitten кошка кот котёнок',
'meow мяу мяуканье нявкання',
'horse конь лошадь',
'wolf волк',
'bird birds птица птицы',
'growl рычание',
'roar рёв рык',
'rain дождь',
'wind ветер',
'storm шторм буря гроза',
'thunder гром',
'forest woods лес',
'water вода',
'river река',
'sea ocean море океан',
'waves волны',
'fire огонь костёр костер',
'night ночь',
'morning утро',
'city town город',
'street улица',
'traffic трафик пробка',
'crowd people толпа люди',
'snow снег',
'ice лёд лед',
'footsteps footstep steps step шаги шаг',
'door doors дверь двери',
'glass стекло',
'metal металл метал',
'wood wooden дерево деревянный',
'paper бумага',
'keys key ключи ключ',
'cloth clothes fabric одежда ткань',
'creak squeak скрип',
'knock стук',
'car cars машина автомобиль',
'engine motor двигатель мотор',
'train поезд электричка',
'plane airplane aircraft самолёт самолет',
'helicopter вертолёт вертолет',
'gun gunshot shot shots выстрел выстрелы',
'pistol пистолет',
'rifle винтовка',
'reload перезарядка',
'explosion explode blast взрыв',
'sword меч',
'punch удар кулаком',
'voice голос',
'vocal vocals vox вокал',
'choir хор',
'whisper шёпот шепот',
'scream shout крик',
'breath breathing дыхание',
'laugh laughter смех',
'talk speech conversation речь разговор',
'kick бочка',
'snare малый',
'clap хлопок хлопки',
'hihat hat хэт',
'cymbal crash тарелка',
'drum drums барабан барабаны ударные',
'bass бас',
'pad пэд пад',
'piano пианино рояль',
'guitar гитара',
'strings струнные',
'violin скрипка',
'bell bells колокол колокольчик',
'synth синт синтезатор',
'chord chords аккорд аккорды',
'loop loops луп лупы петля',
'ambient ambience атмосфера эмбиент фон',
'drone дрон гул',
'noise шум',
'click клик',
'button кнопка',
'beep писк сигнал',
'notification уведомление',
'whoosh swoosh swish свуш вжух',
'riser райзер нарастание',
'impact hit удар импакт',
'glitch глитч',
'laser лазер',
'robot робот',
'magic магия',
'space космос',
'monster монстр чудовище',
'heart сердце',
'phone телефон',
'clock часы',
'kitchen кухня',
'office офис',
  ];

  const synIndex = new Map(); // форма -> индекс группы
  const synPrefixes = []; // [основа, индекс группы] для склонений
  const synGroups = SYNONYMS.map((line, gi) => {
    const words = line.split(' ').map((w) => w.replace(/ё/g, 'е')).filter(Boolean);
    for (const w of words) {
      synIndex.set(w, gi);
      if (CYR.test(w)) {
        synIndex.set(translit(w), gi);
        const st = ruStem(w);
        if (st.length >= 3 && st !== w) synPrefixes.push([st, gi]);
      }
    }
    return words;
  });

  function synonymGroup(word) {
    const n = normalize(word);
    if (synIndex.has(n)) return synIndex.get(n);
    for (const [st, gi] of synPrefixes) if (prefixOk(n, st)) return gi;
    // Английское множественное число: barks -> bark, glasses -> glass.
    if (/^[a-z]+s$/.test(n)) {
      if (synIndex.has(n.slice(0, -1))) return synIndex.get(n.slice(0, -1));
      if (n.endsWith('es') && synIndex.has(n.slice(0, -2))) return synIndex.get(n.slice(0, -2));
    }
    return -1;
  }

  // Формы для поиска по токенам: русские и украинские слова берём основой, чтобы ловить падежи.
  function synonymForms(word) {
    const gi = synonymGroup(word);
    if (gi < 0) return [];
    const out = new Set();
    for (const w of synGroups[gi]) {
      if (w.includes(' ')) continue;
      if (CYR.test(w)) {
        const st = ruStem(w);
        out.add(st.length >= 3 ? st : w);
      } else out.add(w);
    }
    return [...out];
  }

  // Слитные запросы: «dogbark» -> ["dog", "bark"], «rainroof» -> ["rain", "roof"].
  function splitCompound(word) {
    const n = normalize(word);
    if (n.length < 5 || synonymGroup(n) >= 0 || exact.has(n)) return null;
    const known = (w) => synIndex.has(w) || exact.has(w);
    for (let i = n.length - 2; i >= 2; i--) {
      const a = n.slice(0, i), b = n.slice(i);
      if (known(a) && (known(b) || splitCompound(b))) return [a].concat(known(b) ? [b] : splitCompound(b));
    }
    return null;
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

  const MELODIC = new Set(['music']);
  const VENDORS = Tax.VENDOR_RE;
  function stripVendors(text) {
    return String(text).replace(VENDORS, ' ');
  }

  // Жанровые паки («Magic Bundle», «Мистика, ужасы», «Memes»): если папка говорит о жанре,
  // звук остаётся в нём, иначе «Fire Spell» из магической библиотеки уедет в «Огонь».
  const GENRE = new Set(['magic', 'scifi', 'horror', 'cartoon', 'creatures']);

  // Внутри жанра подкатегорию можно узнать по словам из соседних веток:
  // «Fire» в магическом паке — это огненная магия, «Water» — стихийная.
  const ALIAS = {
    magic: { 'weather.fire': 'magic.fire', 'weather.snow': 'magic.ice', 'weather.thunder': 'magic.lightning', 'tech.electric': 'magic.lightning', 'weather.water': 'magic.elements', 'weather.wind': 'magic.elements', 'foley.debris': 'magic.elements', 'horror': 'magic.dark', 'creatures': 'magic.dark' },
    scifi: { 'magic.lightning': 'scifi.tech', 'tech.computers': 'scifi.tech', 'ui': 'scifi.tech', 'ui.clicks': 'scifi.tech', 'vehicles': 'scifi.vehicles', 'vehicles.air': 'scifi.vehicles', 'weapons.guns': 'scifi.lasers', 'tech.motors': 'scifi.robots' },
    cartoon: { 'animals': 'cartoon.toons', 'human.screams': 'cartoon.memes', 'human.speech': 'cartoon.memes' },
  };

  function ucsCategory(fileName) {
    const m = /^([A-Z]{2,7}?)([A-Z][a-z]{1,8})?_/.exec(fileName);
    if (!m) return null;
    return Tax.UCS[m[1] + (m[2] || '')] || Tax.UCS[m[1]] || null;
  }

  const topOf = (id) => {
    const d = id.indexOf('.');
    return d > 0 ? id.slice(0, d) : id;
  };

  // Очки одного куска пути: фразы сильнее отдельных слов, а слова, вошедшие во фразу,
  // второй раз не считаются («торговый автомат» — это не оружие).
  function scoreText(text, weight) {
    const out = new Map();
    const put = (id, w) => { if ((out.get(id) || 0) < w) out.set(id, w); };
    let n = ' ' + normalize(stripVendors(text)).replace(/[_\-.,()[\]]+/g, ' ').replace(/\s+/g, ' ') + ' ';
    for (const [ph, id] of phrases) {
      const at = n.indexOf(ph);
      if (at < 0) continue;
      // Фраза должна начинаться с начала слова.
      if (n[at - 1] !== ' ') continue;
      put(id, weight * 1.5);
      n = n.slice(0, at) + ' '.repeat(ph.length) + n.slice(at + ph.length);
    }
    for (const tok of tokenize(n)) {
      const w = WEAK.has(tok) ? weight * 0.4 : weight;
      for (const id of categoriesForToken(tok)) put(id, w);
    }
    return out;
  }

  // Главная функция: путь относительно корня библиотеки -> категория, тип, BPM, тональность.
  // segments: ["Weapons", "Guns", "Rifle_Shot_01.wav"], последний элемент — имя файла.
  // Имя файла важнее всего, ближайшая папка — меньше, название пака — меньше всего.
  function classify(segments, durationSec) {
    const fileName = segments[segments.length - 1];
    const folders = segments.slice(0, -1);
    const own = new Map();
    const fromFile = new Map();
    const genre = new Map();
    const add = (id, w) => own.set(id, (own.get(id) || 0) + w);

    const ucs = ucsCategory(fileName);
    if (ucs) {
      add(topOf(ucs), 6);
      if (ucs.includes('.')) add(ucs, 6);
    }
    for (const [id, w] of scoreText(fileName, 4)) {
      add(id, w);
      fromFile.set(topOf(id), Math.max(fromFile.get(topOf(id)) || 0, w));
    }
    folders.forEach((f, i) => {
      const weight = 1 + (i + 1) / folders.length; // от 1 (корень) до 2 (ближайшая)
      for (const [id, w] of scoreText(f, weight)) {
        add(id, w);
        const top = topOf(id);
        if (GENRE.has(top) && w >= weight) genre.set(top, 3);
      }
    });

    // Счёт верхней категории = её собственные слова + лучшая подкатегория.
    const tops = new Map();
    for (const [id, s] of own) {
      const top = topOf(id);
      if (!tops.has(top)) tops.set(top, { own: 0, sub: 0 });
      const t = tops.get(top);
      if (id === top) t.own += s;
      else t.sub = Math.max(t.sub, s);
    }
    let best = 'other';
    let bestScore = 0;
    for (const [top, t] of tops) {
      const sc = t.own + t.sub + (genre.get(top) || 0) + (fromFile.get(top) || 0) * 0.001;
      if (sc > bestScore) { best = top; bestScore = sc; }
    }

    // Подкатегория: самая сильная внутри победителя (плюс подсказки из соседних веток).
    let sub = null;
    let subScore = 0;
    const alias = ALIAS[best] || {};
    for (const [id, s] of own) {
      const target = id.startsWith(best + '.') ? id : alias[id];
      if (target && s > subScore) { sub = target; subScore = s; }
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

    return { cat: best, sub, type, bpm, key: detectKey(fileName, MELODIC.has(best)) };
  }

  // Название категории на нужном языке.
  function labelOf(id, lang) {
    const c = BY_ID[id];
    if (!c) return id;
    return (lang && c.labels[lang]) || c.label;
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
    labelOf,
    classify,
    tokenize,
    translit,
    normalize,
    detectBpm,
    detectKey,
    categoriesForQueryWord,
    searchForms,
    synonymForms,
    splitCompound,
  };
});
