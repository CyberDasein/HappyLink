export default function initRetrowave(cardData) {

  const { name, message, photo, dateStr } = cardData;
  // Stars Position
  let topp = document.getElementById("top");
  function setStars(numS) {
    for (let i = 0; i < numS; i++) {
      let stars = document.createElement("div");
      stars.setAttribute("class", "stars");
      stars.style.left = 100 * Math.random() + "%";
      stars.style.top = 49 * Math.random() + "%";
      topp.appendChild(stars);
    }
  }
  setStars(250);

  // Sun Animation
  let sunset = document.getElementById("sun");
  function synthSun(nmb) {
    for (let i = 0; i < nmb * 2; i++) {
      let sunin = document.createElement("div");
      sunin.setAttribute("class", "sun");
      sunin.style.animationDelay = -.5 * i++ + "s";
      sunset.appendChild(sunin);
    }
  }
  synthSun(8);

  const birthDate = new Date(dateStr);
  const age = calculateAge(birthDate);
  // Форматируем дату: "14 АПРЕЛЯ 2025"
  const formattedDate = formatDate(birthDate);

  document.querySelector('#birth-year').textContent = `${age}`;
  document.querySelector('#date-str').textContent = `${formattedDate}`;
}

function formatDate(date) {
  const day = date.getDate();
  const month = date.toLocaleString('en-US', { month: 'short' }).toUpperCase();
  const year = date.getFullYear();
  const shortYear = year % 100;
  return `${day} ${month} ${shortYear}`;
}

function calculateAge(birthDate) {
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age--;
    }
    return age;
}
