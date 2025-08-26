export default class AgeTimer {
    constructor(birthDate, elementId = 'ageTimer') {
        this.birthDate = new Date(birthDate);
        this.element = document.getElementById(elementId);
        this.yearsElement = document.getElementById('years');
        this.monthsElement = document.getElementById('months');
        this.daysElement = document.getElementById('days');
        this.yearsTextElement = document.getElementById('yearsText');
        this.monthsTextElement = document.getElementById('monthsText');
        this.daysTextElement = document.getElementById('daysText');

        this.init();
    }

    // Функции для правильного склонения
    getPluralText(count, type) {
        const forms = {
            'year': ['Год', 'Года', 'Лет'],
            'month': ['Месяц', 'Месяца', 'Месяцев'],
            'day': ['День', 'Дня', 'Дней']
        };

        const cases = [2, 0, 1, 1, 1, 2];
        const titles = forms[type] || ['единица', 'единицы', 'единиц'];
        const index = (count % 100 > 4 && count % 100 < 20) ? 2 : cases[Math.min(count % 10, 5)];

        return titles[index];
    }

    // Расчет возраста
    calculateAge() {
        const now = new Date();
        let years = now.getFullYear() - this.birthDate.getFullYear();
        let months = now.getMonth() - this.birthDate.getMonth();
        let days = now.getDate() - this.birthDate.getDate();

        // Корректировка значений
        if (days < 0) {
            months--;
            // Получаем количество дней в предыдущем месяце
            const prevMonth = new Date(now.getFullYear(), now.getMonth(), 0);
            days += prevMonth.getDate();
        }

        if (months < 0) {
            years--;
            months += 12;
        }

        return { years, months, days };
    }

    // Обновление отображения
    updateDisplay() {
        const age = this.calculateAge();

        this.yearsElement.textContent = age.years;
        this.monthsElement.textContent = age.months;
        this.daysElement.textContent = age.days;

        this.yearsTextElement.textContent = this.getPluralText(age.years, 'year');
        this.monthsTextElement.textContent = this.getPluralText(age.months, 'month');
        this.daysTextElement.textContent = this.getPluralText(age.days, 'day');
    }

    // Инициализация таймера
    init() {
        // Проверка корректности даты рождения
        if (isNaN(this.birthDate.getTime())) {
            console.error('Некорректная дата рождения');
            return;
        }

        // Первое обновление
        this.updateDisplay();

        // Обновление каждую секунду
        this.interval = setInterval(() => {
            this.updateDisplay();
        }, 1000);
    }

    // Остановка таймера
    stop() {
        if (this.interval) {
            clearInterval(this.interval);
        }
    }

    // Установка новой даты рождения
    setBirthDate(newBirthDate) {
        this.birthDate = new Date(newBirthDate);
        if (isNaN(this.birthDate.getTime())) {
            console.error('Некорректная дата рождения');
            return;
        }
        this.updateDisplay();
    }
}

// Использование:
// Укажите дату рождения в формате: 'YYYY-MM-DD' или 'YYYY/MM/DD'
//const ageTimer = new AgeTimer('1990-05-15'); // Пример даты рождения

// Для остановки таймера:
// ageTimer.stop();

// Для изменения даты рождения:
// ageTimer.setBirthDate('1985-12-25');
