import AgeTimer from './Timer.js';

document.addEventListener('DOMContentLoaded', () => {
    if (!window.CARD_DATA_PLACEHOLDER) {
        throw new Error("not found CARD DATA")
    }
    if (window.CARD_DATA_PLACEHOLDER.template === "jumble") {
        const { name, message, photo, dateStr } = window.CARD_DATA_PLACEHOLDER;
      
        if (dateStr) {
            new AgeTimer(dateStr);
        }

        const heartButtons = document.querySelectorAll('.heartBtn')
        if (heartButtons) {
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
        }
        const baloon1 = document.querySelector('.baloon-one')
        if (baloon1) {
            baloon1.addEventListener('animationend', () => {
                document.querySelector('.baloons').style.zIndex = -1
                heartButtons[0].click()
            });
        }
    }
    if (window.CARD_DATA_PLACEHOLDER.template === "retrowave") {
        // Stars Position
        let topp = document.getElementById("top")
        function setStars(numS) {
            for (let i = 0; i < numS; i++) {
                let stars = document.createElement("div")
                stars.setAttribute("class", "stars")
                stars.style.left = 100 * Math.random() + "%"
                stars.style.top = 55 * Math.random() + "%"
                topp.appendChild(stars)
            }
        }
        setStars(250)
        // Sun Animation
        let sunset = document.getElementById("sun");
        function synthSun(nmb) {
            for (let i = 0; i < nmb * 2; i++) {
                let sunin = document.createElement("div")
                sunin.setAttribute("class", "sun")
                sunin.style.animationDelay = -.5 * i++ + "s"
                sunset.appendChild(sunin)
            }
        }
        synthSun(8)
    }
});
