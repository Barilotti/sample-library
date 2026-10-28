// Сканер папки с сэмплами. Ничего не пишет и не перемещает: только читает список файлов
// и заголовки аудио (первые килобайты), поэтому 160 ГБ проходится за минуты, а не часы.
'use strict';

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { classify } = require('../shared/categorize');

const AUDIO_EXT = new Set(['.wav', '.wave', '.aif', '.aiff', '.aifc', '.mp3', '.flac', '.ogg', '.oga', '.m4a', '.aac', '.wma', '.opus']);
const SKIP_DIRS = new Set(['$recycle.bin', 'system volume information', '.git', 'node_modules', '__macosx', '.ds_store']);

async function walk(root, onFile, shouldStop) {
  const stack = [root];
  while (stack.length) {
    if (shouldStop()) return;
    const dir = stack.pop();
    let handle;
    try {
      handle = await fsp.opendir(dir);
    } catch {
      continue; // нет доступа к папке: пропускаем, а не падаем
    }
    for await (const ent of handle) {
      const name = ent.name;
      if (name.startsWith('.') || name.startsWith('._')) continue;
      const full = path.join(dir, name);
      if (ent.isDirectory()) {
        if (!SKIP_DIRS.has(name.toLowerCase())) stack.push(full);
      } else if (ent.isFile() && AUDIO_EXT.has(path.extname(name).toLowerCase())) {
        onFile(full);
      }
    }
  }
}

async function readAt(fd, pos, len) {
  const buf = Buffer.alloc(len);
  const { bytesRead } = await fd.read(buf, 0, len, pos);
  return buf.subarray(0, bytesRead);
}

// WAV: идём по чанкам, берём fmt, размер data и темп из ACID-чанка (его пишут Ableton, FL, Acid).
async function parseWav(fd, size) {
  const head = await readAt(fd, 0, 12);
  const id = head.toString('ascii', 0, 4);
  if ((id !== 'RIFF' && id !== 'RF64') || head.toString('ascii', 8, 12) !== 'WAVE') return null;
  const info = {};
  let pos = 12;
  let dataSize = null;
  let ds64Data = null;
  for (let i = 0; i < 64 && pos + 8 <= size; i++) {
    const ch = await readAt(fd, pos, 8);
    if (ch.length < 8) break;
    const cid = ch.toString('ascii', 0, 4);
    const csize = ch.readUInt32LE(4);
    const body = pos + 8;
    if (cid === 'fmt ') {
      const f = await readAt(fd, body, Math.min(csize, 40));
      info.channels = f.readUInt16LE(2);
      info.sampleRate = f.readUInt32LE(4);
      info.byteRate = f.readUInt32LE(8);
      info.bits = f.readUInt16LE(14);
    } else if (cid === 'ds64') {
      const d = await readAt(fd, body, 28);
      ds64Data = Number(d.readBigUInt64LE(8));
    } else if (cid === 'data') {
      dataSize = csize === 0xffffffff && ds64Data ? ds64Data : Math.min(csize, size - body);
    } else if (cid === 'acid' && csize >= 24) {
      const a = await readAt(fd, body, 24);
      const tempo = a.readFloatLE(20);
      const oneShot = (a.readUInt32LE(0) & 1) === 1;
      if (!oneShot && tempo >= 40 && tempo <= 300) info.bpm = Math.round(tempo * 10) / 10;
      info.acidOneShot = oneShot;
    }
    const realSize = cid === 'data' && dataSize != null ? dataSize : csize;
    pos = body + realSize + (realSize & 1);
  }
  if (info.byteRate && dataSize != null) info.duration = dataSize / info.byteRate;
  return info;
}

// 80-битное число с плавающей точкой из AIFF (частота дискретизации).
function readExtended(b, o) {
  const exp = ((b[o] & 0x7f) << 8) | b[o + 1];
  const hi = b.readUInt32BE(o + 2);
  const lo = b.readUInt32BE(o + 6);
  if (exp === 0 && hi === 0 && lo === 0) return 0;
  return (hi * 2 ** 32 + lo) * 2 ** (exp - 16383 - 63);
}

