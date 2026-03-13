require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');

const token = process.env.T_BOT_TOKEN;

// Его можно получить, например, через @userinfobot
const adminChatId = '438708073';

const bot = new TelegramBot(token, { polling: true });

const fs = require('fs');
const path = require('path');
// child_process functions are required where needed

// In-memory sessions for admin form
const sessions = {};

// Track pending deploys (chatId -> original path)
const pendingDeploys = {};

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

// Some environments may have non-string values in process.env which causes
// child_process.spawn/execFile to throw EINVAL on Windows. Make a safe copy
// with all values stringified.
function makeSafeEnv() {
    const out = {};
    const src = process.env || {};
    Object.keys(src).forEach((k) => {
        const v = src[k];
        out[k] = v === undefined || v === null ? '' : String(v);
    });
    return out;
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

function addCardToNewCards(card) {
    // atomic write: write tmp then rename
    const tmp = NEW_CARDS_PATH + '.tmp';
    try {
        let arr = [];
        if (fs.existsSync(NEW_CARDS_PATH)) {
            const raw = fs.readFileSync(NEW_CARDS_PATH, 'utf8') || '[]';
            arr = JSON.parse(raw);
        }
        arr.push(card);
        fs.writeFileSync(tmp, JSON.stringify(arr, null, 2));
        fs.renameSync(tmp, NEW_CARDS_PATH);
    } catch (err) {
        // cleanup tmp
        try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch (e) {}
        throw err;
    }
}

function validateCard(card) {
    const required = ['name','sender_rp','sender_ip','message','template','path','gender','dateStr'];
    for (const k of required) {
        if (!card.hasOwnProperty(k) || card[k] === undefined || card[k] === null) return `Отсутствует поле ${k}`;
    }
    if (typeof card.path !== 'string' || !/^[a-z0-9A-Z-_]+$/.test(card.path)) return 'Поле path должно содержать только буквы, цифры, дефис или подчёркивание (без пробелов)';
    if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(card.dateStr)) return 'Поле dateStr должно иметь формат YYYY-MM-DD';
    if (!['man','woman'].includes(String(card.gender))) return 'Поле gender должно быть man или woman';
    // template is expected to match an existing template folder
    const tplDir = path.join(__dirname, 'src', 'templates', String(card.template));
    if (!fs.existsSync(tplDir)) return `Шаблон ${card.template} не найден (ожидается папка ${tplDir})`;
    return null;
}

