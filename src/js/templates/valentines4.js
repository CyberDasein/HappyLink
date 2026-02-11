export default function initValentines1(cardData) {
    const container = document.getElementById('envelopeContainer');

    // Преобразование даты
    const originalDate = new Date(cardData.dateStr);
    const day = String(originalDate.getDate()).padStart(2, '0');
    const month = String(originalDate.getMonth() + 1).padStart(2, '0'); // Месяцы начинаются с 0
    const year = String(originalDate.getFullYear()).toString().slice(-2);
    const formattedDate = `с ${day}.${month}.${year}`;
    document.querySelector('.heart-date').textContent = formattedDate;

    const pastDate = new Date(cardData.dateStr);
    const currentDate = new Date();

    pastDate.setHours(0, 0, 0, 0);
    currentDate.setHours(0, 0, 0, 0);

    const diffTime = currentDate - pastDate;
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));


    document.querySelector('.heart-days strong').textContent = diffDays;

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
