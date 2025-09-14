// dev-server.js
const express = require('express');
const chokidar = require('chokidar');
const path = require('path');
const { exec } = require('child_process');

const app = express();
const port = 3001;

console.log('🚀 Dev сервер - наблюдаем только за dev/ папкой');

// Компилируем SCSS из dev/scss в CSS
function compileSCSS() {
  console.log('🎨 Компиляция SCSS из dev/scss...');
  
  exec('sass dev/scss:dev/css --style=expanded --no-source-map', (error, stdout, stderr) => {
    if (error) {
      console.error('❌ Ошибка компиляции SCSS:', error.message);
      return;
    }
    if (stderr) {
      console.log('⚠️  SCSS:', stderr);
    }
    console.log('✅ SCSS скомпилирован в dev/css/');
  });
}

// Наблюдаем ТОЛЬКО за dev папкой
chokidar.watch([
  './dev/scss/**/*.scss',
  './dev/js/**/*.js',
  './dev/index.html'
]).on('change', (filePath) => {
  console.log(`🔄 Изменен: ${path.basename(filePath)}`);
  
  if (filePath.endsWith('.scss')) {
    compileSCSS();
  }
  
  // Для JS файлов просто перезагружаем страницу (браузер делает hot-reload)
});

// Сервируем dev папку
app.use(express.static('./dev'));

// Главная страница
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'dev/index.html'));
});

// Инициальная компиляция
compileSCSS();

app.listen(port, () => {
  console.log(`🌐 Сервер запущен на http://localhost:${port}`);
});
