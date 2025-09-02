import '../scss/main.scss';
import AgeTimer from './Timer';

document.addEventListener('DOMContentLoaded', () => {
    if (window.CARD_DATA_PLACEHOLDER) {
        const { name, message, photo, dateStr } = window.CARD_DATA_PLACEHOLDER;

        console.log(window.CARD_DATA_PLACEHOLDER)
        const nameElement = document.getElementById("js-name")
        const messageElement = document.getElementById("js-message")
        const photoElement = document.getElementById("js-photo")

        nameElement.textContent = name
        messageElement.textContent = message
        photoElement.src = photo;
        photoElement.alt = `${name}`;
        const ageTimer = new AgeTimer(dateStr);

    } else {
        throw new Error("not found CARD DATA")
    }
    const heartButtons = document.querySelectorAll('.heartBtn')
    heartButtons.forEach((el) => {
        el.addEventListener('click', function (e) {
            // Получаем координаты кнопки
            const rect = this.getBoundingClientRect();
            const parentElement = this.parentElement;
            // Создаем 5-7 сердечек
            const heartCount = Math.floor(Math.random() * 3) + 5;

            for (let i = 0; i < heartCount; i++) {
                // Создаем элемент сердца
                const heart = document.createElement('div');
                heart.className = 'heart-animated';

                // Устанавливаем начальные координаты
                const startX = (Math.random() - 0.5) * rect.width;
                const startY = (Math.random() - 0.5) * rect.height;
                const offsetX = (Math.random() - 0.5) * 80;

                heart.style.setProperty('--start-x', startX + 'px');
                heart.style.setProperty('--start-y', startY + 'px');
                heart.style.setProperty('--offset-x', offsetX + 'px');

                // Позиционируем относительно кнопки
                heart.style.right = 0 + 'px';
                heart.style.top = -rect.height + 'px';

                parentElement.appendChild(heart);

                // Удаляем после анимации
                heart.addEventListener('animationend', () => {
                    heart.remove();
                });
            }
        });
    })

    document.querySelector('.baloon-one').addEventListener('animationend', () => {
        document.querySelector('.baloons').style.zIndex = -1
        heartButtons[0].click()
    });

});
