// Собирает интерфейс в один HTML-файл с демо-данными, чтобы показать его в браузере без установки.
'use strict';
const fs = require('fs');
const path = require('path');
const R = path.join(__dirname, '..', 'src');
const out = process.argv[2] || path.join(__dirname, '..', 'dist', 'preview.html');
const html = fs.readFileSync(path.join(R, 'renderer', 'index.html'), 'utf8');
const body = html.split('<!--APP-->')[1].split('<!--/APP-->')[0];
const read = (p) => fs.readFileSync(path.join(R, p), 'utf8');
const page = `<title>Сэмплотека</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Golos+Text:wght@400..700&family=Unbounded:wght@500..700&family=JetBrains+Mono:wght@400;500&display=swap">
<style>
${read('renderer/styles.css')}
</style>
${body}
<script>
${read('shared/taxonomy.js')}
</script>
<script>
${read('shared/categorize.js')}
</script>
<script>
${read('shared/learn.js')}
</script>
<script>
${read('renderer/i18n.js')}
</script>
<script>
${read('renderer/demo.js')}
</script>
<script>
${read('renderer/app.js')}
</script>
`;
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, page);
console.log('preview:', out, Math.round(page.length / 1024) + ' KB');
