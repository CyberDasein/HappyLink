require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');

const token = process.env.T_BOT_TOKEN;

// Его можно получить, например, через @userinfobot
const adminChatId = '438708073';

const bot = new TelegramBot(token, { polling: true });

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// In-memory sessions for admin form
const sessions = {};

// Prevent concurrent deploy runs
let deployRunning = false;

// Message sending helpers to avoid hitting Telegram rate limits
const logBuffer = { lines: [], timer: null };
const LOG_FLUSH_MS = 2000;
const LOG_MAX_LINES = 8;

function safeSend(chatId, text, options) {
    return bot.sendMessage(chatId, text, options).catch((err) => {
        console.error('Telegram send error:', err && err.message ? err.message : err);
        const msg = err && err.message ? err.message : '';
        const m = msg.match(/retry after (\d+)/i);
        if (m) {
            const wait = parseInt(m[1], 10) * 1000 + 500;
            console.log(`Rate limited, retrying after ${wait}ms`);
            return new Promise((resolve) => setTimeout(() => resolve(safeSend(chatId, text, options)), wait));
        }
        return Promise.resolve();
    });
}

function bufferLog(prefix, line, chatId) {
    logBuffer.lines.push(`${prefix}: ${line}`);
    if (logBuffer.lines.length >= LOG_MAX_LINES) flushLogs(chatId);
    if (!logBuffer.timer) {
        logBuffer.timer = setTimeout(() => flushLogs(chatId), LOG_FLUSH_MS);
    }
}

function flushLogs(chatId) {
    if (logBuffer.timer) { clearTimeout(logBuffer.timer); logBuffer.timer = null; }
    if (logBuffer.lines.length === 0) return;
    const payload = logBuffer.lines.join('\n');
    logBuffer.lines = [];
    safeSend(chatId, payload).catch((e) => console.error('Failed to send log batch', e));
}

process.on('unhandledRejection', (reason, p) => {
    console.error('Unhandled Rejection at:', p, 'reason:', reason);
    // try to inform admin (best-effort)
    try { safeSend(adminChatId, `Unhandled Rejection: ${reason && reason.message ? reason.message : reason}`); } catch (e) {}
});

const ADMIN_FIELDS = [
    { key: 'name', label: 'Имя клиента', type: 'text' },
    { key: 'sender_rp', label: 'Имя отправителя (родительный падеж)', type: 'text' },
    { key: 'sender_ip', label: 'Имя отправителя (именительный падеж)', type: 'text' },
    { key: 'message', label: 'Сообщение', type: 'text' },
    // Ask template before photo so we know where to store uploaded images
    { key: 'template', label: 'Шаблон (retrowave/jumble/terminal/computer)', type: 'choice', choices: ['retrowave','jumble','terminal','computer'] },
    { key: 'photo', label: 'Фото (пришлите изображение или URL, можно оставить пустым)', type: 'photo', optional: true },
    { key: 'path', label: 'Часть пути (уникальная)', type: 'text' },
    { key: 'gender', label: 'Пол (man/woman)', type: 'choice', choices: ['man', 'woman'] },
    { key: 'dateStr', label: 'Дата (YYYY-MM-DD)', type: 'date' }
];

const NEW_CARDS_PATH = path.join(__dirname, 'data', 'new-cards.json');
// Ensure file exists
try {
    const dir = path.dirname(NEW_CARDS_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(NEW_CARDS_PATH)) fs.writeFileSync(NEW_CARDS_PATH, '[]');
} catch (e) {
    console.error('Failed to ensure new-cards.json exists:', e);
}

// Текст приветственного сообщения с шаблонами и вопросами
const welcomeMessage = `🎉 Привет! Давай создадим твою уникальную цифровую открытку 💌\n\nОтправь мне по очереди:\n\n1. 
Какой стиль тебе нравится? (выбери номер на картинках)\n2. Имя получателя подарка\n3. От кого открытка\n4. 
Дата, с которой начинать отсчет дней любви (например, дата знакомства)\n5. 
Текст сообщения для открытки\n6. Фото, которое хочешь добавить в открытку ❤️.\n\nКаждая открытка стоит 499р, действует постоплата.`;

// Обработка команды /start
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;

    bot.sendMessage(chatId, welcomeMessage).then(() => {
        const templates = [
            { type: 'photo', media: 'https://storage.yandexcloud.net/templates-img/variant1.png', caption: 'Стиль 1' },
            { type: 'photo', media: 'https://storage.yandexcloud.net/templates-img/variant2.png', caption: 'Стиль 2' },
            { type: 'photo', media: 'https://storage.yandexcloud.net/templates-img/variant3.png', caption: 'Стиль 3' },
            { type: 'photo', media: 'https://storage.yandexcloud.net/templates-img/variant4.png', caption: 'Стиль 4' }
        ];

        bot.sendMediaGroup(chatId, templates);
    });
});

