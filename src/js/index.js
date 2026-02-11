const templateInitMap = {
  computer: () => import('./templates/computer.js'),
  jumble: () => import('./templates/jumble.js'),
  retrowave: () => import('./templates/retrowave.js'),
  terminal: () => import('./templates/terminal.js'),
  valentines1: () => import('./templates/valentines1.js'),
  valentines2: () => import('./templates/valentines2.js'),
  valentines3: () => import('./templates/valentines2.js'),
  valentines4: () => import('./templates/valentines2.js')
};

document.addEventListener('DOMContentLoaded', async () => {
  if (!window.CARD_DATA_PLACEHOLDER) {
    throw new Error("not found CARD DATA");
  }

  const { template } = window.CARD_DATA_PLACEHOLDER;

  if (templateInitMap[template]) {
    const { default: initTemplate } = await templateInitMap[template]();
    initTemplate(window.CARD_DATA_PLACEHOLDER);
  } else {
    console.warn(`Шаблон "${template}" не поддерживается`);
  }
});
