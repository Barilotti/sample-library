'use strict';

const { app, BrowserWindow, Menu, ipcMain, dialog, shell, nativeImage, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const { scanFolder } = require('./scanner');
const { RULES_VERSION } = require('../shared/categorize');
const Learn = require('../shared/learn');

const MAX_DECODE_BYTES = 80 * 1024 * 1024;

let win = null;
let scanning = null; // { stop: boolean }

// ---------- Хранилище библиотеки (JSON в профиле пользователя) ----------

const storePath = () => path.join(app.getPath('userData'), 'library.json');

let lib = {
  version: 1,
  rulesVersion: RULES_VERSION,
  folders: [], // [{ path, addedAt, lastScan, count }]
  items: [],
  favorites: [], // пути
  overrides: {}, // путь -> { cat, sub } — ручная смена категории
  custom: [], // свои категории: [{ id, name, words: [] }]
  forgotten: [], // выученные слова, которые человек велел забыть
  learned: [], // что приложение выучило (пересчитывается)
  recent: [], // последние прослушанные пути
  settings: { theme: 'system', autoplay: true, volume: 0.8, listen: false },
};

function loadStore() {
  try {
    const data = JSON.parse(fs.readFileSync(storePath(), 'utf8'));
    lib = { ...lib, ...data, settings: { ...lib.settings, ...(data.settings || {}) } };
  } catch {
    // первый запуск
  }
}

let saveTimer = null;
function saveStore(immediate) {
  clearTimeout(saveTimer);
  const write = () => {
    const tmp = storePath() + '.tmp';
    fs.mkdirSync(path.dirname(tmp), { recursive: true });
    fs.writeFileSync(tmp, JSON.stringify(lib));
    fs.renameSync(tmp, storePath());
  };
  if (immediate) write();
  else saveTimer = setTimeout(write, 400);
}

// Пересчитывает выученные слова и раскладку библиотеки. Возвращает, сколько звуков поменяли категорию.
function relearnAll() {
  const res = Learn.relearn({ items: lib.items, overrides: lib.overrides, custom: lib.custom, forgotten: lib.forgotten });
  lib.items = res.items;
  lib.learned = res.learned;
  return res.changed;
}

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

// ---------- Сканирование ----------

async function scanRoots(roots) {
  if (scanning) scanning.stop = true;
  const token = { stop: false };
  scanning = token;
  const rulesChanged = lib.rulesVersion !== RULES_VERSION;
  const byPath = new Map(lib.items.map((it) => [it.path, it]));

  for (const root of roots) {
    if (token.stop) break;
    send('scan:progress', { root, phase: 'listing', found: 0 });
    const items = await scanFolder(root, {
      previous: byPath,
      rulesChanged,
      shouldStop: () => token.stop,
      onProgress: (p) => send('scan:progress', { root, ...p }),
    });
    if (token.stop) break;
    const others = lib.items.filter((it) => it.root !== root);
    lib.items = others.concat(items);
    relearnAll();
    const f = lib.folders.find((x) => x.path === root);
    if (f) {
      f.lastScan = Date.now();
      f.count = items.length;
    }
    saveStore(true);
    send('library:changed', snapshot());
  }
  if (!token.stop) lib.rulesVersion = RULES_VERSION;
  saveStore(true);
  if (scanning === token) scanning = null;
  send('scan:progress', { phase: 'done' });
}

function snapshot() {
  return {
    folders: lib.folders,
    items: lib.items,
    favorites: lib.favorites,
    overrides: lib.overrides,
    custom: lib.custom,
    learned: lib.learned,
    recent: lib.recent,
    settings: lib.settings,
    scanning: !!scanning,
  };
}

async function addFolder(folder) {
  const norm = path.resolve(folder);
  const st = await fsp.stat(norm).catch(() => null);
  if (!st || !st.isDirectory()) return { error: 'Это не папка: ' + norm };
  // Не добавляем папку, если она уже внутри добавленной (и наоборот: вложенные заменяем).
  const inside = lib.folders.find((f) => norm === f.path || norm.startsWith(f.path + path.sep));
  if (inside) return { error: 'Эта папка уже в библиотеке: ' + inside.path };
  const nested = lib.folders.filter((f) => f.path.startsWith(norm + path.sep));
  lib.folders = lib.folders.filter((f) => !nested.includes(f));
  lib.items = lib.items.filter((it) => !nested.some((f) => it.root === f.path));
  lib.folders.push({ path: norm, addedAt: Date.now(), lastScan: null, count: 0 });
  saveStore();
  send('library:changed', snapshot());
  scanRoots([norm]);
  return { ok: true };
}

// ---------- Иконка для перетаскивания в DAW ----------

const IS_MAC = process.platform === 'darwin';

function makeDragIcon() {
  // На Mac порядок байт в картинке другой, поэтому берём уменьшенную иконку приложения.
  if (IS_MAC) return nativeImage.createFromPath(path.join(__dirname, 'icon.png')).resize({ width: 32, height: 32 });
  // Маленькая "волна" 32x32 в BGRA, чтобы не таскать файл картинки.
  const w = 32, h = 32;
  const buf = Buffer.alloc(w * h * 4);
  for (let x = 0; x < w; x++) {
    const amp = Math.abs(Math.sin(x * 0.55)) * (1 - Math.abs(x - 16) / 18) * 13 + 2;
    for (let y = 0; y < h; y++) {
      const i = (y * w + x) * 4;
      const inside = Math.abs(y - 16) <= amp && x % 3 !== 2;
      buf[i] = 0x3b; buf[i + 1] = 0xa9; buf[i + 2] = 0xf2; buf[i + 3] = inside ? 255 : 0;
    }
  }
  return nativeImage.createFromBitmap(buf, { width: w, height: h });
}

// ---------- Окно ----------

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 980,
    minHeight: 620,
    backgroundColor: '#0f1117',
    title: 'Сэмплотека',
    icon: path.join(__dirname, 'icon.png'),
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  // На Windows меню не нужно. На Mac без него не работают Cmd+C/V/Q и пропадает меню приложения.
  if (!IS_MAC) win.removeMenu();
  win.once('ready-to-show', () => win.show());
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  // Ссылки наружу открываем в браузере, а не внутри приложения.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e) => e.preventDefault());
}

