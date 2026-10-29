/* global Categorize, DemoBackend, I18n */
'use strict';

(function () {
  const C = Categorize;
  const tr = I18n.t;
  const $ = (id) => document.getElementById(id);
  const ROW_H = 52;
  const isDemo = !window.api;
  const backend = window.api ? electronBackend(window.api) : DemoBackend.create();

  const typeLabel = (t) => ({ oneshot: tr('typeOneshot'), loop: tr('typeLoop'), long: tr('typeLong') }[t] || '—');
  const KEYS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const FLAT_TO_SHARP = { Db: 'C#', Eb: 'D#', Gb: 'F#', Ab: 'G#', Bb: 'A#' };

  const state = {
    items: [],
    folders: [],
    favorites: new Set(),
    overrides: {},
    recent: [],
    settings: { autoplay: true, volume: 0.8 },
    view: { lib: 'all', cat: null, sub: null, folder: null },
    filters: { q: '', type: '', bpmMin: null, bpmMax: null, key: '', dur: '' },
    sort: { key: null, dir: 1 },
    filtered: [],
    sel: -1,
    expanded: new Set(),
  };

  // ---------- Данные ----------

  function prepare(items) {
    for (const it of items) {
      const base = C.normalize(it.name + ' ' + it.rel.replace(/[\\/]/g, ' '));
      it._hay = base + ' ' + C.translit(base);
      // Токены с пробелом впереди: " лай собаки" — чтобы слово из словаря ловилось с начала слова.
      const toks = C.tokenize(it.name + ' ' + it.rel.replace(/[\\/]/g, ' ')).join(' ');
      it._tok = ' ' + toks + ' ' + C.translit(toks);
      it._nameN = C.normalize(it.name);
      it._key = normKey(it.key);
    }
    return items;
  }

  function normKey(k) {
    if (!k) return null;
    const m = String(k).trim().match(/^([A-Ga-g])([#b]?)\s*(m|min|minor)?/);
    if (!m) return null;
    let note = m[1].toUpperCase() + m[2];
    note = FLAT_TO_SHARP[note] || note;
    return note + (m[3] ? 'm' : '');
  }

  // Ручная категория из прошлой версии могла указывать на удалённый раздел: тогда берём автоматическую.
  function catOf(it) {
    const o = state.overrides[it.path];
    if (o && C.BY_ID[o.cat] && (!o.sub || C.BY_ID[o.sub])) return o;
    return C.BY_ID[it.cat] ? it : { cat: 'other', sub: null };
  }

  function applySnapshot(s) {
    state.items = prepare(s.items || []);
    state.folders = s.folders || [];
    state.favorites = new Set(s.favorites || []);
    state.overrides = s.overrides || {};
    state.recent = s.recent || [];
    state.settings = { ...state.settings, ...(s.settings || {}) };
    if (!isDemo) applyTheme(state.settings.theme || 'system');
    applyLang(state.settings.lang || 'ru', false);
    $('autoplay').checked = state.settings.autoplay !== false;
    $('vol').value = state.settings.volume ?? 0.8;
    player.setVolume(+$('vol').value);
    renderAll(true);
  }

  // ---------- Поиск и фильтры ----------

  function parseQuery(q) {
    const words = [];
    let bpm = null;
    const re = /(\d{2,3})\s*(?:bpm|бпм)/i;
    const m = q.match(re);
    if (m) {
      bpm = +m[1];
      q = q.replace(re, ' ');
    }
    for (const w of q.split(/\s+/)) {
      const n = C.normalize(w).replace(/^[^\wа-я#]+|[^\wа-я#]+$/g, '');
      if (!n) continue;
      // Слитное «dogbark» ищем как «dog bark».
      for (const part of C.splitCompound(n) || [n]) {
        words.push({
          raw: part,
          forms: C.searchForms(part),
          syn: C.synonymForms(part).map((f) => ' ' + f),
          cats: C.categoriesForQueryWord(part),
        });
      }
    }
    return { words, bpm };
  }

  function wordScore(it, c, w) {
    let s = 0;
    for (const form of w.forms) {
      // Короткие слова ищем только с начала слова, иначе «cat» найдёт «Notification».
      if (form.length < 5) {
        if (it._nameN.startsWith(form)) s = Math.max(s, 4);
        else if (it._tok.includes(' ' + form)) s = Math.max(s, 3);
      } else if (it._nameN.includes(form)) s = Math.max(s, it._nameN.startsWith(form) ? 4 : 3);
      else if (it._hay.includes(form)) s = Math.max(s, 2);
    }
    if (s) return s;
    // Перевод: «dog» находит «Лай собаки», «дождь» находит «Rain_Roof».
    for (const f of w.syn) if (it._tok.includes(f)) return 2.5;
    if (w.cats.size && (w.cats.has(c.cat) || (c.sub && w.cats.has(c.sub)))) return 1.5;
    return 0;
  }

  function computeFiltered() {
    const f = state.filters;
    const v = state.view;
    const pq = parseQuery(f.q);
    const recentIdx = v.lib === 'recent' ? new Map(state.recent.map((p, i) => [p, i])) : null;
    const [dMin, dMax] = f.dur ? f.dur.split('-').map((x) => (x === '' ? Infinity : +x)) : [null, null];
    const nWords = pq.words.length;
    let out = [];
    const partial = [];
    const cand = [];
    const strong = [];

    for (const it of state.items) {
      if (v.lib === 'fav' && !state.favorites.has(it.path)) continue;
      if (recentIdx && !recentIdx.has(it.path)) continue;
      const c = catOf(it);
      if (v.cat && c.cat !== v.cat) continue;
      if (v.sub && c.sub !== v.sub) continue;
      if (v.folder && !(it.path === v.folder || it.path.startsWith(v.folder + sepOf(it.path)))) continue;
      if (f.type && it.type !== f.type) continue;
      const bMin = f.bpmMin || (pq.bpm ? pq.bpm - 2 : null);
      const bMax = f.bpmMax || (pq.bpm ? pq.bpm + 2 : null);
      if ((bMin || bMax) && (it.bpm == null || (bMin && it.bpm < bMin) || (bMax && it.bpm > bMax))) continue;
      if (f.key && it._key !== f.key) continue;
      if (dMin != null && (it.duration == null || it.duration < dMin || it.duration >= dMax)) continue;

      const ws = pq.words.map((w, i) => {
        const sc = wordScore(it, c, w);
        if (sc > 1.5) strong[i] = true;
        return sc;
      });
      it._ws = ws;
      cand.push(it);
    }

    // Совпадение только по категории считаем, лишь если слово не нашлось ни в одном названии:
    // «rain» должен дать дожди, а не всю природу.
    for (const it of cand) {
      let score = 0;
      let hits = 0;
      it._ws.forEach((sc, i) => {
        if (sc > 1.5 || (sc && !strong[i])) { hits++; score += sc; }
      });
      it._score = score;
      it._hits = hits;
      if (hits === nWords) out.push(it);
      else if (hits > 0) partial.push(it);
    }

    // Если все слова сразу не нашлись (опечатка, лишнее слово), показываем частичные совпадения.
    state.partial = false;
    if (!out.length && partial.length && nWords > 1) {
      out = partial;
      state.partial = true;
    }

    const key = state.sort.key;
    const dir = state.sort.dir;
    const coll = new Intl.Collator(['ru', 'en'], { numeric: true, sensitivity: 'base' });
    if (key === 'name') out.sort((a, b) => dir * coll.compare(a.name, b.name));
    else if (key === 'cat') out.sort((a, b) => dir * (catLabel(catOf(a)).localeCompare(catLabel(catOf(b)), I18n.lang) || coll.compare(a.name, b.name)));
    else if (key === 'bpm' || key === 'duration') out.sort((a, b) => dir * ((a[key] ?? 1e9) - (b[key] ?? 1e9)));
    else if (key === 'key') out.sort((a, b) => dir * String(a._key || 'Я').localeCompare(String(b._key || 'Я')));
    else if (recentIdx) out.sort((a, b) => recentIdx.get(a.path) - recentIdx.get(b.path));
    else if (pq.words.length) out.sort((a, b) => b._hits - a._hits || b._score - a._score || coll.compare(a.name, b.name));
    else out.sort((a, b) => coll.compare(a.rel, b.rel));

    state.filtered = out;
    state.highlight = pq.words.map((w) => w.forms[0]);
    state.unmatched = state.partial ? pq.words.filter((w, i) => !out.some((it) => it._ws[i])).map((w) => w.raw) : [];
  }

  const sepOf = (p) => (p.includes('\\') ? '\\' : '/');

  // ---------- Сайдбар ----------

  function catLabel(c) {
    const id = c.sub || c.cat;
    const def = C.BY_ID[id];
    if (!def) return tr('uncategorized');
    return c.sub ? C.labelOf(c.cat, I18n.lang) + ' › ' + C.labelOf(id, I18n.lang) : C.labelOf(id, I18n.lang);
  }
  const catColor = (id) => `var(--c-${id || 'other'})`;

  function counts() {
    const cat = {};
    const sub = {};
    for (const it of state.items) {
      const c = catOf(it);
      cat[c.cat] = (cat[c.cat] || 0) + 1;
      if (c.sub) sub[c.sub] = (sub[c.sub] || 0) + 1;
    }
    return { cat, sub };
  }

  const fmtCount = (n) => (n == null ? '' : n.toLocaleString(I18n.locale()));
  const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

  // Знак студии CHERNOVsound: буква C и всплеск звуковой волны.
  const CS_MARK = '<svg class="cs-mark" viewBox="312 432 356 216" aria-hidden="true"><path d="M476.6 483.4A80 80 0 1 0 476.6 596.6" fill="none" stroke="currentColor" stroke-width="52"/><path d="M458 545H493L505 562L520 515L540 598L563 455L580 638L598 498L612 560L624 532L634 548L640 545H662" fill="none" stroke="currentColor" stroke-width="9" stroke-linejoin="round" stroke-linecap="round"/></svg>';

  const ICONS = {
    all: '<svg width="15" height="15" viewBox="0 0 20 20"><path d="M3 5h14M3 10h14M3 15h9" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
    fav: '<svg width="15" height="15" viewBox="0 0 20 20"><path d="M10 2.8l2.2 4.6 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5L2.8 8.1l5-.7z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
    recent: '<svg width="15" height="15" viewBox="0 0 20 20"><circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M10 6v4l3 2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
    folder: '<svg width="15" height="15" viewBox="0 0 20 20"><path d="M2.5 5.5h5l1.5 2h8.5v8.5h-15z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
    rescan: '<svg width="14" height="14" viewBox="0 0 20 20"><path d="M16 10a6 6 0 11-2-4.5M16 3v4h-4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    remove: '<svg width="14" height="14" viewBox="0 0 20 20"><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
    play: '<svg width="14" height="14" viewBox="0 0 20 20"><path d="M6 4l11 6-11 6z" fill="currentColor"/></svg>',
    pause: '<svg width="14" height="14" viewBox="0 0 20 20"><path d="M5 4h3.5v12H5zM11.5 4H15v12h-3.5z" fill="currentColor"/></svg>',
    star: '<svg width="15" height="15" viewBox="0 0 20 20"><path d="M10 2.8l2.2 4.6 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5L2.8 8.1l5-.7z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
    starOn: '<svg width="15" height="15" viewBox="0 0 20 20"><path d="M10 2.8l2.2 4.6 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5L2.8 8.1l5-.7z" fill="currentColor" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
  };

  function renderSidebar() {
    const v = state.view;
    const noCat = !v.cat && !v.folder;
    const libItems = [
      ['all', tr('allSounds'), state.items.length],
      ['fav', tr('favorites'), state.items.filter((it) => state.favorites.has(it.path)).length],
      ['recent', tr('recent'), state.recent.length ? Math.min(state.recent.length, state.items.length) : 0],
    ];
    $('nav-lib').innerHTML = libItems
      .map(([id, label, n]) => `<button class="nav-item${v.lib === id && noCat ? ' active' : ''}" data-lib="${id}">${ICONS[id]}<span class="label">${label}</span><span class="count">${fmtCount(n)}</span></button>`)
      .join('');

    const cnt = counts();
    const tops = C.CATEGORIES.filter((c) => !c.parent && cnt.cat[c.id]);
    tops.sort((a, b) => (a.id === 'other') - (b.id === 'other') || cnt.cat[b.id] - cnt.cat[a.id]);
    let html = '';
    for (const c of tops) {
      const active = v.cat === c.id && !v.sub;
      html += `<button class="nav-item${active ? ' active' : ''}" data-cat="${c.id}" style="--cat:${catColor(c.id)}"><span class="dot"></span><span class="label">${esc(C.labelOf(c.id, I18n.lang))}</span><span class="count">${fmtCount(cnt.cat[c.id])}</span></button>`;
      if (v.cat === c.id || state.expanded.has(c.id)) {
        const subs = C.CATEGORIES.filter((s) => s.parent === c.id && cnt.sub[s.id]);
        subs.sort((a, b) => cnt.sub[b.id] - cnt.sub[a.id]);
        for (const s of subs) {
          html += `<button class="nav-item nav-sub${v.sub === s.id ? ' active' : ''}" data-cat="${c.id}" data-sub="${s.id}" style="--cat:${catColor(c.id)}"><span class="dot"></span><span class="label">${esc(C.labelOf(s.id, I18n.lang))}</span><span class="count">${fmtCount(cnt.sub[s.id])}</span></button>`;
        }
      }
    }
    $('nav-cats').innerHTML = html || `<div class="nav-item" style="cursor:default">${tr('catsAfterScan')}</div>`;

    $('nav-folders').innerHTML = state.folders
      .map((f) => {
        const name = f.path.split(/[\\/]/).filter(Boolean).pop() || f.path;
        const active = v.folder === f.path;
        return `<div class="nav-item folder-item${active ? ' active' : ''}" data-folder="${esc(f.path)}" title="${esc(f.path)}" role="button" tabindex="0">${ICONS.folder}<span class="label">${esc(name)}</span><span class="count">${fmtCount(f.count)}</span>
          <span class="folder-actions"><button class="icon-btn" data-rescan="${esc(f.path)}" title="${tr('rescan')}" aria-label="${tr('rescan')}">${ICONS.rescan}</button><button class="icon-btn" data-remove="${esc(f.path)}" title="${tr('removeFolderTitle')}" aria-label="${tr('removeFolder')}">${ICONS.remove}</button></span></div>`;
      })
      .join('');
  }

  // ---------- Фильтры (верхняя панель) ----------

  function renderFilters() {
    const f = state.filters;
    for (const b of $('f-type').children) b.classList.toggle('on', b.dataset.v === f.type);
    $('f-bpm-pill').classList.toggle('on', !!(f.bpmMin || f.bpmMax));
    $('f-key-pill').classList.toggle('on', !!f.key);
    $('f-dur-pill').classList.toggle('on', !!f.dur);

    const v = state.view;
    let chips = '';
    if (v.cat) chips += `<span class="chip-active"><span class="dot" style="--cat:${catColor(v.cat)}"></span>${esc(catLabel({ cat: v.cat, sub: v.sub }))}<button data-clear="cat" aria-label="${tr('clearCat')}">${ICONS.remove}</button></span> `;
    if (v.folder) chips += `<span class="chip-active">${ICONS.folder}${esc(shortPath(v.folder))}<button data-clear="folder" aria-label="${tr('clearFolder')}">${ICONS.remove}</button></span>`;
    $('f-active').innerHTML = chips;
    $('result-count').innerHTML = `<b>${fmtCount(state.filtered.length)}</b> ${I18n.plural(state.filtered.length, tr('sounds'))}`
      + (state.partial ? ` <span class="partial" title="${tr('partialTitle')}">· ${tr('partial')}${state.unmatched.length ? ', ' + tr('notFound') + ': «' + esc(state.unmatched.join('», «')) + '»' : ''}</span>` : '');

    for (const b of $('list-head').querySelectorAll('[data-sort]')) {
      const on = state.sort.key === b.dataset.sort;
      b.classList.toggle('sorted', on);
      b.textContent = b.textContent.replace(/ [↑↓]$/, '') + (on ? (state.sort.dir > 0 ? ' ↑' : ' ↓') : '');
    }
  }

  function shortPath(p) {
    const root = state.folders.find((f) => p === f.path || p.startsWith(f.path + sepOf(p)));
    if (!root) return p;
    const rootName = root.path.split(/[\\/]/).filter(Boolean).pop();
    const rest = p.slice(root.path.length).replace(/^[\\/]/, '');
    return rest ? rootName + ' / ' + rest.split(/[\\/]/).join(' / ') : rootName;
  }

  // ---------- Виртуальный список ----------

  const list = $('list');
  const inner = $('list-inner');

  function fmtDur(s) {
    if (s == null) return '—';
    const dec = I18n.lang === 'en' ? '.' : ',';
    if (s < 10) return s.toFixed(2).replace('.', dec) + ' ' + tr('sec');
    if (s < 60) return s.toFixed(1).replace('.', dec) + ' ' + tr('sec');
    const m = Math.floor(s / 60);
    return m + ':' + String(Math.floor(s % 60)).padStart(2, '0');
  }

  function fmtFormat(it) {
    const parts = [it.ext.toUpperCase()];
    if (it.bits) parts.push(it.bits);
    if (it.sampleRate) parts.push(Math.round(it.sampleRate / 100) / 10);
    return parts.length === 3 ? `${parts[0]} ${parts[1]}/${parts[2]}` : parts.join(' ');
  }

  function highlight(text) {
    let html = esc(text);
    for (const h of state.highlight || []) {
      if (!h || h.length < 2 || /[^a-zа-я0-9 ]/i.test(h)) continue;
      html = html.replace(new RegExp('(' + h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig'), '<mark>$1</mark>');
    }
    return html;
  }

  function rowHtml(it, i) {
    const c = catOf(it);
    const manual = !!state.overrides[it.path];
    const fav = state.favorites.has(it.path);
    const playing = player.path === it.path && player.playing;
    const folder = it.rel.split(/[\\/]/).slice(0, -1).join(' / ');
    const sub = C.labelOf(c.sub || c.cat, I18n.lang);
    return `<div class="row${i === state.sel ? ' sel' : ''}${playing ? ' playing' : ''}" style="top:${i * ROW_H}px" data-i="${i}" draggable="true">
      <button class="play" data-play="${i}" tabindex="-1" aria-label="${tr('listen')}">${playing ? ICONS.pause : ICONS.play}</button>
      <div class="title"><span class="name">${highlight(it.name)}</span><span class="path">${esc(folder || '—')}</span></div>
      <span class="cat-chip${manual ? ' manual' : ''}" title="${esc(catLabel(c))}${manual ? ' ' + tr('manual') : ''}"><span class="dot" style="--cat:${catColor(c.cat)}"></span><span>${esc(sub)}</span></span>
      <span class="type-tag ${it.type}">${typeLabel(it.type)}</span>
      <span class="num c-bpm">${it.bpm ? (Math.round(it.bpm * 10) / 10).toString().replace('.', ',') : '—'}</span>
      <span class="num c-key">${it._key || '—'}</span>
      <span class="num">${fmtDur(it.duration)}</span>
      <span class="fmt">${fmtFormat(it)}</span>
      <button class="icon-btn star${fav ? ' on' : ''}" data-fav="${i}" tabindex="-1" aria-label="${fav ? tr('favRemove') : tr('favAdd')}">${fav ? ICONS.starOn : ICONS.star}</button>
    </div>`;
  }

  let lastRange = '';
  function renderRows(force) {
    const n = state.filtered.length;
    inner.style.height = n * ROW_H + 'px';
    const top = list.scrollTop;
    const h = list.clientHeight || 600;
    const from = Math.max(0, Math.floor(top / ROW_H) - 6);
    const to = Math.min(n, Math.ceil((top + h) / ROW_H) + 6);
    const key = from + ':' + to;
    if (!force && key === lastRange) return;
    lastRange = key;
    let html = '';
    for (let i = from; i < to; i++) html += rowHtml(state.filtered[i], i);
    inner.innerHTML = html;
  }

  list.addEventListener('scroll', () => requestAnimationFrame(() => renderRows()));
  window.addEventListener('resize', () => { renderRows(true); waveform.draw(); });

  function renderEmpty() {
    const e = $('empty');
    if (state.filtered.length) { e.hidden = true; return; }
    e.hidden = false;
    if (!state.folders.length) {
      e.innerHTML = `<div class="empty-card">
        <div class="cs-lockup">${CS_MARK}<span><b>CHERNOV</b>sound</span></div>
        <h2>${tr('emptyAddTitle')}</h2>
        <p>${tr('emptyAddText')}</p>
        <button class="btn-primary" data-action="add">${ICONS.folder} ${tr('pickFolder')}</button>
        <span class="drop-hint">${tr('dropHint')}</span></div>`;
    } else if (state.items.length === 0) {
      e.innerHTML = `<div class="empty-card"><h2>${tr('emptyScanTitle')}</h2><p>${tr('emptyScanText')}</p></div>`;
    } else if (state.view.lib === 'fav' && !state.filters.q) {
      e.innerHTML = `<div class="empty-card"><h2>${tr('emptyFavTitle')}</h2><p>${tr('emptyFavText')}</p></div>`;
    } else {
      e.innerHTML = `<div class="empty-card"><h2>${tr('emptyNoneTitle')}</h2><p>${tr('emptyNoneText')}</p><button class="btn-ghost" data-action="reset">${tr('resetFilters')}</button></div>`;
    }
  }

  function renderAll(keepSel) {
    const selPath = keepSel && state.filtered[state.sel] ? state.filtered[state.sel].path : null;
    computeFiltered();
    state.sel = selPath ? state.filtered.findIndex((it) => it.path === selPath) : -1;
    renderSidebar();
    renderFilters();
    renderRows(true);
    renderEmpty();
    renderKeyOptions();
  }

  let keyOptsFor = null;
  function renderKeyOptions() {
    if (keyOptsFor === state.items + I18n.lang) return;
    keyOptsFor = state.items + I18n.lang;
    const present = new Set(state.items.map((it) => it._key).filter(Boolean));
    const sel = $('f-key');
    const cur = sel.value;
    let html = `<option value="">${tr('any')}</option>`;
    for (const q of ['', 'm']) {
      const opts = KEYS.map((k) => k + q).filter((k) => present.has(k));
      if (opts.length) html += `<optgroup label="${q ? tr('minor') : tr('major')}">${opts.map((k) => `<option value="${k}">${k}</option>`).join('')}</optgroup>`;
    }
    sel.innerHTML = html;
    sel.value = cur;
  }

  // ---------- Плеер ----------

  const player = (() => {
    let ctx = null;
    let gain = null;
    let src = null;
    let audioEl = null;
    let startedAt = 0;
    let offset = 0;
    let buffer = null;
    let token = 0;
    const cache = new Map();

    const api = {
      path: null,
      item: null,
      playing: false,
      duration: 0,
      setVolume(v) {
        api.volume = v;
        if (gain) gain.gain.value = v;
        if (audioEl) audioEl.volume = v;
      },
      position() {
        if (audioEl) return audioEl.currentTime;
        if (!buffer) return 0;
        return api.playing ? Math.min(api.duration, offset + ctx.currentTime - startedAt) : offset;
      },
    };

    function ensureCtx() {
      if (!ctx) {
        ctx = new AudioContext();
        gain = ctx.createGain();
        gain.gain.value = api.volume ?? 0.8;
        gain.connect(ctx.destination);
      }
      if (ctx.state === 'suspended') ctx.resume();
    }

    function stopSources() {
      if (src) { src.onended = null; try { src.stop(); } catch {} src.disconnect(); src = null; }
      if (audioEl) { audioEl.pause(); }
    }

    function playFrom(pos) {
      stopSources();
      if (audioEl) {
        audioEl.currentTime = pos;
        audioEl.play();
      } else if (buffer) {
        src = ctx.createBufferSource();
        src.buffer = buffer;
        src.connect(gain);
        src.onended = () => { if (api.playing) { api.playing = false; offset = 0; onChange(); } };
        offset = pos;
        startedAt = ctx.currentTime;
        src.start(0, pos);
      }
      api.playing = true;
      onChange();
    }

    async function load(item, autoplay) {
      ensureCtx();
      const my = ++token;
      stopSources();
      if (audioEl) { audioEl.src = ''; audioEl = null; }
      api.playing = false;
      api.path = item.path;
      api.item = item;
      buffer = null;
      offset = 0;
      api.duration = item.duration || 0;
      waveform.set(null, tr('loading'));
      onChange();
      try {
        let entry = cache.get(item.path);
        if (!entry) {
          entry = await backend.loadAudio(item, ctx);
          cache.set(item.path, entry);
          if (cache.size > 40) cache.delete(cache.keys().next().value);
        }
        if (my !== token) return;
        if (entry.buffer) {
          buffer = entry.buffer;
          api.duration = buffer.duration;
          waveform.set(entry.peaks || (entry.peaks = computePeaks(buffer)), null);
        } else if (entry.url) {
          audioEl = new Audio(entry.url);
          audioEl.volume = api.volume ?? 0.8;
          audioEl.onended = () => { api.playing = false; onChange(); };
          audioEl.onloadedmetadata = () => { api.duration = audioEl.duration; onChange(); };
          waveform.set(null, tr('longFile'));
        }
        if (autoplay) playFrom(0);
        else onChange();
      } catch (err) {
        if (my !== token) return;
        waveform.set(null, tr('cantOpen') + (err && err.message ? err.message : tr('badFormat')));
      }
    }

    api.load = load;
    api.toggle = () => {
      if (!api.item) return;
      ensureCtx();
      if (api.playing) {
        offset = api.position();
        stopSources();
        api.playing = false;
        onChange();
      } else {
        playFrom(offset >= api.duration - 0.01 ? 0 : offset);
      }
    };
    api.seek = (frac) => {
      if (!api.item || !api.duration) return;
      ensureCtx();
      const pos = Math.max(0, Math.min(api.duration - 0.01, frac * api.duration));
      if (api.playing) playFrom(pos);
      else { offset = pos; if (audioEl) audioEl.currentTime = pos; onChange(); }
    };
    api.stop = () => { stopSources(); api.playing = false; offset = 0; onChange(); };
    return api;
  })();

  function computePeaks(buf, n = 1600) {
    const chs = [];
    for (let c = 0; c < Math.min(2, buf.numberOfChannels); c++) chs.push(buf.getChannelData(c));
    const len = chs[0].length;
    const step = Math.max(1, Math.floor(len / n));
    const peaks = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      let mn = 0, mx = 0;
      const start = Math.floor((i * len) / n);
      const end = Math.min(len, start + step);
      for (const d of chs) {
        for (let j = start; j < end; j += 2) {
          const v = d[j];
          if (v < mn) mn = v;
          if (v > mx) mx = v;
        }
      }
      peaks[i * 2] = mn;
      peaks[i * 2 + 1] = mx;
    }
    return peaks;
  }

  const waveform = (() => {
    const canvas = $('wave');
    const msg = $('wave-msg');
    let peaks = null;
    let raf = 0;
    const api = {
      set(p, text) {
        peaks = p;
        msg.textContent = text || '';
        msg.hidden = !text;
        api.draw();
      },
      draw() {
        const dpr = window.devicePixelRatio || 1;
        const w = canvas.clientWidth, h = canvas.clientHeight;
        if (!w || !h) return;
        if (canvas.width !== Math.round(w * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
        const g = canvas.getContext('2d');
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        g.clearRect(0, 0, w, h);
        const cs = getComputedStyle(document.documentElement);
        const cWave = cs.getPropertyValue('--wave').trim();
        const cAcc = cs.getPropertyValue('--accent').trim();
        const cLine = cs.getPropertyValue('--line').trim();
        const frac = player.duration ? player.position() / player.duration : 0;
        const mid = h / 2;
        g.fillStyle = cLine;
        g.fillRect(0, mid, w, 1);
        if (peaks) {
          const n = peaks.length / 2;
          const bar = 2, gap = 1;
          const cols = Math.floor(w / (bar + gap));
          let max = 0.0001;
          for (let i = 0; i < peaks.length; i++) max = Math.max(max, Math.abs(peaks[i]));
          const norm = Math.min(1 / max, 4);
          for (let x = 0; x < cols; x++) {
            const a = Math.floor((x / cols) * n), b = Math.max(a + 1, Math.floor(((x + 1) / cols) * n));
            let mn = 0, mx = 0;
            for (let i = a; i < b; i++) { mn = Math.min(mn, peaks[i * 2]); mx = Math.max(mx, peaks[i * 2 + 1]); }
            const top = mid - mx * norm * (mid - 2);
            const bot = mid - mn * norm * (mid - 2);
            g.fillStyle = x / cols <= frac ? cAcc : cWave;
            g.fillRect(x * (bar + gap), top, bar, Math.max(1, bot - top));
          }
        } else if (player.item && player.duration) {
          g.fillStyle = cAcc;
          g.fillRect(0, mid - 1, w * frac, 3);
        }
        if (player.item && player.duration && frac > 0) {
          g.fillStyle = cAcc;
          g.fillRect(Math.round(w * frac), 0, 1.5, h);
        }
        $('t-cur').textContent = fmtTime(player.position());
        $('t-dur').textContent = player.duration ? fmtTime(player.duration) : '';
      },
      loop() {
        cancelAnimationFrame(raf);
        const tick = () => { api.draw(); if (player.playing) raf = requestAnimationFrame(tick); };
        tick();
      },
    };
    return api;
  })();

  function fmtTime(s) {
    s = Math.max(0, s || 0);
    return Math.floor(s / 60) + ':' + (s % 60).toFixed(1).padStart(4, '0');
  }

  let prevPlaying = null;
  function onChange() {
    const it = player.item;
    $('p-play').disabled = !it;
    $('p-icon').innerHTML = player.playing ? '<path d="M5 4h3.5v12H5zM11.5 4H15v12h-3.5z" fill="currentColor"/>' : '<path d="M6 4l11 6-11 6z" fill="currentColor"/>';
    $('p-play').setAttribute('aria-label', player.playing ? tr('pause') : tr('play'));
    waveform.loop();
    const key = (player.path || '') + player.playing;
    if (key !== prevPlaying) { prevPlaying = key; renderRows(true); }
  }

  function renderPlayerMeta() {
    const it = player.item;
    const fav = $('p-fav'), rev = $('p-reveal'), cat = $('p-cat');
    fav.disabled = rev.disabled = cat.disabled = !it;
    $('p-cat-wrap').hidden = !it;
    $('drag-out').hidden = !it;
    if (!it) return;
    $('p-name').textContent = it.name;
    $('p-name').title = it.path;
    const c = catOf(it);
    $('p-dot').style.setProperty('--cat', catColor(c.cat));
    let opts = '';
    for (const top of C.CATEGORIES.filter((x) => !x.parent)) {
      const subs = C.CATEGORIES.filter((x) => x.parent === top.id);
      const tl = esc(C.labelOf(top.id, I18n.lang));
      opts += `<optgroup label="${tl}"><option value="${top.id}|">${tl}</option>${subs.map((s) => `<option value="${top.id}|${s.id}">${tl} › ${esc(C.labelOf(s.id, I18n.lang))}</option>`).join('')}</optgroup>`;
    }
    const manual = state.overrides[it.path];
    if (manual) opts = `<option value="__auto">${tr('autoCat')}</option>` + opts;
    cat.innerHTML = opts;
    cat.value = c.cat + '|' + (c.sub || '');
    cat.title = manual ? tr('catManual') : tr('catAuto');

    const isFav = state.favorites.has(it.path);
    fav.classList.toggle('on', isFav);
    fav.innerHTML = isFav ? ICONS.starOn : ICONS.star;

    // Хлебные крошки: клик по папке показывает всё из неё.
    const root = state.folders.find((f) => it.path.startsWith(f.path)) || { path: it.root };
    const segs = it.rel.split(/[\\/]/).slice(0, -1);
    const sep = sepOf(it.path);
    const rootName = root.path.split(/[\\/]/).filter(Boolean).pop();
    let acc = root.path;
    let crumbs = `<button data-crumb="${esc(root.path)}">${esc(rootName)}</button>`;
    for (const s of segs) {
      acc = acc + sep + s;
      crumbs += `<span>/</span><button data-crumb="${esc(acc)}">${esc(s)}</button>`;
    }
    $('p-crumbs').innerHTML = crumbs;

    const facts = [
      [tr('colLen'), fmtDur(player.duration || it.duration)],
      [tr('tempo'), it.bpm ? it.bpm + ' BPM' : '—'],
      [tr('colKey'), it._key || '—'],
      [tr('format'), fmtFormat(it) + (it.channels ? ' ' + (it.channels === 1 ? tr('mono') : tr('stereo')) : '')],
    ];
    $('facts').innerHTML = facts.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('');
  }

  // ---------- Выбор и навигация ----------

  function select(i, { play, scroll = true } = {}) {
    if (i < 0 || i >= state.filtered.length) return;
    state.sel = i;
    const it = state.filtered[i];
    if (scroll) {
      const top = i * ROW_H;
      if (top < list.scrollTop) list.scrollTop = top;
      else if (top + ROW_H > list.scrollTop + list.clientHeight) list.scrollTop = top + ROW_H - list.clientHeight;
    }
    const autoplay = play ?? $('autoplay').checked;
    if (player.path !== it.path) {
      player.load(it, autoplay);
      backend.addRecent(it.path).then((r) => { state.recent = r; });
    } else if (play) {
      player.toggle();
    }
    renderPlayerMeta();
    renderRows(true);
  }

  // ---------- События ----------

  let qTimer = 0;
  $('q').addEventListener('input', (e) => {
    clearTimeout(qTimer);
    qTimer = setTimeout(() => {
      state.filters.q = e.target.value;
      list.scrollTop = 0;
      renderAll(true);
    }, 90);
  });

  $('f-type').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    state.filters.type = b.dataset.v;
    renderAll(true);
  });
  for (const id of ['f-bpm-min', 'f-bpm-max']) {
    $(id).addEventListener('input', () => {
      state.filters.bpmMin = +$('f-bpm-min').value || null;
      state.filters.bpmMax = +$('f-bpm-max').value || null;
      renderAll(true);
    });
  }
  $('f-key').addEventListener('change', (e) => { state.filters.key = e.target.value; renderAll(true); });
  $('f-dur').addEventListener('change', (e) => { state.filters.dur = e.target.value; renderAll(true); });

  $('list-head').addEventListener('click', (e) => {
    const b = e.target.closest('[data-sort]');
    if (!b) return;
    const k = b.dataset.sort;
    if (state.sort.key === k) {
      if (state.sort.dir === 1) state.sort.dir = -1;
      else state.sort = { key: null, dir: 1 };
    } else state.sort = { key: k, dir: 1 };
    renderAll(true);
  });

  document.querySelector('.side').addEventListener('click', async (e) => {
    const t = e.target;
    const rescan = t.closest('[data-rescan]');
    if (rescan) { e.stopPropagation(); backend.rescan(rescan.dataset.rescan); return; }
    const remove = t.closest('[data-remove]');
    if (remove) {
      e.stopPropagation();
      applySnapshot(await backend.removeFolder(remove.dataset.remove));
      toast(tr('folderRemoved'));
      return;
    }
    const lib = t.closest('[data-lib]');
    if (lib) {
      state.view = { lib: lib.dataset.lib, cat: null, sub: null, folder: null };
      list.scrollTop = 0;
      renderAll(true);
      return;
    }
    const cat = t.closest('[data-cat]');
    if (cat) {
      const c = cat.dataset.cat, s = cat.dataset.sub || null;
      if (!s && state.view.cat === c && !state.view.sub) state.view.cat = null;
      else { state.view.cat = c; state.view.sub = s; }
      if (!state.view.cat) state.view.sub = null;
      list.scrollTop = 0;
      renderAll(true);
      return;
    }
    const folder = t.closest('[data-folder]');
    if (folder) {
      state.view.folder = state.view.folder === folder.dataset.folder ? null : folder.dataset.folder;
      list.scrollTop = 0;
      renderAll(true);
    }
  });

  $('btn-add-folder').addEventListener('click', addFolder);

  const THEMES = ['system', 'dark', 'light'];
  const themeLabel = (t) => tr({ system: 'themeSystem', dark: 'themeDark', light: 'themeLight' }[t]);
  function applyTheme(t) {
    if (t === 'system') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = t;
    $('btn-theme').title = themeLabel(t);
    $('btn-theme').setAttribute('aria-label', themeLabel(t));
    waveform.draw();
  }

  // Язык интерфейса: русский или английский. Названия категорий тоже переводятся.
  function applyLang(l, rerender = true) {
    I18n.set(l);
    I18n.apply(document);
    document.title = tr('appName');
    for (const b of $('lang-seg').children) b.classList.toggle('on', b.dataset.lang === I18n.lang);
    applyTheme(state.settings.theme || 'system');
    if (isDemo) $('demo-banner').innerHTML = tr('demoBanner');
    if (rerender) {
      renderAll(true);
      renderPlayerMeta();
    }
  }
  $('lang-seg').addEventListener('click', (e) => {
    const b = e.target.closest('[data-lang]');
    if (!b || b.dataset.lang === I18n.lang) return;
    const next = b.dataset.lang;
    state.settings.lang = next;
    backend.setSettings({ lang: next });
    applyLang(next);
  });
  $('btn-theme').addEventListener('click', () => {
    const cur = state.settings.theme || 'system';
    const next = THEMES[(THEMES.indexOf(cur) + 1) % THEMES.length];
    state.settings.theme = next;
    applyTheme(next);
    backend.setSettings({ theme: next });
    toast(themeLabel(next));
  });
  $('btn-rescan-all').addEventListener('click', () => backend.rescan());

  async function addFolder() {
    const r = await backend.pickFolder();
    if (r && r.error) toast(r.error);
  }

  $('f-active').addEventListener('click', (e) => {
    const b = e.target.closest('[data-clear]');
    if (!b) return;
    if (b.dataset.clear === 'cat') { state.view.cat = null; state.view.sub = null; }
    else state.view.folder = null;
    renderAll(true);
  });

  $('empty').addEventListener('click', (e) => {
    const a = e.target.closest('[data-action]');
    if (!a) return;
    if (a.dataset.action === 'add') addFolder();
    if (a.dataset.action === 'reset') resetFilters();
  });

  function resetFilters() {
    state.filters = { q: '', type: '', bpmMin: null, bpmMax: null, key: '', dur: '' };
    state.view = { lib: 'all', cat: null, sub: null, folder: null };
    $('q').value = ''; $('f-bpm-min').value = ''; $('f-bpm-max').value = ''; $('f-key').value = ''; $('f-dur').value = '';
    renderAll(true);
  }

  inner.addEventListener('click', (e) => {
    const favB = e.target.closest('[data-fav]');
    if (favB) { toggleFav(state.filtered[+favB.dataset.fav]); return; }
    const playB = e.target.closest('[data-play]');
    if (playB) { select(+playB.dataset.play, { play: true, scroll: false }); return; }
    const row = e.target.closest('.row');
    if (row) select(+row.dataset.i, { scroll: false });
  });
  inner.addEventListener('dblclick', (e) => {
    const row = e.target.closest('.row');
    if (row && !e.target.closest('button')) { const i = +row.dataset.i; if (player.path === state.filtered[i].path) player.seek(0); }
  });

  // Перетаскивание в DAW: Windows получает настоящий файл, как из Проводника.
  function startDrag(e, it) {
    if (!it) return;
    if (!isDemo) {
      e.preventDefault();
      backend.startDrag(it.path);
    } else {
      e.dataTransfer.setData('text/plain', it.path);
    }
  }
  inner.addEventListener('dragstart', (e) => {
    const row = e.target.closest('.row');
    if (row) startDrag(e, state.filtered[+row.dataset.i]);
  });
  $('drag-out').addEventListener('dragstart', (e) => startDrag(e, player.item));

  async function toggleFav(it) {
    if (!it) return;
    const on = !state.favorites.has(it.path);
    state.favorites = new Set(await backend.setFavorite(it.path, on));
    renderSidebar();
    renderRows(true);
    if (player.item === it) renderPlayerMeta();
    if (state.view.lib === 'fav') renderAll(true);
  }

  $('p-play').addEventListener('click', () => player.toggle());
  $('p-fav').addEventListener('click', () => toggleFav(player.item));
  $('p-reveal').addEventListener('click', () => player.item && backend.reveal(player.item.path));
  $('p-cat').addEventListener('change', async (e) => {
    const it = player.item;
    if (!it) return;
    const v = e.target.value;
    if (v === '__auto') state.overrides = await backend.setCategory(it.path, null);
    else {
      const [cat, sub] = v.split('|');
      state.overrides = await backend.setCategory(it.path, cat, sub || null);
    }
    renderAll(true);
    renderPlayerMeta();
    toast(v === '__auto' ? tr('catBackAuto') : tr('catChanged'));
  });
  $('p-crumbs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-crumb]');
    if (!b) return;
    state.view = { ...state.view, lib: 'all', folder: b.dataset.crumb };
    list.scrollTop = 0;
    renderAll(true);
  });
  $('wave-box').addEventListener('pointerdown', (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    player.seek((e.clientX - r.left) / r.width);
  });
  $('vol').addEventListener('input', (e) => {
    player.setVolume(+e.target.value);
    backend.setSettings({ volume: +e.target.value });
  });
  $('autoplay').addEventListener('change', (e) => backend.setSettings({ autoplay: e.target.checked }));

  document.addEventListener('keydown', (e) => {
    const inField = e.target.matches('input, select, textarea');
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f' || (e.ctrlKey && e.key.toLowerCase() === 'а')) {
      e.preventDefault();
      $('q').focus();
      $('q').select();
      return;
    }
    if (e.key === 'Escape') {
      if (inField && e.target.id === 'q' && e.target.value) { e.target.value = ''; state.filters.q = ''; renderAll(true); }
      else if (inField) e.target.blur();
      else player.stop();
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (inField && e.target.id !== 'q') return;
      e.preventDefault();
      const d = e.key === 'ArrowDown' ? 1 : -1;
      select(state.sel < 0 ? 0 : Math.max(0, Math.min(state.filtered.length - 1, state.sel + d)));
      return;
    }
    if (inField) {
      if (e.key === 'Enter' && e.target.id === 'q' && state.filtered.length) select(Math.max(0, state.sel), { play: true });
      return;
    }
    if (e.key === ' ') { e.preventDefault(); if (player.item) player.toggle(); else if (state.filtered.length) select(0, { play: true }); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); player.seek((player.position() + 1) / (player.duration || 1)); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); player.seek((player.position() - 1) / (player.duration || 1)); }
    else if (e.key.toLowerCase() === 'f' || e.key.toLowerCase() === 'а') toggleFav(player.item);
    else if (e.key === 'Enter' && state.sel >= 0) select(state.sel, { play: true });
  });

  // Папку можно бросить в окно прямо из Проводника.
  let dragDepth = 0;
  window.addEventListener('dragenter', (e) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    dragDepth++;
    document.body.classList.add('dropping');
  });
  window.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; document.body.classList.remove('dropping'); } });
  window.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes('Files')) e.preventDefault(); });
  window.addEventListener('drop', async (e) => {
    e.preventDefault();
    dragDepth = 0;
    document.body.classList.remove('dropping');
    if (isDemo) { toast(tr('demoNoFolders')); return; }
    for (const f of e.dataTransfer.files) {
      const p = backend.pathForFile(f);
      if (p) {
        const r = await backend.addFolder(p);
        if (r && r.error) toast(r.error);
      }
    }
  });

  let toastTimer = 0;
  function toast(text) {
    const t = $('toast');
    t.textContent = text;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.hidden = true), 3200);
  }

  // ---------- Сканирование ----------

  backend.onScanProgress((p) => {
    const box = $('scan-box');
    if (p.phase === 'done') {
      box.hidden = true;
      return;
    }
    box.hidden = false;
    const meter = $('scan-meter');
    if (p.phase === 'listing') {
      $('scan-title').textContent = tr('scanListing');
      $('scan-count').textContent = fmtCount(p.found || 0);
      meter.classList.add('indeterminate');
      $('scan-file').textContent = p.root ? shortPath(p.root) : '';
    } else {
      $('scan-title').textContent = tr('scanReading');
      $('scan-count').textContent = `${fmtCount(p.done)} / ${fmtCount(p.total)}`;
      meter.classList.remove('indeterminate');
      meter.firstElementChild.style.width = (p.total ? (100 * p.done) / p.total : 0) + '%';
      $('scan-file').textContent = p.current || '';
    }
  });
  backend.onLibraryChanged(applySnapshot);

  if (isDemo) {
    const b = $('demo-banner');
    b.hidden = false;
    b.innerHTML = tr('demoBanner');
  }

  // ---------- Мост к Electron ----------

  function fileUrl(p) {
    const norm = p.replace(/\\/g, '/');
    const parts = norm.split('/').map((seg, i) => (i === 0 && /^[a-zA-Z]:$/.test(seg) ? seg : encodeURIComponent(seg)));
    return 'file:///' + parts.join('/').replace(/^\/+/, '');
  }

  function electronBackend(api) {
    return {
      ...api,
      async loadAudio(item, ctx) {
        const bytes = await api.readFile(item.path);
        if (!bytes) return { url: fileUrl(item.path) };
        try {
          return { buffer: await ctx.decodeAudioData(bytes.slice(0)) };
        } catch (err) {
          const pcm = decodePcm(bytes, ctx);
          if (pcm) return { buffer: pcm };
          return { url: fileUrl(item.path) };
        }
      },
    };
  }

  // Запасной декодер для WAV/AIFF, которые не понимает браузерный движок (например, AIFF или 8-битные WAV).
  function decodePcm(ab, ctx) {
    const dv = new DataView(ab);
    const tag = (o) => String.fromCharCode(dv.getUint8(o), dv.getUint8(o + 1), dv.getUint8(o + 2), dv.getUint8(o + 3));
    if (ab.byteLength < 12) return null;
    let le, ch, rate, bits, dataOff, dataLen, float = false;
    if (tag(0) === 'RIFF' && tag(8) === 'WAVE') {
      le = true;
      let pos = 12;
      while (pos + 8 <= ab.byteLength) {
        const id = tag(pos), size = dv.getUint32(pos + 4, true);
        if (id === 'fmt ') {
          const fmt = dv.getUint16(pos + 8, true);
          ch = dv.getUint16(pos + 10, true); rate = dv.getUint32(pos + 12, true); bits = dv.getUint16(pos + 22, true);
          float = fmt === 3 || (fmt === 0xfffe && size >= 40 && dv.getUint16(pos + 32, true) === 3);
        } else if (id === 'data') { dataOff = pos + 8; dataLen = Math.min(size, ab.byteLength - dataOff); break; }
        pos += 8 + size + (size & 1);
      }
    } else if (tag(0) === 'FORM' && (tag(8) === 'AIFF' || tag(8) === 'AIFC')) {
      le = false;
      let pos = 12;
      while (pos + 8 <= ab.byteLength) {
        const id = tag(pos), size = dv.getUint32(pos + 4, false);
        if (id === 'COMM') {
          ch = dv.getUint16(pos + 8); bits = dv.getUint16(pos + 14);
          const exp = (dv.getUint16(pos + 16) & 0x7fff) - 16383 - 31;
          rate = Math.round(dv.getUint32(pos + 18) * Math.pow(2, exp));
          if (tag(8) === 'AIFC' && size >= 22) { const comp = tag(pos + 26); if (comp === 'sowt') le = true; else if (comp === 'fl32') float = true; else if (comp !== 'NONE') return null; }
        } else if (id === 'SSND') { const off = dv.getUint32(pos + 8); dataOff = pos + 16 + off; dataLen = Math.min(size - 8 - off, ab.byteLength - dataOff); break; }
        pos += 8 + size + (size & 1);
      }
    } else return null;
    if (!ch || !rate || !bits || dataOff == null) return null;
    const bps = bits / 8;
    const frames = Math.floor(dataLen / (bps * ch));
    if (!frames || rate < 3000 || rate > 768000) return null;
    const out = ctx.createBuffer(ch, frames, rate);
    const chans = Array.from({ length: ch }, (_, c) => out.getChannelData(c));
    let o = dataOff;
    for (let i = 0; i < frames; i++) {
      for (let c = 0; c < ch; c++) {
        let v;
        if (float && bits === 32) v = dv.getFloat32(o, le);
        else if (float && bits === 64) v = dv.getFloat64(o, le);
        else if (bits === 8) v = le ? (dv.getUint8(o) - 128) / 128 : dv.getInt8(o) / 128;
        else if (bits === 16) v = dv.getInt16(o, le) / 32768;
        else if (bits === 24) {
          const b0 = dv.getUint8(o), b1 = dv.getUint8(o + 1), b2 = dv.getUint8(o + 2);
          let x = le ? b0 | (b1 << 8) | (b2 << 16) : b2 | (b1 << 8) | (b0 << 16);
          if (x & 0x800000) x |= ~0xffffff;
          v = x / 8388608;
        } else if (bits === 32) v = dv.getInt32(o, le) / 2147483648;
        else return null;
        chans[c][i] = v;
        o += bps;
      }
    }
    return out;
  }

  backend.getLibrary().then(applySnapshot);
})();
