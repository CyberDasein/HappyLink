#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Load .env if present
try { require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') }); } catch (e) {}

const argv = require('minimist')(process.argv.slice(2));
const target = argv.target || argv.t || process.env.TARGET_REPO_URL || '';
const branch = argv.branch || argv.b || process.env.TARGET_BRANCH || 'deploy';

function safeExec(cmd, opts = {}) {
  try {
    return execSync(cmd, Object.assign({ stdio: 'inherit' }, opts));
  } catch (e) {
    throw e;
  }
}

function run() {
  const repoUrl = target || (() => {
    try { return execSync('git remote get-url origin', { encoding: 'utf8' }).trim(); } catch (e) { return ''; }
  })();

  if (!repoUrl) {
    console.error('❌ Не удалось определить URL репозитория (TARGET_REPO_URL не задан и git remote get-url origin провалился)');
    process.exit(1);
  }

  const tempDir = path.join(require('os').tmpdir(), `deploy-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });

  console.log(`📥 Клонируем ветку ${branch} из ${repoUrl} ...`);
  let cloned = false;
  try {
    // Проверим, есть ли ветка на удалённом
    const ls = execSync(`git ls-remote --heads "${repoUrl}" ${branch}`, { encoding: 'utf8' });
    if (ls && ls.trim()) {
      safeExec(`git clone --branch "${branch}" --single-branch "${repoUrl}" "${tempDir}"`);
      cloned = true;
    }
  } catch (e) {
    // ignore
  }

  if (!cloned) {
    // клонируем и создаём ветку
    safeExec(`git clone "${repoUrl}" "${tempDir}"`);
    process.chdir(tempDir);
    safeExec(`git checkout -b "${branch}"`);
  } else {
    process.chdir(tempDir);
  }

  // Настроим git для кросс-платформенности
  try { safeExec('git config core.autocrlf false'); } catch (e) {}
  try { safeExec('git config core.eol lf'); } catch (e) {}
  try { safeExec('git config core.safecrlf false'); } catch (e) {}

  // Determine project root and docs source BEFORE changing cwd. This prevents
  // accidental deletion of repo contents when docs folder is missing.
  const projectRoot = path.resolve(__dirname, '..');
  const docsSrc = path.join(projectRoot, 'docs');

  if (!fs.existsSync(docsSrc)) {
    console.error('❌ Папка docs не найдена в проекте, отменяю деплой (чтобы не удалить файлы в целевом репозитории)');
    // cleanup tempDir and exit
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (e) {}
    process.exit(1);
  }

  console.log('📁 Обновляем содержимое...');
  // Удалим всё кроме .git
  const entries = fs.readdirSync(tempDir, { withFileTypes: true });
  for (const ent of entries) {
    const name = ent.name;
    if (name === '.git') continue;
    const full = path.join(tempDir, name);
    try { fs.rmSync(full, { recursive: true, force: true }); } catch (e) { /* ignore */ }
  }

  // Копируем docs из реального корня проекта
  const copyRecursive = (src, dest) => {
    const stat = fs.statSync(src);
    if (stat.isDirectory()) {
      if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
      for (const child of fs.readdirSync(src)) copyRecursive(path.join(src, child), path.join(dest, child));
    } else {
      fs.copyFileSync(src, dest);
    }
  };
  copyRecursive(docsSrc, tempDir);

  console.log('💾 Коммитим изменения...');
  try {
    safeExec('git add .');
    safeExec(`git commit -m "Deploy build ${new Date().toISOString()}"`);
  } catch (e) {
    console.log('ℹ️  Нет изменений для коммита или произошла ошибка при коммите');
  }

  console.log(`📤 Пушим в ветку ${branch} в ${repoUrl} ...`);
  try {
    if (target) {
      try { safeExec('git remote remove target'); } catch (e) {}
      safeExec(`git remote add target "${target}"`);
      try { safeExec('git add .'); } catch (e) {}
      try { safeExec(`git commit -m "Deploy build ${new Date().toISOString()}"`); } catch (e) {}
      safeExec(`git push target "${branch}"`);
    } else {
      safeExec(`git push origin "${branch}"`);
    }
  } catch (e) {
    console.error('Ошибка при пуше:', e && e.message ? e.message : e);
    process.exit(1);
  }

  // Очистка
  process.chdir(path.resolve(__dirname, '..'));
  try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (e) {}

  console.log('✅ Деплой завершен!');
}

run();
