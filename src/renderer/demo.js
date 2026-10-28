/* global Categorize */
// Демо-режим: когда интерфейс открыт в браузере без Electron. Генерирует правдоподобную библиотеку
// с русскими и английскими названиями и синтезирует звуки на лету, чтобы было что послушать.
'use strict';

(function (root) {
  const C = root.Categorize;

  function rng(seed) {
    let s = seed >>> 0 || 1;
    return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  }
  function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
    return h >>> 0;
  }

  const ROOT_EN = 'D:\\Samples';
  const ROOT_RU = 'E:\\Звуки студии';

  // [папка, шаблоны имён, количество, длительность [мин, макс], синт]
  const PLAN = [
    [ROOT_EN, 'Drums\\Kicks', ['Kick_{adj}_{n}', 'KCK_{adj}_{n}', '{adj} Kick {n}'], 140, [0.3, 0.9], 'kick'],
    [ROOT_RU, 'Ударные\\Бочки', ['Бочка_{adjRu}_{n}', 'бочка {adjRu} {n}'], 70, [0.3, 0.8], 'kick'],
    [ROOT_EN, 'Drums\\Snares', ['Snare_{adj}_{n}', 'SNR_{adj}_{n}', 'Rimshot_{n}'], 120, [0.2, 0.6], 'snare'],
    [ROOT_EN, 'Drums\\Claps', ['Clap_{adj}_{n}', 'Snap_{n}'], 60, [0.2, 0.5], 'snare'],
    [ROOT_EN, 'Drums\\Hats', ['HH_Closed_{n}', 'OH_{adj}_{n}', 'Hat_{adj}_{n}'], 130, [0.05, 0.5], 'hat'],
    [ROOT_RU, 'Ударные\\Хэты и тарелки', ['Хэт закрытый {n}', 'Тарелка крэш {n}', 'Райд_{n}'], 50, [0.1, 2.5], 'hat'],
    [ROOT_EN, 'Drums\\Percussion', ['Shaker_{adj}_{n}', 'Conga_{n}', 'Cowbell_{n}', 'Tambourine_{n}'], 80, [0.1, 0.7], 'perc'],
    [ROOT_EN, 'Loops\\Drum Loops', ['Break_{style}_{bpm}bpm_{n}', 'Groove_{style}_{bpm}_BPM', 'TopLoop_{bpm}bpm_{n}'], 110, [3.5, 8], 'loop'],
    [ROOT_RU, 'Лупы\\Ударные', ['Луп_брейк_{bpm}bpm_{n}', 'Грув {style} {bpm} bpm'], 40, [3.5, 8], 'loop'],
    [ROOT_EN, 'Bass\\808', ['808_{adj}_{key}_{n}', 'Sub_Bass_{key}', 'Reese_{key}_{n}'], 90, [0.8, 3], 'bass'],
    [ROOT_RU, 'Бас', ['Бас_{adjRu}_{key}', 'Саб_{key}_{n}'], 30, [0.8, 3], 'bass'],
    [ROOT_EN, 'Synth\\Pads', ['Pad_{mood}_{key}', 'Pad_{mood}_{n}_{key}'], 70, [6, 16], 'pad'],
    [ROOT_EN, 'Synth\\Leads & Plucks', ['Pluck_{mood}_{key}_{n}', 'Lead_{mood}_{key}', 'Arp_{bpm}bpm_{key}'], 90, [0.6, 4], 'pluck'],
    [ROOT_RU, 'Синты\\Пэды', ['Пэд_{moodRu}_{key}', 'пэд {moodRu} {n}'], 35, [6, 16], 'pad'],
    [ROOT_EN, 'Keys', ['Piano_Chord_{key}_{n}', 'Rhodes_{key}_{n}'], 40, [1.5, 5], 'pluck'],
    [ROOT_EN, 'Vocals', ['Vox_{word}_{key}_{n}', 'Choir_Ah_{key}', 'Vocal_Chop_{n}'], 60, [0.6, 4], 'vox'],
    [ROOT_RU, 'Голоса', ['Фраза_{phrase}', 'Шёпот_{n}', 'Дыхание_{n}', 'Хор_{key}_{n}'], 45, [0.8, 4], 'vox'],
    [ROOT_EN, 'Ambience', ['Ambient_{mood}_{n}', 'Drone_{mood}_{key}', 'Texture_{mood}_{n}', 'Roomtone_{place}'], 90, [25, 140], 'amb'],
    [ROOT_RU, 'Атмосферы', ['Атмосфера_{moodRu}_{n}', 'Гул {placeRu}', 'Дрон_{moodRu}_{n}', 'Фон_{placeRu}_{n}'], 85, [25, 160], 'amb'],
    [ROOT_RU, 'Полевые записи', ['Дождь_{adjRu}_{n}', 'Ветер в поле {n}', 'Лес ночью {n}', 'Улица_{city}_трафик', 'Птицы утро {n}', 'Море_волны_{n}', 'Метро_{city}_{n}'], 110, [20, 180], 'field'],
    [ROOT_EN, 'Field Recordings', ['Rain_On_Roof_{n}', 'Forest_Night_Crickets', 'City_Traffic_{n}', 'Wind_Gusts_{n}', 'River_Stream_{n}'], 70, [20, 180], 'field'],
    [ROOT_EN, 'FX\\Risers', ['Riser_{mood}_{n}', 'Uplifter_{bpm}bpm', 'Sweep_Up_{n}', 'Downlifter_{n}'], 70, [2, 8], 'riser'],
    [ROOT_EN, 'FX\\Impacts', ['Impact_{adj}_{n}', 'Braam_{n}', 'Hit_Cinematic_{n}', 'Boom_{n}'], 60, [1.5, 6], 'impact'],
    [ROOT_RU, 'Эффекты', ['Свуш_{n}', 'Вжух_{adjRu}_{n}', 'Удар_кинематографичный_{n}', 'Глитч_{n}', 'Помехи радио {n}'], 70, [0.4, 4], 'whoosh'],
    [ROOT_EN, 'FX\\UI', ['UI_Click_{n}', 'Button_Confirm_{n}', 'Notification_{n}', 'Beep_Error'], 50, [0.05, 0.6], 'ui'],
    [ROOT_RU, 'Фоли', ['Шаги_по_снегу_{n}', 'Шаги асфальт {n}', 'Дверь_скрип_{n}', 'Ключи_{n}', 'Одежда_шорох_{n}', 'Стекло_звон_{n}'], 90, [0.4, 4], 'foley'],
    [ROOT_EN, 'Foley', ['Footsteps_Wood_{n}', 'Door_Close_{n}', 'Cloth_Rustle_{n}', 'Glass_Clink_{n}', 'Paper_Crumple_{n}'], 70, [0.4, 4], 'foley'],
    [ROOT_RU, 'Оружие', ['Выстрел_пистолет_{n}', 'Перезарядка_{n}', 'Взрыв_далёкий_{n}', 'Взрыв_близкий_{n}'], 45, [0.5, 5], 'impact'],
    [ROOT_EN, 'Vehicles', ['Car_Pass_By_{n}', 'Engine_Idle_{n}', 'Train_Arrival_{n}', 'Helicopter_Flyover'], 35, [4, 30], 'field'],
    [ROOT_RU, 'Животные', ['Лай собаки {n}', 'Кошка мяу {n}', 'Лошадь_{n}'], 25, [0.5, 3], 'vox'],
    [ROOT_EN, 'Misc', ['Untitled_{n}', 'rec_{n}', 'Audio_{n}', 'final_v{n}'], 40, [0.5, 6], 'perc'],
  ];

  const WORDS = {
    adj: ['Punchy', 'Deep', 'Tight', 'Dusty', 'Hard', 'Soft', 'Analog', 'Crisp', 'Fat', 'Lofi', 'Room', 'Dry'],
    adjRu: ['жирная', 'мягкий', 'глухой', 'плотный', 'тёплый', 'сухой', 'грязный', 'короткий'],
    style: ['Funk', 'Trap', 'House', 'Lofi', 'DnB', 'Breakbeat', 'Hiphop', 'Techno'],
    mood: ['Dark', 'Warm', 'Dreamy', 'Cold', 'Glassy', 'Tense', 'Airy', 'Lush'],
    moodRu: ['тёмный', 'тёплый', 'холодный', 'тревожный', 'светлый', 'мрачный'],
    word: ['Hey', 'Ooh', 'Yeah', 'Go', 'Ah'],
    phrase: ['привет', 'давай', 'стоп', 'смотри', 'тише'],
    place: ['Office', 'Kitchen', 'Hall', 'Basement', 'Studio'],
    placeRu: ['подвал', 'офис', 'подъезд', 'кухня', 'вокзал'],
    city: ['Москва', 'Питер', 'Казань'],
    key: ['C', 'Cm', 'D', 'Dm', 'E', 'Em', 'F', 'F#m', 'G', 'Gm', 'A', 'Am', 'Bb', 'Bm'],
    bpm: [85, 90, 95, 100, 110, 120, 124, 126, 128, 140, 150, 170, 174],
  };

  function buildItems() {
    const items = [];
    const seen = new Set();
    for (const [rootDir, folder, templates, count, [dMin, dMax], synth] of PLAN) {
      const r = rng(hash(folder));
      for (let i = 0; i < count; i++) {
        const tpl = templates[Math.floor(r() * templates.length)];
        const name = tpl.replace(/\{(\w+)\}/g, (_, k) => {
          if (k === 'n') return String(Math.floor(r() * 40) + 1).padStart(2, '0');
          const list = WORDS[k];
          return list[Math.floor(r() * list.length)];
        });
        const rel = folder + '\\' + name + '.wav';
        if (seen.has(rel)) continue;
        seen.add(rel);
        const bpmM = name.match(/(\d{2,3})\s*_?bpm/i);
        let duration = Math.min(30, dMin + r() * (dMax - dMin));
        if (bpmM) duration = (60 / +bpmM[1]) * 4 * (r() < 0.5 ? 2 : 4);
        duration = Math.round(duration * 1000) / 1000;
        const c = C.classify(rel.split('\\'), duration);
        const sr = r() < 0.7 ? 48000 : 44100;
        items.push({
          path: rootDir + '\\' + rel,
          root: rootDir,
          rel,
          name,
          ext: 'wav',
          size: Math.round(duration * sr * 6),
          mtime: 0,
          duration,
          sampleRate: sr,
          bits: r() < 0.6 ? 24 : 16,
          channels: synth === 'kick' || synth === 'snare' ? 1 : 2,
          bpm: c.bpm,
          key: c.key,
          cat: c.cat,
          sub: c.sub,
          type: c.type,
          _synth: synth,
        });
      }
    }
    return items;
  }

  // ---------- Синтез звуков ----------

  const NOTE = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
  function keyFreq(key, octave) {
    const m = key && key.match(/^([A-G][#b]?)(m?)/);
    const n = m ? NOTE[m[1]] : 9;
    return { f: 440 * Math.pow(2, (n - 9) / 12 + (octave - 4)), minor: m ? !!m[2] : false };
  }

  function noise(ctx, dur) {
    const b = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * dur)), ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const s = ctx.createBufferSource();
    s.buffer = b;
    return s;
  }

  function env(ctx, g, t0, a, peak, d, end) {
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, Math.max(t0 + a + 0.01, end ?? t0 + a + d));
  }

  const SYNTHS = {
    kick(ctx, out, dur, r) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.setValueAtTime(140 + r() * 60, 0);
      o.frequency.exponentialRampToValueAtTime(42 + r() * 12, 0.12);
      env(ctx, g, 0, 0.003, 1, dur * 0.9);
      o.connect(g).connect(out);
      o.start(0); o.stop(dur);
      const c = noise(ctx, 0.02), cg = ctx.createGain();
      env(ctx, cg, 0, 0.001, 0.4, 0.02);
      c.connect(cg).connect(out); c.start(0);
    },
    snare(ctx, out, dur, r) {
      const n = noise(ctx, dur), f = ctx.createBiquadFilter(), g = ctx.createGain();
      f.type = 'bandpass'; f.frequency.value = 1800 + r() * 2500; f.Q.value = 0.7;
      env(ctx, g, 0, 0.002, 0.8, dur * 0.7);
      n.connect(f).connect(g).connect(out); n.start(0);
      const o = ctx.createOscillator(), og = ctx.createGain();
      o.frequency.value = 180 + r() * 60;
      env(ctx, og, 0, 0.002, 0.5, 0.08);
      o.connect(og).connect(out); o.start(0); o.stop(0.2);
    },
    hat(ctx, out, dur, r) {
      const n = noise(ctx, dur), f = ctx.createBiquadFilter(), g = ctx.createGain();
      f.type = 'highpass'; f.frequency.value = 7000 + r() * 3000;
      env(ctx, g, 0, 0.001, 0.6, dur * 0.8);
      n.connect(f).connect(g).connect(out); n.start(0);
    },
    perc(ctx, out, dur, r) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'triangle'; o.frequency.value = 300 + r() * 600;
      env(ctx, g, 0, 0.002, 0.7, dur * 0.6);
      o.connect(g).connect(out); o.start(0); o.stop(dur);
      SYNTHS.hat(ctx, out, Math.min(dur, 0.15), r);
    },
    loop(ctx, out, dur, r, item) {
      const beat = 60 / (item.bpm || 120);
      for (let t = 0; t < dur - 0.05; t += beat / 2) {
        const step = Math.round(t / (beat / 2));
        const sub = ctx.createGain();
        sub.connect(out);
        const delay = ctx.createDelay(10);
        delay.delayTime.value = t;
        sub.disconnect(); sub.connect(delay).connect(out);
        if (step % 4 === 0 || (step % 8 === 7 && r() < 0.5)) SYNTHS.kick(ctx, sub, 0.35, r);
        if (step % 4 === 2) SYNTHS.snare(ctx, sub, 0.25, r);
        SYNTHS.hat(ctx, sub, 0.05, r);
      }
    },
    bass(ctx, out, dur, r, item) {
      const { f } = keyFreq(item.key, 1);
      const o = ctx.createOscillator(), g = ctx.createGain(), sh = ctx.createWaveShaper();
      const curve = new Float32Array(256);
      for (let i = 0; i < 256; i++) { const x = i / 128 - 1; curve[i] = Math.tanh(x * 2.5); }
      sh.curve = curve;
      o.frequency.setValueAtTime(f * 2, 0);
      o.frequency.exponentialRampToValueAtTime(f, 0.06);
      env(ctx, g, 0, 0.005, 0.8, dur * 0.95);
      o.connect(sh).connect(g).connect(out); o.start(0); o.stop(dur);
    },
    pad(ctx, out, dur, r, item) {
      const { f, minor } = keyFreq(item.key, 3);
      const g = ctx.createGain(), lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.setValueAtTime(600, 0); lp.frequency.linearRampToValueAtTime(2400, dur / 2); lp.frequency.linearRampToValueAtTime(800, dur);
      g.gain.setValueAtTime(0.0001, 0); g.gain.linearRampToValueAtTime(0.22, dur * 0.3); g.gain.linearRampToValueAtTime(0.18, dur * 0.7); g.gain.linearRampToValueAtTime(0.0001, dur);
      for (const iv of [0, minor ? 3 : 4, 7, 12]) {
        for (const det of [-6, 6]) {
          const o = ctx.createOscillator();
          o.type = 'sawtooth'; o.frequency.value = f * Math.pow(2, iv / 12); o.detune.value = det;
          o.connect(lp); o.start(0); o.stop(dur);
        }
      }
      lp.connect(g).connect(out);
    },
    pluck(ctx, out, dur, r, item) {
      const { f, minor } = keyFreq(item.key, 4);
      const notes = [0, minor ? 3 : 4, 7, 12];
      const step = Math.min(0.25, dur / 6);
      notes.forEach((iv, i) => {
        const o = ctx.createOscillator(), g = ctx.createGain(), lp = ctx.createBiquadFilter();
        o.type = 'square'; o.frequency.value = f * Math.pow(2, iv / 12);
        lp.type = 'lowpass'; lp.frequency.setValueAtTime(4000, i * step); lp.frequency.exponentialRampToValueAtTime(300, i * step + 0.4);
        env(ctx, g, i * step, 0.003, 0.25, Math.max(0.3, dur - i * step - 0.05));
        o.connect(lp).connect(g).connect(out); o.start(i * step); o.stop(dur);
      });
    },
    vox(ctx, out, dur, r, item) {
      const { f } = keyFreq(item.key || 'A', 3);
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sawtooth'; o.frequency.value = f;
      const vib = ctx.createOscillator(), vg = ctx.createGain();
      vib.frequency.value = 5.5; vg.gain.value = 4; vib.connect(vg).connect(o.frequency); vib.start(0); vib.stop(dur);
      g.gain.setValueAtTime(0.0001, 0); g.gain.linearRampToValueAtTime(0.3, 0.12); g.gain.linearRampToValueAtTime(0.0001, dur);
      const mix = ctx.createGain(); mix.gain.value = 0.6;
      for (const [fr, q] of [[730, 8], [1090, 10], [2440, 12]]) {
        const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = fr * (0.9 + r() * 0.2); bp.Q.value = q;
        o.connect(bp).connect(mix);
      }
      mix.connect(g).connect(out); o.start(0); o.stop(dur);
    },
    amb(ctx, out, dur, r, item) {
      const n = noise(ctx, dur), lp = ctx.createBiquadFilter(), g = ctx.createGain();
      lp.type = 'lowpass'; lp.frequency.value = 400 + r() * 500; lp.Q.value = 3;
      const lfo = ctx.createOscillator(), lg = ctx.createGain();
      lfo.frequency.value = 0.07 + r() * 0.1; lg.gain.value = 250; lfo.connect(lg).connect(lp.frequency); lfo.start(0); lfo.stop(dur);
      g.gain.setValueAtTime(0.0001, 0); g.gain.linearRampToValueAtTime(0.6, 3); g.gain.setValueAtTime(0.6, dur - 3); g.gain.linearRampToValueAtTime(0.0001, dur);
      n.connect(lp).connect(g).connect(out); n.start(0);
      const { f } = keyFreq(item.key || 'D', 2);
      const o = ctx.createOscillator(), og = ctx.createGain();
      o.frequency.value = f; og.gain.setValueAtTime(0.0001, 0); og.gain.linearRampToValueAtTime(0.12, dur / 2); og.gain.linearRampToValueAtTime(0.0001, dur);
      o.connect(og).connect(out); o.start(0); o.stop(dur);
    },
    field(ctx, out, dur, r) {
      const n = noise(ctx, dur), bp = ctx.createBiquadFilter(), g = ctx.createGain();
      bp.type = 'bandpass'; bp.frequency.value = 900 + r() * 3000; bp.Q.value = 0.4;
      g.gain.setValueAtTime(0.0001, 0); g.gain.linearRampToValueAtTime(0.5, 1.5); g.gain.setValueAtTime(0.5, dur - 1.5); g.gain.linearRampToValueAtTime(0.0001, dur);
      n.connect(bp).connect(g).connect(out); n.start(0);
      for (let t = 0.5; t < dur - 0.5; t += 0.2 + r() * 1.4) {
        const d = noise(ctx, 0.03), dg = ctx.createGain(), hp = ctx.createBiquadFilter();
        hp.type = 'highpass'; hp.frequency.value = 2500;
        env(ctx, dg, t, 0.002, 0.15 + r() * 0.3, 0.03);
        d.connect(hp).connect(dg).connect(out); d.start(t);
      }
    },
    riser(ctx, out, dur) {
      const n = noise(ctx, dur), bp = ctx.createBiquadFilter(), g = ctx.createGain();
      bp.type = 'bandpass'; bp.Q.value = 4; bp.frequency.setValueAtTime(200, 0); bp.frequency.exponentialRampToValueAtTime(9000, dur);
      g.gain.setValueAtTime(0.02, 0); g.gain.exponentialRampToValueAtTime(0.9, dur * 0.97); g.gain.linearRampToValueAtTime(0.0001, dur);
      n.connect(bp).connect(g).connect(out); n.start(0);
    },
    whoosh(ctx, out, dur) {
      const n = noise(ctx, dur), bp = ctx.createBiquadFilter(), g = ctx.createGain();
      bp.type = 'bandpass'; bp.Q.value = 2; bp.frequency.setValueAtTime(300, 0); bp.frequency.exponentialRampToValueAtTime(3000, dur * 0.5); bp.frequency.exponentialRampToValueAtTime(400, dur);
      g.gain.setValueAtTime(0.0001, 0); g.gain.exponentialRampToValueAtTime(0.9, dur * 0.5); g.gain.exponentialRampToValueAtTime(0.0001, dur);
      n.connect(bp).connect(g).connect(out); n.start(0);
    },
    impact(ctx, out, dur, r) {
      SYNTHS.kick(ctx, out, Math.min(dur, 1.5), r);
      const n = noise(ctx, dur), lp = ctx.createBiquadFilter(), g = ctx.createGain();
      lp.type = 'lowpass'; lp.frequency.setValueAtTime(5000, 0); lp.frequency.exponentialRampToValueAtTime(200, dur);
      env(ctx, g, 0, 0.003, 0.8, dur * 0.95);
      n.connect(lp).connect(g).connect(out); n.start(0);
    },
    ui(ctx, out, dur, r) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(900 + r() * 900, 0); o.frequency.setValueAtTime(1400 + r() * 900, dur * 0.4);
      env(ctx, g, 0, 0.002, 0.5, dur * 0.9);
      o.connect(g).connect(out); o.start(0); o.stop(dur);
    },
    foley(ctx, out, dur, r) {
      const steps = Math.max(1, Math.floor(dur / 0.5));
      for (let i = 0; i < steps; i++) {
        const t = i * 0.5 + r() * 0.05;
        const n = noise(ctx, 0.2), bp = ctx.createBiquadFilter(), g = ctx.createGain();
        bp.type = 'bandpass'; bp.frequency.value = 500 + r() * 2500; bp.Q.value = 1.2;
        env(ctx, g, t, 0.004, 0.7, 0.15);
        n.connect(bp).connect(g).connect(out); n.start(t);
      }
    },
  };

  async function render(item) {
    const dur = Math.min(item.duration, 30); // в демо длинные атмосферы обрезаем до 30 секунд
    const sr = 22050;
    const ctx = new OfflineAudioContext(item.channels === 1 ? 1 : 2, Math.ceil(sr * dur), sr);
    const out = ctx.createGain();
    out.gain.value = 0.8;
    out.connect(ctx.destination);
    (SYNTHS[item._synth] || SYNTHS.perc)(ctx, out, dur, rng(hash(item.path)), item);
    return ctx.startRendering();
  }

  function create() {
    const items = buildItems();
    const favorites = new Set(items.filter((_, i) => i % 37 === 3).map((it) => it.path));
    const overrides = {};
    let recent = [];
    const folders = [
      { path: ROOT_EN, count: items.filter((i) => i.root === ROOT_EN).length },
      { path: ROOT_RU, count: items.filter((i) => i.root === ROOT_RU).length },
    ];
    const noop = () => {};
    return {
      demo: true,
      getLibrary: async () => ({ folders, items, favorites: [...favorites], overrides, recent, settings: { autoplay: true, volume: 0.8 } }),
      pickFolder: async () => ({ error: 'В демо-версии папки не добавляются. В приложении откроется выбор папки.' }),
      addFolder: async () => ({ error: 'В демо-версии папки не добавляются.' }),
      removeFolder: async () => ({ folders, items, favorites: [...favorites], overrides, recent }),
      rescan: async () => true,
      setFavorite: async (p, on) => { on ? favorites.add(p) : favorites.delete(p); return [...favorites]; },
      setCategory: async (p, cat, sub) => { if (cat) overrides[p] = { cat, sub }; else delete overrides[p]; return overrides; },
      addRecent: async (p) => { recent = [p, ...recent.filter((x) => x !== p)].slice(0, 200); return recent; },
      setSettings: async () => ({}),
      reveal: async () => {},
      startDrag: noop,
      onScanProgress: noop,
      onLibraryChanged: noop,
      loadAudio: async (item) => ({ buffer: await render(item) }),
    };
  }

  root.DemoBackend = { create };
})(typeof self !== 'undefined' ? self : this);
