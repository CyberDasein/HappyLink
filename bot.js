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
const welcomeMessage = `🎉 Привет! Давай создадим твою уникальную цифровую открытку 💌\n\nОтправь мне в одном сообщении:\n\n1. Какой стиль тебе нравится? (выбери номер на картинках)\n2. Имя получателя подарка\n3. От кого открытка\n4. Дата, с которой начинать отсчет дней любви (например, дата знакомства)\n5. Текст сообщения для открытки\n6. Фото, которое хочешь добавить в открытку ❤️\n\n
Открытка будет готова в течение 15 минут.
Каждая открытка стоит 499р, действует постоплата.
По вопросам поддержки писать на @citizen66`;

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

// Хранение соответствий username -> chatId
const userChats = new Map();

// Обновляем данные о юзерах при каждом сообщении
function updateUserChatData(msg) {
    if (msg.from.username) {
        const username = msg.from.username.toLowerCase();
        userChats.set(username, msg.chat.id);
    }
}

// Обработка команды /send_to
bot.onText(/\/send_to\s+(@[\w]+)\s+(.+)$/i, (msg, match) => {
    if (msg.chat.id.toString() !== adminChatId) {
        bot.sendMessage(msg.chat.id, 'У вас нет прав для выполнения этой команды');
        return;
    }
    const targetUsername = match[1].substring(1).toLowerCase();
    const messageText = match[2].replace(/\\n/g, '\n'); // Заменяем \n на фактический перенос строки
    const targetChatId = userChats.get(targetUsername);
    if (!targetChatId) {
        bot.sendMessage(msg.chat.id, `Пользователь ${match[1]} не найден в базе данных. Убедитесь, что он уже писал боту.`);
        return;
    }
    bot.sendMessage(targetChatId, messageText, { parse_mode: 'HTML' })
        .then(() => bot.sendMessage(msg.chat.id, `Сообщение успешно отправлено пользователю ${match[1]}`))
        .catch(error => bot.sendMessage(msg.chat.id, `Ошибка при отправке сообщения пользователю ${match[1]}: ${error.message}`));
});

// Обработка всех сообщений от пользователей (текст и фото)
bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const userName = msg.from.username ? `@${msg.from.username}` : `ID: ${userId}`;
    const caption = msg.caption || 'Без подписи'; 
    
    // Обновляем данные о чате пользователя
    updateUserChatData(msg);
    
    // Проверяем, является ли сообщение командой /start
    if (msg.text === '/start') {
        return; // Не отправляем повторное уведомление при старте
    }
    
    let userContent = '';
    let photoUrl = null;

    if (msg.text) {
        userContent = `Текст: ${msg.text}`;
    } else if (msg.photo) {
        const fileId = msg.photo[msg.photo.length - 1].file_id;

        // Получаем URL фото
        bot.getFile(fileId).then((fileInfo) => {
            photoUrl = `https://api.telegram.org/file/bot${token}/${fileInfo.file_path}`;
            
            userContent = `Фото: ${photoUrl} Подпись: ${caption}`;

            const adminMessage = `🔔 Новое сообщение от клиента:\n\nПользователь: ${userName}\nID: ${userId}\n${userContent}`;

            return bot.sendMessage(adminChatId, adminMessage);
        }).then(() => {
            bot.sendMessage(chatId, 'Спасибо за заявку! Открытка уже в разработке... Наши менеджеры свяжутся с вами в ближайшее время.');
        }).catch((error) => {
            console.error('Ошибка при получении файла:', error);
            bot.sendMessage(chatId, 'Произошла ошибка при обработке фото. Пожалуйста, попробуйте отправить снова.');
        });

        return; // Прерываем основный поток, чтобы не дублировать отправку
    }

    // Если это не фото — отправляем обычное текстовое сообщение
    if (chatId.toString() !== adminChatId && !msg.photo) {
        const adminMessage = `🔔 Новое сообщение от клиента:\n\nПользователь: ${userName}\nID: ${userId}\n${userContent}`;

        bot.sendMessage(adminChatId, adminMessage)
            .then(() => {
                bot.sendMessage(chatId, 'Спасибо за заявку! Открытка уже в разработке... Наши менеджеры свяжутся с вами в ближайшее время.');
            })
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
