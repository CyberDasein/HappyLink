export default function initValentines1(cardData) {
    const container = document.getElementById('envelopeContainer');

    // Создаем пузырьки
    for (let i = 0; i < 20; i++) {
        createBubble();
    }

    // Автоматический запуск анимации через 1 секунду
    setTimeout(() => {
        container.classList.add('opened');
    }, 2000);

    function createBubble() {
        const bubble = document.createElement('div');
        bubble.classList.add('bubble');

        // Случайные позиции
        const startX = Math.random() * window.innerWidth;
        const startY = window.innerHeight;

        bubble.style.left = `${startX}px`;
        bubble.style.top = `${startY}px`;

        // Случайные размеры
        const size = 20 + Math.random() * 20;
        bubble.style.width = `${size}px`;
        bubble.style.height = `${size}px`;

        // Случайная задержка
        bubble.style.animationDelay = `${Math.random() * 5}s`;

        document.body.appendChild(bubble);

        //Удаляем пузырек после завершения анимации
        setTimeout(() => {
            bubble.remove();
        }, 10000);
    }
}