// Обработка всех текстовых сообщений от пользователей
bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id; // ID пользователя (может отличаться от username)
    const userName = msg.from.username ? `@${msg.from.username}` : `ID: ${userId}`;
    const userMessage = msg.text;

    // Проверяем, что сообщение пришло не от администратора (чтобы не отправлять себе ответы)
    // If message from admin and session active, handle admin flow
    if (chatId.toString() === adminChatId) {
        // Start create flow
        if (userMessage && userMessage.toLowerCase() === '/create') {
            sessions[chatId] = { index: 0, data: {} };
            const field = ADMIN_FIELDS[0];
            let prompt = `Введите: ${field.label}`;
            if (field.type === 'choice') prompt += ` (${field.choices.join('/')})`;
            bot.sendMessage(chatId, `Начинаем создание карточки. ${prompt}`);
            return;
        }

        // If session exists, accept answers
        const session = sessions[chatId];
        if (session) {
            const field = ADMIN_FIELDS[session.index];
            // PHOTO handling: if admin sent a photo for this step
            if (field.type === 'photo' && msg.photo && msg.photo.length) {
                // choose highest resolution
                const fileId = msg.photo[msg.photo.length - 1].file_id;
                (async () => {
                    try {
                        const fileInfo = await bot.getFile(fileId);
                        const filePath = fileInfo.file_path; // e.g., photos/file_123.jpg
                        const ext = path.extname(filePath) || '.jpg';
                        const templateName = session.data.template || 'default';
                        const destDir = path.join(__dirname, 'src', 'templates', templateName, 'images');
                        fs.mkdirSync(destDir, { recursive: true });
                        const filename = `${Date.now()}-${Math.random().toString(36).slice(2,8)}${ext}`;
                        const outPath = path.join(destDir, filename);

                        // download file from Telegram API
                        const https = require('https');
                        const fileUrl = `https://api.telegram.org/file/bot${token}/${filePath}`;
                        const fileStream = fs.createWriteStream(outPath);
                        https.get(fileUrl, (res) => {
                            res.pipe(fileStream);
                            fileStream.on('finish', () => {
                                fileStream.close();
                                // expose as /assets/<filename> so templates can use it
                                session.data.photo = `/assets/${filename}`;
                                bot.sendMessage(chatId, `Фото сохранено и будет использовано: ${session.data.photo}`);
                                // move to next field
                                session.index++;
                                if (session.index >= ADMIN_FIELDS.length) {
                                    // finish flow: write to file
                                    try {
                                        const arr = JSON.parse(fs.readFileSync(NEW_CARDS_PATH, 'utf8') || '[]');
                                        arr.push(session.data);
                                        fs.writeFileSync(NEW_CARDS_PATH, JSON.stringify(arr, null, 2));
                                        bot.sendMessage(chatId, 'Карточка добавлена в new-cards.json. Хотите сейчас сгенерировать открытку?', {
                                            reply_markup: { inline_keyboard: [[{ text: 'Сгенерировать и задеплоить', callback_data: 'GENERATE_AND_DEPLOY' }]] }
                                        });
                                    } catch (e) {
                                        console.error('Failed to write new-cards.json', e);
                                        bot.sendMessage(chatId, 'Ошибка при сохранении карточки.');
                                    }
                                    delete sessions[chatId];
                                    return;
                                }
                                const next = ADMIN_FIELDS[session.index];
                                let prompt2 = `Введите: ${next.label}`;
                                if (next.type === 'choice') prompt2 += ` (${next.choices.join('/')})`;
                                bot.sendMessage(chatId, prompt2);
                            });
                        }).on('error', (err) => {
                            console.error('Ошибка при скачивании файла:', err);
                            bot.sendMessage(chatId, 'Не удалось скачать фото. Попробуйте ещё раз.');
                        });
                    } catch (e) {
                        console.error('Failed to fetch file info', e);
                        bot.sendMessage(chatId, 'Ошибка обработки фото.');
                    }
                })();
                return;
            }

            // If photo field expects a URL typed by admin
            let value = userMessage || '';
            if (field.type === 'photo' && value) {
                // basic check: if it looks like a URL, store as-is
                if (/^https?:\/\//i.test(value)) {
                    session.data.photo = value;
                    session.index++;
                }
            } else {
                if (!value && !field.optional) {
                    bot.sendMessage(chatId, `Поле обязательно: ${field.label}`);
                    return;
                }
                // basic validation
                if (field.type === 'choice' && value) {
                    if (!field.choices.includes(value)) {
                        bot.sendMessage(chatId, `Неверный выбор. ${field.label}: ${field.choices.join('/')}`);
                        return;
                    }
                }
                session.data[field.key] = value;
                session.index++;
            }
            if (session.index >= ADMIN_FIELDS.length) {
                // finished
                // append to new-cards.json
                try {
                    const arr = JSON.parse(fs.readFileSync(NEW_CARDS_PATH, 'utf8') || '[]');
                    arr.push(session.data);
                    fs.writeFileSync(NEW_CARDS_PATH, JSON.stringify(arr, null, 2));
                    bot.sendMessage(chatId, 'Карточка добавлена в new-cards.json. Хотите сейчас сгенерировать открытку?', {
                        reply_markup: {
                            inline_keyboard: [[{ text: 'Сгенерировать и задеплоить', callback_data: 'GENERATE_AND_DEPLOY' }]]
                        }
                    });
                } catch (e) {
                    console.error('Failed to write new-cards.json', e);
                    bot.sendMessage(chatId, 'Ошибка при сохранении карточки.');
                }
                delete sessions[chatId];
                return;
            }
            const next = ADMIN_FIELDS[session.index];
            let prompt2 = `Введите: ${next.label}`;
            if (next.type === 'choice') prompt2 += ` (${next.choices.join('/')})`;
            bot.sendMessage(chatId, prompt2);
            return;
        }

        // admin general messages forwarded to owner as well
        const adminMessage = `🔔 Сообщение от админа:\n\n${userMessage}`;
        bot.sendMessage(adminChatId, adminMessage);
        return;
    }

    // Regular user flow: forward to admin and acknowledge
    if (chatId.toString() !== adminChatId) {
        const adminMessage = `🔔 Новое сообщение от клиента:\n\nПользователь: ${userName}\nID: ${userId}\nСообщение: ${userMessage}`;
        bot.sendMessage(adminChatId, adminMessage)
            .then(() => bot.sendMessage(chatId, 'Спасибо за заявку! Открытка уже в разработке... Наши менеджеры свяжутся с вами в ближайшее время.'))
            .catch((error) => {
                console.error('Ошибка при отправке администратору:', error);
                bot.sendMessage(chatId, 'Произошла ошибка при обработке заявки. Пожалуйста, попробуйте позже.');
            });
        return;
    }
});

    // Handle inline button presses (Generate and deploy)
    bot.on('callback_query', async (callbackQuery) => {
        const msg = callbackQuery.message;
        const chatId = msg.chat.id;
        const data = callbackQuery.data;
        console.log('callback_query', data);

        if (chatId.toString() !== adminChatId) {
            bot.answerCallbackQuery(callbackQuery.id, { text: 'Нет доступа' });
            return;
        }

        if (data === 'GENERATE_AND_DEPLOY') {
            bot.answerCallbackQuery(callbackQuery.id, { text: 'Запускаю сборку и деплой. Это может занять некоторое время...' });

            if (deployRunning) {
                bot.sendMessage(chatId, 'Деплой уже запущен. Пожалуйста, дождитесь окончания текущей операции.');
                return;
            }

            deployRunning = true;
            bot.sendMessage(chatId, 'Начинаю: npm run deploy:remote');

            try {
                const { execFile } = require('child_process');
                const nodePath = process.execPath;
                const script = path.resolve(__dirname, 'scripts', 'run-deploy.js');
                const child = execFile(nodePath, [script], { cwd: process.cwd(), env: process.env });

                child.stdout.on('data', (chunk) => {
                    const text = chunk.toString();
                    text.split(/\r?\n/).forEach((line) => { if (line) bufferLog('out', line, chatId); });
                });

                child.stderr.on('data', (chunk) => {
                    const text = chunk.toString();
                    text.split(/\r?\n/).forEach((line) => { if (line) bufferLog('err', line, chatId); });
                });

                child.on('close', (code) => {
                    deployRunning = false;
                    flushLogs(chatId);
                    safeSend(chatId, `Деплой завершён с кодом ${code}`);
                });

                child.on('error', (err) => {
                    deployRunning = false;
                    console.error('Deploy spawn error', err);
                    bot.sendMessage(chatId, `Ошибка при запуске деплоя: ${err.message}`);
                });
            } catch (e) {
                deployRunning = false;
                console.error(e);
                bot.sendMessage(chatId, `Не удалось запустить деплой: ${e.message}`);
            }
        }
    });
