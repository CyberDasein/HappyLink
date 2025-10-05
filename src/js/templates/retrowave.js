export default function initRetrowave() {
  // Stars Position
  let topp = document.getElementById("top");
  function setStars(numS) {
    for (let i = 0; i < numS; i++) {
      let stars = document.createElement("div");
      stars.setAttribute("class", "stars");
      stars.style.left = 100 * Math.random() + "%";
      stars.style.top = 55 * Math.random() + "%";
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
}
