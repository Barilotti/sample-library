/* global AudioSetMap */
// Распознавание по звуку: нейросеть YAMNet (Google, обучена на AudioSet, 521 класс звуков)
// через MediaPipe в WebAssembly. Работает полностью на компьютере пользователя, без интернета.
// Слушает первые секунды каждого файла в фоне и сохраняет, что услышала.
'use strict';

(function (root) {
  const SECONDS = 6; // сколько секунд слушать
  const BATCH = 25; // сколько результатов копить перед сохранением

  function create({ api, decode, onProgress }) {
    let classifier = null;
    let running = false;
    let stopFlag = false;
    let failed = null;

    async function init() {
      if (classifier) return classifier;
      const mp = await import('./vendor/mediapipe/audio_bundle.mjs');
      const [loader, wasm, model] = await Promise.all(['loader', 'wasm', 'model'].map((n) => api.asset(n)));
      const fileset = {
        wasmLoaderPath: URL.createObjectURL(new Blob([loader], { type: 'text/javascript' })),
        wasmBinaryPath: URL.createObjectURL(new Blob([wasm], { type: 'application/wasm' })),
      };
      classifier = await mp.AudioClassifier.createFromOptions(fileset, {
        baseOptions: { modelAssetBuffer: new Uint8Array(model) },
        maxResults: -1,
      });
      return classifier;
    }

    // Что звучит в файле: усредняем оценки по кадрам (~1 с каждый).
    function listen(buffer) {
      const rate = buffer.sampleRate;
      const n = Math.min(buffer.length, Math.round(rate * SECONDS));
      const mono = new Float32Array(n);
      for (let c = 0; c < buffer.numberOfChannels; c++) {
        const d = buffer.getChannelData(c);
        for (let i = 0; i < n; i++) mono[i] += d[i] / buffer.numberOfChannels;
      }
      const frames = classifier.classify(mono, rate);
      const sum = new Map();
      for (const f of frames) {
        for (const cat of f.classifications[0].categories) sum.set(cat.categoryName, (sum.get(cat.categoryName) || 0) + cat.score);
      }
      const k = frames.length || 1;
      const labels = [...sum].map(([name, s]) => [name, s / k]).filter(([name]) => name !== 'Silence').sort((a, b) => b[1] - a[1]);
      // Складываем оценки похожих классов: «Dog» + «Bark» + «Growling» вместе дают «Собаки».
      const byCat = new Map();
      for (const [name, s] of labels) {
        const id = AudioSetMap[name];
        if (!id || id === 'other' || s < 0.02) continue;
        byCat.set(id, (byCat.get(id) || 0) + s);
      }
      const best = [...byCat].sort((a, b) => b[1] - a[1])[0];
      return {
        labels: labels.slice(0, 3).map(([name, s]) => [name, Math.round(s * 100) / 100]),
        cat: best ? best[0] : 'other',
        conf: best ? Math.round(Math.min(1, best[1]) * 100) / 100 : 0,
      };
    }

    async function run(items) {
      if (running) return;
      running = true;
      stopFlag = false;
      failed = null;
      try {
        await init();
      } catch (err) {
        failed = String(err && err.message || err);
        running = false;
        onProgress({ phase: 'error', error: failed });
        return;
      }
      const todo = items.filter((it) => !it.ai);
      const total = items.length;
      let done = total - todo.length;
      let batch = [];
      onProgress({ phase: 'listening', done, total });
      for (const it of todo) {
        if (stopFlag) break;
        let ai;
        try {
          const buf = await decode(it, SECONDS);
          ai = buf ? listen(buf) : { labels: [], cat: 'other', conf: 0, error: true };
        } catch {
          ai = { labels: [], cat: 'other', conf: 0, error: true };
        }
        batch.push({ path: it.path, ai });
        done++;
        if (batch.length >= BATCH) {
          await api.saveListen(batch);
          batch = [];
        }
        onProgress({ phase: 'listening', done, total, current: it.name });
        await new Promise((r) => setTimeout(r, 0)); // не подвешиваем интерфейс
      }
      await api.saveListen(batch, true);
      running = false;
      onProgress({ phase: stopFlag ? 'stopped' : 'done', done, total });
    }

    return {
      run,
      stop() { stopFlag = true; },
      get running() { return running; },
      get error() { return failed; },
    };
  }

  root.Listen = { create };
})(typeof self !== 'undefined' ? self : this);
