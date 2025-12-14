export default function initComputer(cardData) {
    const { name, message, photo, dateStr } = cardData;

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
    if (baloon1) {
        baloon1.addEventListener('animationend', () => {
            setTimeout(() => {
                document.querySelector('.baloons').style.zIndex = -1;
                heartButtons[0].click();
            }, 1500);
        });
    }
}
