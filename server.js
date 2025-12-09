require('dotenv').config();

const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();

app.use(express.json());
app.use(express.static('src'));

// --- Читаем пароль из .env ---
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

if (!ADMIN_PASSWORD) {
  console.error('❌ Не установлено значение ADMIN_PASSWORD в .env файле');
  process.exit(1);
}

const newCardsPath = path.join(__dirname, 'data', 'new-cards.json');
const dataDir = path.dirname(newCardsPath);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}
if (!fs.existsSync(newCardsPath)) {
  fs.writeFileSync(newCardsPath, '[]');
}

// Проверка авторизации
function checkAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }

  const token = authHeader.split(' ')[1];
  if (token !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Неверный токен' });
  }

  next();
}

// Отдаём страницу формы
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '', 'admin-form.html')); // или где у тебя лежит
});

// --- НОВЫЙ МАРШРУТ: проверка пароля ---
app.post('/api/check-auth', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }

  const token = authHeader.split(' ')[1];
  if (token === ADMIN_PASSWORD) {
    res.json({ success: true });
  } else {
    res.status(401).json({ error: 'Неверный пароль' });
  }
});

// POST-эндпоинт для добавления карточки (только с авторизацией)
app.post('/api/add-card', checkAuth, (req, res) => {
  const card = req.body;

  const required = ['name', 'message', 'path', 'gender', 'dateStr', 'template'];
  for (const field of required) {
    if (!card[field]) {
      return res.status(400).json({ error: `Поле ${field} обязательно.` });
    }
  }

  if (!['man', 'woman'].includes(card.gender)) {
    return res.status(400).json({ error: 'Пол должен быть "man" или "woman"' });
  }

  let newCards = JSON.parse(fs.readFileSync(newCardsPath, 'utf-8'));

  if (newCards.some(c => c.path === card.path)) {
    return res.status(400).json({ error: 'Путь уже существует. Должен быть уникальным.' });
  }

  newCards.push(card);
  fs.writeFileSync(newCardsPath, JSON.stringify(newCards, null, 2));

  res.json({ success: true, message: 'Карточка добавлена в new-cards.json' });
});

const port = 3001;
app.listen(port, () => {
  console.log(`Сервер запущен на http://localhost:${port}`);
});
