export default function initTerminal(cardData) {
    const { name, message, photo, dateStr } = cardData;

    // Преобразуем строку даты в объект Date
    const birthDate = new Date(dateStr);

    // Форматируем дату: "14 АПРЕЛЯ 2025"
    const formattedDate = formatDate(birthDate);

    // Вычисляем возраст
    const age = calculateAge(birthDate);

    // Находим элементы и подставляем значения
    document.querySelector('.terminal-list__top p:nth-child(2)').textContent = `НОМЕР: #BIRTHDAY_${age}`;
    document.querySelector('.terminal-list__top p:nth-child(3)').textContent = `ДАТА: ${formattedDate}`;
    document.querySelector('.terminal-list__top p:nth-child(4)').textContent = `КОЛИЧЕСТВО ЛЕТ: ${age}`;
}

// Форматирует дату в "14 АПРЕЛЯ 2025"
function formatDate(date) {
    const day = date.getDate();
    const month = date.toLocaleString('ru-RU', { month: 'long' }).toUpperCase();
    const year = date.getFullYear();
    return `${day} ${month} ${year}`;
}

// Вычисляет возраст
function calculateAge(birthDate) {
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age--;
    }
    return age;
}
