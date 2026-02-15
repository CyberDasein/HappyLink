require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');

const token = process.env.T_BOT_TOKEN;

// Его можно получить, например, через @userinfobot
const adminChatId = '438708073';

const bot = new TelegramBot(token, { polling: true });

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
    }
});
