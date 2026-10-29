// Подписываем приложение для Mac «без автора» (ad-hoc). Платной подписи Apple у нас нет,
// а без хоть какой-то подписи Mac на Apple Silicon называет приложение «повреждённым».
// Работает только на маке; на других системах шаг пропускается.
'use strict';
const path = require('path');
const { execFileSync } = require('child_process');

exports.default = async function adhocSign(context) {
  if (context.electronPlatformName !== 'darwin' || process.platform !== 'darwin') return;
  // Половинки универсальной сборки (Intel и Apple Silicon) не подписываем: их подписи различаются
  // и мешают склеить одно приложение. Склеенное приложение подписывает сборка на GitHub.
  if (/-temp$/.test(context.appOutDir)) return;
  const app = path.join(context.appOutDir, context.packager.appInfo.productFilename + '.app');
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' });
};
