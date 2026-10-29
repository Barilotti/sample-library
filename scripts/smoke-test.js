// Проверка готовой сборки: запускает приложение, добавляет тестовую папку, включает распознавание
// по звуку и проверяет, что всё разложилось без ошибок. Нужен пакет playwright.
// node scripts/smoke-test.js <путь к исполняемому файлу> <папка для результатов>
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { _electron } = require('playwright');

(async () => {
  const exe = process.argv[2];
  const out = path.resolve(process.argv[3] || 'smoke');
  fs.mkdirSync(out, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sampleteka-'));
  const lib = path.join(tmp, 'Библиотека звуков');
  execFileSync(process.execPath, [path.join(__dirname, 'make-demo-library.js'), lib], { stdio: 'inherit' });

  const errors = [];
  const app = await _electron.launch({ executablePath: exe, args: ['--user-data-dir=' + path.join(tmp, 'ud'), ...(process.platform === 'linux' ? ['--no-sandbox'] : [])] });
  const w = await app.firstWindow();
  w.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  w.on('console', (m) => { if (m.type() === 'error' && !/^INFO:/.test(m.text())) errors.push('console: ' + m.text()); });
  await w.setViewportSize({ width: 1440, height: 900 });
  await w.waitForSelector('#q');
  await w.screenshot({ path: path.join(out, '1-empty.png') });

  await w.evaluate((p) => window.api.addFolder(p), lib);
  await w.waitForFunction(() => document.querySelectorAll('.row').length > 0, null, { timeout: 30000 });
  await w.screenshot({ path: path.join(out, '2-library.png') });

  // Нейросеть: включаем и ждём, пока прослушает файлы.
  await w.click('#btn-learn');
  await w.check('#listen-on');
  const deadline = Date.now() + 90000;
  let heard = 0;
  let total = 0;
  while (Date.now() < deadline) {
    await w.waitForTimeout(3000);
    const snap = await w.evaluate(() => window.api.getLibrary());
    total = snap.items.length;
    heard = snap.items.filter((it) => it.ai && !it.ai.error).length;
    if (heard === total) break;
  }
  await w.screenshot({ path: path.join(out, '3-learn.png') });
  await w.click('#learn-close');
  await w.click('.row >> nth=0');
  await w.waitForTimeout(800);
  await w.screenshot({ path: path.join(out, '4-player.png') });

  const menu = await app.evaluate(({ Menu }) => {
    const m = Menu.getApplicationMenu();
    return m ? m.items.map((i) => i.role || i.label) : [];
  });
  await app.close();

  console.log(`Файлов: ${total}, прослушано нейросетью: ${heard}`);
  console.log('Меню:', menu.join(', ') || 'нет');
  if (errors.length) console.log(errors.join('\n'));
  if (!total || heard < total || errors.length) process.exit(1);
  console.log('Проверка пройдена');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
