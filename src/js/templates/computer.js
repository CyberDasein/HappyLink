export default function initComputer(cardData) {
    const { name, message, photo, dateStr } = cardData;

    // Преобразуем строку даты в объект Date
    const birthDate = new Date(dateStr);

    const formattedDate = formatDateToDDMMYYYY(birthDate);
    document.querySelector(".date").textContent = formattedDate
    // Вычисляем возраст
    const age = calculateAge(birthDate);
    document.querySelector(".years").textContent = age + " " + getDeclensionOfYear(age)

    const calculatedAge = formatAge(birthDate)
    document.querySelector(".info").textContent = calculatedAge

    const heartButtons = document.querySelectorAll('.heartBtn');
    if (heartButtons) {
        heartButtons.forEach((el) => {
            el.addEventListener('click', function (e) {
                const rect = this.getBoundingClientRect();
                const parentElement = this.parentElement;
                const heartCount = Math.floor(Math.random() * 3) + 5;

                for (let i = 0; i < heartCount; i++) {
                    const heart = document.createElement('div');
                    heart.className = 'heart-animated';

                    const startX = (Math.random() - 0.5) * rect.width;
                    const startY = (Math.random() - 0.5) * rect.height;
                    const offsetX = (Math.random() - 0.5) * 80;

                    heart.style.setProperty('--start-x', startX + 'px');
                    heart.style.setProperty('--start-y', startY + 'px');
                    heart.style.setProperty('--offset-x', offsetX + 'px');

                    heart.style.right = 0 + 'px';
                    heart.style.top = -rect.height + 'px';

                    parentElement.appendChild(heart);

                    heart.addEventListener('animationend', () => {
                        heart.remove();
                    });
                }
            });
        });
    }
    const baloon1 = document.querySelector('.baloon-one');
    const dialogCloseBtn = document.querySelector('.js-close-dialog')
    const dialogOpenBtn = document.querySelector('.js-open-dialog')
    const dialogLayout = document.querySelector('.dialog-layout')

    if (baloon1) {
        baloon1.addEventListener('animationend', () => {
            setTimeout(() => {
                document.querySelector('.baloons').style.zIndex = -1;
                dialogOpenBtn.classList.add("animated")
            }, 1500);
        });
    }

    dialogCloseBtn.addEventListener('click', () => {
        dialogLayout.classList.remove('dialog-layout--active')
    })
    dialogOpenBtn.addEventListener('click', () => {
        dialogLayout.classList.add('dialog-layout--active')
    })
}

/**
 * Возвращает слово "год", "года" или "лет" в зависимости от числа
 * @param {number} count - Число, от которого зависит форма слова
 * @returns {string} - Слово "год", "года" или "лет"
 */
function getDeclensionOfYear(count) {
    // Приводим к положительному числу и берём последние две цифры
    const num = Math.abs(count) % 100;
    // Берём последнюю цифру
    const lastDigit = num % 10;

    if (lastDigit === 1 && num !== 11) {
        return 'год'; // 1, 21, 31, 41, 51, 61, 71, 81, 91
    } else if (lastDigit >= 2 && lastDigit <= 4 && (num < 10 || num > 20)) {
        return 'года'; // 2, 3, 4, 22, 23, 24, 32, 33, 34...
    } else {
        return 'лет'; // 5, 6, 7, 8, 9, 10, 11, 12... 20, 25, 26...
    }
}

/**
 * Форматирует дату в "DD/MM/YYYY"
 * @param {Date} date - Объект Date
 * @returns {string} - Отформатированная строка даты, например "29/12/1996"
 */
function formatDateToDDMMYYYY(date) {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0'); // Месяцы в JS считаются с 0
    const year = date.getFullYear();

    return `${day}/${month}/${year}`;
}
function calculateAge(birthDate) {
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age--;
    }
    return parseInt(age);
}

/**
 * Вычисляет разницу между двумя датами в годах, месяцах и днях
 * @param {Date} startDate - Начальная дата (например, дата рождения)
 * @param {Date} endDate - Конечная дата (например, сегодня)
 * @returns {Object} - Объект с полями years, months, days
 */
function calculateAgeDetailed(startDate, endDate = new Date()) {
    let years = endDate.getFullYear() - startDate.getFullYear();
    let months = endDate.getMonth() - startDate.getMonth();
    let days = endDate.getDate() - startDate.getDate();

    // Если дней отрицательно, займём один месяц
    if (days < 0) {
        months--;
        // Получаем количество дней в предыдущем месяце endDate
        const previousMonth = new Date(endDate.getFullYear(), endDate.getMonth(), 0);
        days += previousMonth.getDate();
    }

    // Если месяцев отрицательно, займём один год
    if (months < 0) {
        years--;
        months += 12;
    }

    return { years, months, days };
}

/**
 * Форматирует возраст в строку "XX лет: YY месяцев: ZZ дней"
 * @param {Date} birthDate - Дата рождения
 * @param {Date} [referenceDate] - Дата, относительно которой считать (по умолчанию - сегодня)
 * @returns {string} - Строка с возрастом
 */
function formatAge(birthDate, referenceDate = new Date()) {
    const age = calculateAgeDetailed(birthDate, referenceDate);

    return `${age.years} ${getDeclensionOfYear(age.years)}: ${age.months} ${getDeclensionOfMonth(age.months)}: ${age.days} ${getDeclensionOfDay(age.days)}`;
}

/**
 * Возвращает слово "месяц", "месяца", "месяцев" в зависимости от числа
 */
function getDeclensionOfMonth(count) {
    const num = Math.abs(count) % 100;
    const lastDigit = num % 10;
    if (lastDigit === 1 && num !== 11) return 'месяц';
    if (lastDigit >= 2 && lastDigit <= 4 && (num < 10 || num > 20)) return 'месяца';
    return 'месяцев';
}

/**
 * Возвращает слово "день", "дня", "дней" в зависимости от числа
 */
function getDeclensionOfDay(count) {
    const num = Math.abs(count) % 100;
    const lastDigit = num % 10;
    if (lastDigit === 1 && num !== 11) return 'день';
    if (lastDigit >= 2 && lastDigit <= 4 && (num < 10 || num > 20)) return 'дня';
    return 'дней';
}