async function parseAiff(fd, size) {
  const head = await readAt(fd, 0, 12);
  if (head.toString('ascii', 0, 4) !== 'FORM') return null;
  const form = head.toString('ascii', 8, 12);
  if (form !== 'AIFF' && form !== 'AIFC') return null;
  let pos = 12;
  for (let i = 0; i < 64 && pos + 8 <= size; i++) {
    const ch = await readAt(fd, pos, 8);
    if (ch.length < 8) break;
    const cid = ch.toString('ascii', 0, 4);
    const csize = ch.readUInt32BE(4);
    if (cid === 'COMM') {
      const c = await readAt(fd, pos + 8, 18);
      const channels = c.readUInt16BE(0);
      const frames = c.readUInt32BE(2);
      const bits = c.readUInt16BE(6);
      const sampleRate = readExtended(c, 8);
      return { channels, bits, sampleRate: Math.round(sampleRate), duration: sampleRate ? frames / sampleRate : undefined };
    }
    pos += 8 + csize + (csize & 1);
  }
  return {};
}

let mm = null;
async function parseOther(file) {
  if (!mm) mm = await import('music-metadata');
  const meta = await mm.parseFile(file, { duration: false, skipCovers: true });
  const f = meta.format;
  const c = meta.common;
  return {
    channels: f.numberOfChannels,
    sampleRate: f.sampleRate,
    bits: f.bitsPerSample,
    duration: f.duration,
    bpm: c.bpm ? Math.round(c.bpm * 10) / 10 : undefined,
    key: c.key || undefined,
    title: c.title || undefined,
  };
}

async function readAudioInfo(file, size) {
  const ext = path.extname(file).toLowerCase();
  try {
    if (ext === '.wav' || ext === '.wave' || ext.startsWith('.aif')) {
      const fd = await fsp.open(file, 'r');
      try {
        return (ext.startsWith('.aif') ? await parseAiff(fd, size) : await parseWav(fd, size)) || {};
      } finally {
        await fd.close();
      }
    }
    return await parseOther(file);
  } catch {
    return {}; // битый файл не должен останавливать сканирование
  }
}

function buildItem(root, file, st, info) {
  const rel = path.relative(root, file);
  const segments = rel.split(path.sep);
  const c = classify(segments, info.duration);
  let type = c.type;
  if (info.bpm && type !== 'loop') type = 'loop';
  if (info.acidOneShot && type === 'loop' && !c.bpm) type = 'oneshot';
  return {
    path: file,
    root,
    rel,
    name: path.basename(file).replace(/\.[^.]+$/, ''),
    ext: path.extname(file).slice(1).toLowerCase(),
    size: st.size,
    mtime: Math.round(st.mtimeMs),
    duration: info.duration != null ? Math.round(info.duration * 1000) / 1000 : null,
    sampleRate: info.sampleRate || null,
    bits: info.bits || null,
    channels: info.channels || null,
    bpm: info.bpm || c.bpm || null,
    key: info.key || c.key || null,
    cat: c.cat,
    sub: c.sub,
    type,
  };
}

/**
 * Сканирует папку. previous — прошлые записи по пути: файлы с тем же размером и датой
 * не перечитываются, поэтому повторный скан большой библиотеки идёт быстро.
 */
async function scanFolder(root, { previous = new Map(), onProgress = () => {}, shouldStop = () => false, rulesChanged = false } = {}) {
  const files = [];
  let lastTick = 0;
  await walk(root, (f) => {
    files.push(f);
    const now = Date.now();
    if (now - lastTick > 150) {
      lastTick = now;
      onProgress({ phase: 'listing', found: files.length });
    }
  }, shouldStop);

  const items = new Array(files.length);
  let done = 0;
  let next = 0;
  const CONCURRENCY = 16;

  async function worker() {
    while (next < files.length && !shouldStop()) {
      const i = next++;
      const file = files[i];
      let st;
      try {
        st = await fsp.stat(file);
      } catch {
        done++;
        continue;
      }
      const prev = previous.get(file);
      if (prev && prev.size === st.size && prev.mtime === Math.round(st.mtimeMs)) {
        if (rulesChanged) {
          const info = { duration: prev.duration, sampleRate: prev.sampleRate, bits: prev.bits, channels: prev.channels };
          const fresh = buildItem(root, file, st, info);
          items[i] = { ...fresh, bpm: prev.bpm || fresh.bpm, key: prev.key || fresh.key };
        } else {
          items[i] = prev;
        }
      } else {
        const info = await readAudioInfo(file, st.size);
        items[i] = buildItem(root, file, st, info);
      }
      done++;
      const now = Date.now();
      if (now - lastTick > 150) {
        lastTick = now;
        onProgress({ phase: 'reading', done, total: files.length, current: path.basename(file) });
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  onProgress({ phase: 'reading', done, total: files.length });
  return items.filter(Boolean);
}

module.exports = { scanFolder, readAudioInfo, AUDIO_EXT };