app.whenReady().then(() => {
  loadStore();
  if (lib.items.length) relearnAll();
  nativeTheme.themeSource = lib.settings.theme || 'system';
  const dragIcon = makeDragIcon();

  ipcMain.handle('library:get', () => snapshot());

  ipcMain.handle('library:pickFolder', async () => {
    const res = await dialog.showOpenDialog(win, {
      title: 'Папка с сэмплами',
      properties: ['openDirectory'],
    });
    if (res.canceled || !res.filePaths[0]) return { canceled: true };
    return addFolder(res.filePaths[0]);
  });

  ipcMain.handle('library:addFolder', (_e, folder) => addFolder(folder));

  ipcMain.handle('library:removeFolder', (_e, folder) => {
    lib.folders = lib.folders.filter((f) => f.path !== folder);
    lib.items = lib.items.filter((it) => it.root !== folder);
    saveStore();
    return snapshot();
  });

  ipcMain.handle('library:rescan', (_e, folder) => {
    const roots = folder ? [folder] : lib.folders.map((f) => f.path);
    scanRoots(roots);
    return true;
  });

  ipcMain.handle('library:stopScan', () => {
    if (scanning) scanning.stop = true;
    return true;
  });

  ipcMain.handle('library:setFavorite', (_e, p, on) => {
    const set = new Set(lib.favorites);
    on ? set.add(p) : set.delete(p);
    lib.favorites = [...set];
    saveStore();
    return lib.favorites;
  });

  // Ручная смена категории. Приложение учится на ней и переносит похожие звуки.
  ipcMain.handle('library:setCategory', (_e, p, cat, sub) => {
    const before = new Set(lib.learned.map((l) => l.word + '|' + l.id));
    if (cat) lib.overrides[p] = { cat, sub: sub || null };
    else delete lib.overrides[p];
    const moved = relearnAll();
    saveStore();
    const words = lib.learned.filter((l) => l.source === 'manual' && !before.has(l.word + '|' + l.id)).map((l) => l.word);
    send('library:changed', snapshot());
    return { overrides: lib.overrides, moved, words };
  });

  ipcMain.handle('library:setCustom', (_e, list) => {
    lib.custom = (Array.isArray(list) ? list : []).filter((c) => c && c.id && c.name);
    // Ручные категории, указывающие на удалённую свою категорию, больше не действуют.
    const ids = new Set(lib.custom.map((c) => c.id));
    for (const [p, o] of Object.entries(lib.overrides)) if (o.cat.startsWith('user-') && !ids.has(o.cat)) delete lib.overrides[p];
    const moved = relearnAll();
    saveStore();
    send('library:changed', snapshot());
    return { moved };
  });

  ipcMain.handle('library:forget', (_e, word, undo) => {
    const set = new Set(lib.forgotten);
    undo ? set.delete(word) : set.add(word);
    lib.forgotten = [...set];
    const moved = relearnAll();
    saveStore();
    send('library:changed', snapshot());
    return { moved };
  });

  // Результаты нейросети приходят пачками из окна: сохраняем и пересчитываем раскладку.
  // Раскладку пересчитываем не чаще раза в 20 секунд, чтобы фоновое прослушивание не мешало работе.
  let listenTimer = null;
  const flushListen = () => {
    clearTimeout(listenTimer);
    listenTimer = null;
    const moved = relearnAll();
    saveStore();
    if (moved) send('library:changed', snapshot());
    return moved;
  };
  ipcMain.handle('library:saveListen', (_e, batch, final) => {
    const byPath = new Map(lib.items.map((it, i) => [it.path, i]));
    for (const { path: p, ai } of batch || []) {
      const i = byPath.get(p);
      if (i != null) lib.items[i] = { ...lib.items[i], ai };
    }
    if (final) return { moved: flushListen() };
    if (!listenTimer) listenTimer = setTimeout(flushListen, 20000);
    saveStore();
    return { moved: 0 };
  });

  ipcMain.handle('library:addRecent', (_e, p) => {
    lib.recent = [p, ...lib.recent.filter((x) => x !== p)].slice(0, 200);
    saveStore();
    return lib.recent;
  });

  ipcMain.handle('settings:set', (_e, patch) => {
    lib.settings = { ...lib.settings, ...patch };
    if (patch.theme) nativeTheme.themeSource = patch.theme;
    saveStore();
    return lib.settings;
  });

  // Байты файла для волны и прослушивания. Огромные файлы не читаем целиком.
  ipcMain.handle('file:read', async (_e, p) => {
    if (!lib.items.some((it) => it.path === p)) throw new Error('Файл не из библиотеки');
    const st = await fsp.stat(p);
    if (st.size > MAX_DECODE_BYTES) return null;
    const buf = await fsp.readFile(p);
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  });

  // Начало файла: для нейросети хватает первых секунд звука.
  ipcMain.handle('file:readHead', async (_e, p, bytes) => {
    if (!lib.items.some((it) => it.path === p)) throw new Error('Файл не из библиотеки');
    const fd = await fsp.open(p, 'r');
    try {
      const buf = Buffer.alloc(Math.min(bytes || 4e6, MAX_DECODE_BYTES));
      const { bytesRead } = await fd.read(buf, 0, buf.length, 0);
      return buf.buffer.slice(buf.byteOffset, buf.byteOffset + bytesRead);
    } finally {
      await fd.close();
    }
  });

  // Файлы нейросети (wasm и модель) лежат внутри приложения; отдаём их байтами,
  // потому что загрузчик не умеет читать file:// сам.
  const ASSETS = {
    'loader': path.join(__dirname, '..', 'renderer', 'vendor', 'mediapipe', 'audio_wasm_internal.js'),
    'wasm': path.join(__dirname, '..', 'renderer', 'vendor', 'mediapipe', 'audio_wasm_internal.wasm'),
    'model': path.join(__dirname, '..', 'renderer', 'vendor', 'yamnet.tflite'),
  };
  ipcMain.handle('app:asset', async (_e, name) => {
    const buf = await fsp.readFile(ASSETS[name]);
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  });

  ipcMain.on('file:startDrag', (e, paths) => {
    const list = (Array.isArray(paths) ? paths : [paths]).filter((p) => fs.existsSync(p));
    if (!list.length) return;
    e.sender.startDrag(list.length === 1 ? { file: list[0], icon: dragIcon } : { files: list, file: list[0], icon: dragIcon });
  });

  ipcMain.handle('file:reveal', (_e, p) => shell.showItemInFolder(p));
  ipcMain.handle('file:exists', (_e, p) => fs.existsSync(p));

  if (IS_MAC) {
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      { role: 'appMenu' },
      { role: 'editMenu' },
      { role: 'windowMenu' },
    ]));
  }

  createWindow();

  // На Mac приложение остаётся в Dock после закрытия окна; клик по иконке открывает окно снова.
  app.on('activate', () => {
    if (!BrowserWindow.getAllWindows().length) createWindow();
  });

  // При запуске тихо проверяем изменения в папках.
  if (lib.folders.length) setTimeout(() => scanRoots(lib.folders.map((f) => f.path)), 1500);
});

app.on('window-all-closed', () => {
  saveStore(true);
  if (!IS_MAC) app.quit();
});

app.on('before-quit', () => saveStore(true));
