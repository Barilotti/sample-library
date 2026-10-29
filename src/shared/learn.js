// Самообучение: приложение подстраивается под библиотеку конкретного человека.
//
// Три источника знаний, все хранятся только у пользователя:
// 1. Ручные исправления. Перенёс звук «Hydrophone Soap Drop» в «Вода» — приложение запоминает
//    незнакомое слово «hydrophone» и переносит все файлы с ним. Если человек дважды поправил
//    одно и то же знакомое слово, исправление сильнее встроенного словаря.
// 2. Сама библиотека. Незнакомое слово, которое много раз встречается только у звуков одной
//    категории («kaboom» у взрывов), выучивается автоматически. А звук без категории в папке,
//    где почти все соседи из одной категории, получает категорию соседей.
// 3. Свои категории пользователя со своими словами. Они важнее всего остального.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./categorize'));
  else root.Learn = factory(root.Categorize);
})(typeof self !== 'undefined' ? self : this, function (C) {
  'use strict';

  // Слова, из которых нечему учиться: служебные, предлоги, части имён файлов.
  const STOP = new Set(('the and for with from into onto off out over under the a an of in on at to by or no not ' +
    'take version final copy new old mix edit master stereo mono left right center wav mp3 flac aiff ogg ' +
    'take01 tk var alt untitled audio track record rec file sample samples sfx fx ' +
    'и в во на по с со к ко у о об от до из за под над при для без про через это то как раз два три ' +
    'один одна одно много мало большой большая маленький маленькая средний средняя быстро медленно ' +
    'внеш внутр вдали близко слева справа').split(/\s+/));

  const MULT_MANUAL_NEW = 1.25; // незнакомое слово из ручного исправления
  const MULT_MANUAL_FIX = 1.75; // знакомое слово, которое человек исправил минимум дважды
  const MULT_AUTO = 1; // слово, выученное из библиотеки
  const MULT_CUSTOM = 25; // слово своей категории
  const AI_MIN = 0.25; // минимальная уверенность нейросети

  function segmentsOf(it) {
    return it.rel.split(/[\\/]/);
  }

  // Слова имени файла, пригодные для обучения.
  function nameWords(name) {
    const out = new Set();
    for (const tok of C.tokenize(C.stripVendors(name))) {
      if (tok.length < 3 || /\d/.test(tok) || STOP.has(tok)) continue;
      if (tok.length >= 6 && C.isUcsCode(tok) && name.toLowerCase().startsWith(tok)) continue;
      out.add(tok);
    }
    return out;
  }

  const targetOf = (c) => c.sub || c.cat;

  // Встроенная раскладка каждого файла не меняется, пока не изменился путь: запоминаем её,
  // а заново считаем только звуки, в которых есть выученные слова. Так пересчёт после
  // ручного исправления в библиотеке на десятки тысяч файлов занимает доли секунды.
  const baseCache = new Map(); // путь -> { k, r, keys }
  function base(it) {
    const k = it.rel + '|' + it.duration + '|' + C.RULES_VERSION;
    let e = baseCache.get(it.path);
    if (!e || e.k !== k) {
      const seg = segmentsOf(it);
      const keys = new Set();
      for (const part of seg) for (const tok of C.tokenize(C.stripVendors(part))) keys.add(C.learnKey(tok));
      e = { k, r: C.classify(seg, it.duration), keys };
      baseCache.set(it.path, e);
    }
    return e;
  }
  function classifyWith(it, ctx) {
    const e = base(it);
    if (!ctx.words.size) return e.r;
    for (const key of e.keys) if (ctx.words.has(key)) return C.classify(segmentsOf(it), it.duration, ctx);
    return e.r;
  }

  /**
   * Перестраивает знания и заново раскладывает библиотеку.
   * items — записи сканера, overrides — ручные категории (путь -> {cat, sub}),
   * custom — свои категории [{ id, name, words: [] }], forgotten — слова, которые человек велел забыть.
   * Возвращает { items (с новыми cat/sub), learned: [{ word, id, source, count }], changed }.
   */
  function relearn({ items, overrides = {}, custom = [], forgotten = [] }) {
    const forget = new Set(forgotten.map((w) => C.learnKey(w)));
    const words = new Map(); // ключ -> { id, mult, word, source, count }
    const learned = [];

    // 3. Свои категории.
    for (const cat of custom) {
      for (const w of cat.words || []) {
        for (const tok of C.tokenize(w)) words.set(C.learnKey(tok), { id: cat.id, mult: MULT_CUSTOM });
      }
    }

    // 1. Ручные исправления: считаем, к какой категории человек относит каждое слово.
    const byPath = new Map(items.map((it) => [it.path, it]));
    const votes = new Map(); // ключ -> { word, known, ids: Map(id -> n) }
    for (const [p, o] of Object.entries(overrides)) {
      const it = byPath.get(p);
      if (!it || !o || !o.cat) continue;
      for (const w of nameWords(it.name)) {
        const key = C.learnKey(w);
        if (forget.has(key)) continue;
        if (!votes.has(key)) votes.set(key, { word: w, known: C.isKnownWord(w), ids: new Map() });
        const v = votes.get(key);
        v.ids.set(targetOf(o), (v.ids.get(targetOf(o)) || 0) + 1);
      }
    }
    for (const [key, v] of votes) {
      if (words.has(key)) continue;
      const [[id, n]] = [...v.ids].sort((a, b) => b[1] - a[1]);
      const total = [...v.ids.values()].reduce((a, b) => a + b, 0);
      if (n / total < 0.75) continue; // человек сам относит слово к разным категориям
      if (v.known && n < 2) continue;
      words.set(key, { id, mult: v.known ? MULT_MANUAL_FIX : MULT_MANUAL_NEW });
      learned.push({ word: v.word, id, source: 'manual', count: n });
    }

    // Первый проход: встроенный словарь + ручные знания.
    const ctx = { words };
    let pass = items.map((it) => classifyWith(it, ctx));

    // 2а. Незнакомые слова, которые встречаются только у одной уверенно определённой категории.
    const stats = new Map(); // ключ -> { word, ids: Map, total }
    items.forEach((it, i) => {
      const r = pass[i];
      const confident = r.cat !== 'other' && r.score >= 4;
      for (const w of nameWords(it.name)) {
        const key = C.learnKey(w);
        if (words.has(key) || forget.has(key) || C.isKnownWord(w)) continue;
        if (!stats.has(key)) stats.set(key, { word: w, ids: new Map(), total: 0, folders: new Set() });
        const s = stats.get(key);
        s.total++;
        s.folders.add(it.rel.replace(/[\\/][^\\/]*$/, ''));
        if (confident) s.ids.set(targetOf(r), (s.ids.get(targetOf(r)) || 0) + 1);
      }
    });
    let autoAdded = 0;
    for (const [key, s] of stats) {
      const sure = [...s.ids.values()].reduce((x, y) => x + y, 0);
      if (s.total < 5 || sure < 5) continue;
      const [[id, n]] = [...s.ids].sort((a, b) => b[1] - a[1]);
      // Слово должно почти всегда означать одно и то же и встречаться не в одной-единственной папке
      // (иначе это название пака или имя собаки, а не понятие).
      if (n / sure < 0.9 || s.folders.size < 3) continue;
      words.set(key, { id, mult: MULT_AUTO });
      learned.push({ word: s.word, id, source: 'auto', count: s.total });
      autoAdded++;
    }
    // Выученные сами слова помогают только звукам без категории: остальные решения не трогаем.
    if (autoAdded) {
      pass = pass.map((r, i) => {
        if (r.cat !== 'other') return r;
        return classifyWith(items[i], ctx);
      });
    }

    // 4. Нейросеть: если по названию понять нельзя, верим тому, что она услышала.
    items.forEach((it, i) => {
      const r = pass[i];
      const ai = it.ai;
      if (!ai || !ai.cat || ai.conf < AI_MIN || ai.cat === 'other') return;
      // Название сильнее нейросети; она решает, только если по названию ничего не понятно.
      if (r.cat !== 'other' && !(r.score < 2 && ai.conf >= 0.5)) return;
      const dot = ai.cat.indexOf('.');
      pass[i] = { ...r, cat: dot > 0 ? ai.cat.slice(0, dot) : ai.cat, sub: dot > 0 ? ai.cat : null, how: 'audio' };
    });

    // 2б. Звуки без категории получают категорию соседей по папке, если соседи почти единодушны.
    const byFolder = new Map();
    items.forEach((it, i) => {
      const dir = it.rel.replace(/[\\/][^\\/]*$/, '');
      if (!byFolder.has(dir)) byFolder.set(dir, []);
      byFolder.get(dir).push(i);
    });
    for (const idx of byFolder.values()) {
      const known = idx.filter((i) => pass[i].cat !== 'other');
      if (known.length < 3 || known.length === idx.length) continue;
      const count = new Map();
      for (const i of known) count.set(targetOf(pass[i]), (count.get(targetOf(pass[i])) || 0) + 1);
      const [[id, n]] = [...count].sort((a, b) => b[1] - a[1]);
      if (n / known.length < 0.7) continue;
      const dot = id.indexOf('.');
      for (const i of idx) {
        if (pass[i].cat === 'other') pass[i] = { ...pass[i], cat: dot > 0 ? id.slice(0, dot) : id, sub: dot > 0 ? id : null, how: 'folder' };
      }
    }

    let changed = 0;
    const out = items.map((it, i) => {
      const r = pass[i];
      const how = r.how || undefined;
      if (it.cat === r.cat && it.sub === r.sub && it.how === how) return it;
      if (it.cat !== r.cat || it.sub !== r.sub) changed++;
      const next = { ...it, cat: r.cat, sub: r.sub };
      if (how) next.how = how;
      else delete next.how;
      return next;
    });
    learned.sort((a, b) => (a.source === b.source ? b.count - a.count : a.source === 'manual' ? -1 : 1));
    return { items: out, learned, changed };
  }

  // Короткое имя для своей категории, без точек (точка в id означает подкатегорию).
  function customId(name, taken) {
    const base = 'user-' + (C.translit(C.normalize(name)).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'cat');
    let id = base;
    for (let n = 2; taken.has(id); n++) id = base + '-' + n;
    return id;
  }

  return { relearn, customId, nameWords };
});