// Generate a short random path matching webpack's style (keeps letters and appends random chars)
function generateRandomPathForCard(pathInput) {
    const chars = 'abcdefghijklmnopqrstuvwxyz123456789';
    let result = '';
    // mimic webpack: keep letters (both latin and cyrillic) from the provided path
    const namePart = String(pathInput).toLowerCase().replace(/[^a-zа-яё]/g, '');
    for (let i = 0; i < 9; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return namePart + '-' + result;
}

function runDeployAndReport(chatId) {
    if (deployRunning) {
        safeSend(chatId, 'Деплой уже запущен, дождитесь окончания текущего.');
        return;
    }
    deployRunning = true;
    const { execFile } = require('child_process');
    const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    // First, run the build so webpack processes new-cards.json -> cards.json and generates docs/
    safeSend(chatId, 'Запускаю сборку (npm run build)...');
    let buildChild;
    try {
        buildChild = execFile(npmCmd, ['run', 'build'], { cwd: process.cwd(), env: makeSafeEnv() });
    } catch (err) {
        // If execFile fails (some environments throw EINVAL), attempt a shell-backed spawn as fallback.
        console.error('Failed to spawn build process with execFile', err);
        try {
            const { spawn } = require('child_process');
            buildChild = spawn(npmCmd, ['run', 'build'], { cwd: process.cwd(), env: makeSafeEnv(), shell: true });
        } catch (err2) {
            deployRunning = false;
            console.error('Fallback spawn also failed', err2);
            // Dump a small env sample for debugging
            try {
                const keys = Object.keys(process.env).slice(0, 20);
                const sample = keys.map(k => ({ k, type: typeof process.env[k], val: String(process.env[k]).slice(0,40) }));
                console.error('Env sample (first 20):', sample);
            } catch (e) {}
            safeSend(chatId, `Ошибка при запуске сборки: ${err2 && err2.message ? err2.message : err2}`);
            return;
        }
    }

    buildChild.on('close', (buildCode) => {
        if (buildCode !== 0) {
            deployRunning = false;
            safeSend(chatId, `Сборка завершилась с кодом ${buildCode}. Отмена деплоя.`);
            return;
        }

        // Build succeeded — run deploy script
        safeSend(chatId, 'Сборка завершена. Запускаю деплой...');
        const nodePath = process.execPath;
        const script = path.resolve(__dirname, 'scripts', 'run-deploy.js');
        let child;
        try {
            child = execFile(nodePath, [script], { cwd: process.cwd(), env: makeSafeEnv() });
        } catch (err) {
            deployRunning = false;
            console.error('Failed to spawn deploy process', err);
            safeSend(chatId, `Ошибка при запуске деплоя: ${err && err.message ? err.message : err}`);
            return;
        }

        child.on('close', (code) => {
            deployRunning = false;
            // only inform about completion and provide GitHub Pages link (if available)
            if (code === 0) {
                try {
                    const cardsPath = path.resolve(__dirname, 'data', 'cards.json');
                    if (fs.existsSync(cardsPath)) {
                        const cards = JSON.parse(fs.readFileSync(cardsPath, 'utf8') || '[]');
                        let card = null;
                        const originalPath = pendingDeploys[chatId];
                        if (originalPath) card = cards.find(c => c.path === originalPath) || null;
                        if (!card && cards.length) card = cards[cards.length - 1];
                        if (card) {
                            const gen = card.generatedPath || card.path;
                            const repoUrlRaw = process.env.TARGET_REPO_URL || '';
                            const cleaned = repoUrlRaw.replace(/https?:\/\/[^@]+@/, 'https://');
                            const m = cleaned.match(/github\.com[:\/]+([^\/]+)\/([^\.]+)(?:\.git)?/i);
                            let owner = null, repo = null;
                            if (m) { owner = m[1]; repo = m[2]; }
                            const branch = process.env.TARGET_BRANCH || 'deploy';
                            const pagesUrl = owner && repo ? `https://${owner}.github.io/${repo}/${gen}/` : null;
                            if (pagesUrl) {
                                safeSend(chatId, `Деплой завершён. Ссылка (GitHub Pages): ${pagesUrl}`);
                            } else {
                                safeSend(chatId, `Деплой завершён, но не удалось сформировать GitHub Pages ссылку.`);
                            }
                        } else {
                            safeSend(chatId, 'Деплой завершён, но не удалось найти карточку в cards.json.');
                        }
                    } else {
                        safeSend(chatId, 'Деплой завершён, но cards.json не найден.');
                    }
                } catch (e) {
                    console.error('Error preparing post-deploy link', e);
                    safeSend(chatId, `Деплой завершён, но ошибка при формировании ссылки: ${e && e.message ? e.message : e}`);
                }
            } else {
                safeSend(chatId, `Деплой завершён с кодом ${code}`);
            }
        });

        child.on('error', (err) => {
            deployRunning = false;
            console.error('Deploy spawn error', err);
            safeSend(chatId, `Ошибка при запуске деплоя: ${err && err.message ? err.message : err}`);
        });
    });

    // NOTE: deploy child handlers are attached inside the buildChild.on('close') scope above
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

    // --- Admin create flow: handle /create and session answers ---
    if (chatId.toString() === adminChatId) {
        // start creation
        if (msg.text && msg.text.toLowerCase() === '/create') {
            sessions[chatId] = { index: 0, data: {} };
            const f = ADMIN_FIELDS[0];
            let prompt = `Введите: ${f.label}`;
            if (f.type === 'choice') prompt += ` (${f.choices.join('/')})`;
            safeSend(chatId, `Начинаем создание карточки. ${prompt}`);
            return;
        }

        const session = sessions[chatId];
        if (session) {
            const field = ADMIN_FIELDS[session.index];

            // PHOTO step: accept uploaded photo or URL
            if (field.type === 'photo') {
                // photo file
                if (msg.photo && msg.photo.length) {
                    const fileId = msg.photo[msg.photo.length - 1].file_id;
                    (async () => {
                        try {
                            const fileInfo = await bot.getFile(fileId);
                            const filePath = fileInfo.file_path;
                            const ext = path.extname(filePath) || '.jpg';
                            const templateName = session.data.template || 'default';
                            const destDir = path.join(__dirname, 'src', 'templates', templateName, 'images');
                            fs.mkdirSync(destDir, { recursive: true });
                            const filename = `${Date.now()}-${Math.random().toString(36).slice(2,8)}${ext}`;
                            const outPath = path.join(destDir, filename);
                            const https = require('https');
                            const url = `https://api.telegram.org/file/bot${token}/${filePath}`;
                            const ws = fs.createWriteStream(outPath);
                            https.get(url, (res) => {
                                res.pipe(ws);
                                ws.on('finish', () => {
                                    ws.close();
                                    // Save local relative path so prepare-data.js will upload it in prebuild
                                    const localRel = path.join('src', 'templates', templateName, 'images', filename).replace(/\\/g, '/');
                                    session.data.photo = `./${localRel}`;
                                    safeSend(chatId, `Фото сохранено локально: ${session.data.photo}`);
                                    session.index++;
                                    // continue to next step or finish
                                    if (session.index >= ADMIN_FIELDS.length) {
                                        try {
                                            const v = validateCard(session.data);
                                            if (v) {
                                                safeSend(chatId, `Ошибка валидации карточки: ${v}`);
                                            } else {
                                            // ensure generatedPath exists so webpack will not overwrite it
                                            if (!session.data.generatedPath) session.data.generatedPath = generateRandomPathForCard(session.data.path);
                                            addCardToNewCards(session.data);
                                                pendingDeploys[chatId] = session.data.path;
                                                safeSend(chatId, 'Карточка добавлена в new-cards.json. Запускаю сборку и деплой (deploy:remote)...');
                                                runDeployAndReport(chatId);
                                            }
                                        } catch (e) {
                                            console.error('Failed to write new-cards.json', e && e.stack ? e.stack : e);
                                            safeSend(chatId, `Ошибка при сохранении карточки: ${e && e.message ? e.message : e}`);
                                        }
                                        delete sessions[chatId];
                                        return;
                                    }
                                    const next = ADMIN_FIELDS[session.index];
                                    let prompt2 = `Введите: ${next.label}`;
                                    if (next.type === 'choice') prompt2 += ` (${next.choices.join('/')})`;
                                    safeSend(chatId, prompt2);
                                });
                            }).on('error', (err) => {
                                console.error('Download photo error', err);
                                safeSend(chatId, 'Ошибка при скачивании фото. Попробуйте ещё раз.');
                            });
                        } catch (e) {
                            console.error('Error processing photo', e);
                            safeSend(chatId, 'Ошибка при обработке фото.');
                        }
                    })();
                    return;
                }

                // photo as URL typed
                if (msg.text && /^https?:\/\//i.test(msg.text)) {
                    const potential = msg.text.trim();
                    // If URL already points to Yandex storage, accept as-is
                    if (/storage\.yandexcloud\.net/i.test(potential)) {
                        session.data.photo = potential;
                        session.index++;
                    } else {
                        // Download remote URL into template images folder so prepare-data will pick it up
                        (async () => {
                            try {
                                const templateName = session.data.template || 'default';
                                const destDir = path.join(__dirname, 'src', 'templates', templateName, 'images');
                                fs.mkdirSync(destDir, { recursive: true });
                                const ext = path.extname(potential).split('?')[0] || '.jpg';
                                const filename = `${Date.now()}-${Math.random().toString(36).slice(2,8)}${ext}`;
                                const outPath = path.join(destDir, filename);
                                const urlLib = require('url');
                                const parsed = urlLib.parse(potential);
                                const geter = parsed.protocol === 'http:' ? require('http') : require('https');
                                await new Promise((resolve, reject) => {
                                    const req = geter.get(potential, (res) => {
                                        if (res.statusCode && res.statusCode >= 400) return reject(new Error('Failed to download photo: ' + res.statusCode));
                                        const ws2 = fs.createWriteStream(outPath);
                                        res.pipe(ws2);
                                        ws2.on('finish', () => { ws2.close(); resolve(); });
                                        ws2.on('error', reject);
                                    });
                                    req.on('error', reject);
                                });
                                // set local relative path for prepare-data
                                const localRel = path.join('src', 'templates', templateName, 'images', filename).replace(/\\/g, '/');
                                session.data.photo = `./${localRel}`;
                                session.index++;
                                const next = ADMIN_FIELDS[session.index];
                                let prompt2 = `Введите: ${next.label}`;
                                if (next.type === 'choice') prompt2 += ` (${next.choices.join('/')})`;
                                safeSend(chatId, `Фото скачано локально: ${session.data.photo}`);
                                safeSend(chatId, prompt2);
                            } catch (e) {
                                console.error('Error downloading remote photo URL', e);
                                safeSend(chatId, 'Ошибка при загрузке указанного URL. Проверьте ссылку и попробуйте снова.');
                            }
                        })();
                        return; // wait for async download
                    }
                } else if (!msg.text || msg.text.trim() === '') {
                    // empty allowed
                    session.data.photo = '';
                    session.index++;
                } else {
                    safeSend(chatId, `Ожидается фото (пришлите изображение или URL) для: ${field.label}`);
                    return;
                }
            } else {
                // regular text/choice/date field
                const value = (msg.text || '').trim();
                if (!value && !field.optional) {
                    safeSend(chatId, `Поле обязательно: ${field.label}`);
                    return;
                }
                if (field.type === 'choice' && value) {
                    if (!field.choices.includes(value)) {
                        safeSend(chatId, `Неверный выбор. ${field.label}: ${field.choices.join('/')}`);
                        return;
                    }
                }
                session.data[field.key] = value;
                session.index++;
            }

            // If we advanced to end (non-photo branch), handle finish
            if (session && session.index >= ADMIN_FIELDS.length) {
                try {
                    const v = validateCard(session.data);
                    if (v) {
                        safeSend(chatId, `Ошибка валидации карточки: ${v}`);
                    } else {
                        if (!session.data.generatedPath) session.data.generatedPath = generateRandomPathForCard(session.data.path);
                        addCardToNewCards(session.data);
                        pendingDeploys[chatId] = session.data.path;
                        safeSend(chatId, 'Карточка добавлена в new-cards.json. Запускаю сборку и деплой (deploy:remote)...');
                        runDeployAndReport(chatId);
                    }
                } catch (e) {
                    console.error('Failed to write new-cards.json', e && e.stack ? e.stack : e);
                    safeSend(chatId, `Ошибка при сохранении карточки: ${e && e.message ? e.message : e}`);
                }
                delete sessions[chatId];
                return;
            }

            // prompt next
            const next = ADMIN_FIELDS[session.index];
            let promptNext = `Введите: ${next.label}`;
            if (next.type === 'choice') promptNext += ` (${next.choices.join('/')})`;
            safeSend(chatId, promptNext);
            return;
        }
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

// Admin-only deploy command: /deploy
bot.onText(/\/deploy\s*(.*)?/i, (msg, match) => {
    const chatId = msg.chat.id;
    if (chatId.toString() !== adminChatId) {
        safeSend(chatId, 'У вас нет прав для запуска деплоя');
        return;
    }
    const arg = (match && match[1]) ? match[1].trim() : '';
    // optional: allow passing target repo or branch like: /deploy target=... branch=...
    safeSend(chatId, 'Запускаю деплой: npm run deploy:remote (это может занять несколько минут)');
    runDeployAndReport(chatId);
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
                const child = execFile(nodePath, [script], { cwd: process.cwd(), env: makeSafeEnv() });

                child.stdout.on('data', (chunk) => {
                    const text = chunk.toString();
                    text.split(/\r?\n/).forEach((line) => { if (line) bufferLog('out', line, chatId); });
                });

                child.on('close', (code) => {
                    deployRunning = false;
                    if (code === 0) {
                        try {
                            const cardsPath = path.resolve(__dirname, 'data', 'cards.json');
                            if (fs.existsSync(cardsPath)) {
                                const cards = JSON.parse(fs.readFileSync(cardsPath, 'utf8') || '[]');
                                if (cards.length) {
                                    let card = null;
                                    const originalPath = pendingDeploys[chatId];
                                    if (originalPath) {
                                        card = cards.find(c => c.path === originalPath) || null;
                                    }
                                    if (!card) card = cards[cards.length - 1];
                                    const gen = card.generatedPath || card.path || null;
                                    if (gen) {
                                        const repoUrlRaw = process.env.TARGET_REPO_URL || '';
                                        const cleaned = repoUrlRaw.replace(/https?:\/\/[^@]+@/, 'https://');
                                        const m = cleaned.match(/github\.com[:\/]+([^\/]+)\/([^\.]+)(?:\.git)?/i);
                                        let owner = null, repo = null;
                                        if (m) { owner = m[1]; repo = m[2]; }
                                        const pagesUrl = owner && repo ? `https://${owner}.github.io/${repo}/${gen}/` : null;
                                        if (pagesUrl) {
                                            safeSend(chatId, `Деплой завершён. Ссылка (GitHub Pages): ${pagesUrl}`);
                                        } else {
                                            safeSend(chatId, `Деплой завершён, но не удалось сформировать GitHub Pages ссылку.`);
                                        }
                                    } else {
                                        safeSend(chatId, 'Деплой завершён, но не удалось определить путь сгенерированной открытки.');
                                    }
                                } else {
                                    safeSend(chatId, 'Деплой завершён, но в cards.json нет карточек.');
                                }
                            } else {
                                safeSend(chatId, 'Деплой завершён, но cards.json не найден.');
                            }
                        } catch (e) {
                            console.error('Error while preparing card URL', e);
                            safeSend(chatId, `Деплой завершён, но ошибка при попытке сформировать ссылку: ${e.message}`);
                        }
                    } else {
                        safeSend(chatId, `Деплой завершён с кодом ${code}`);
                    }
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
