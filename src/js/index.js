const templateInitMap = {
  jumble: () => import('./templates/jumble.js'),
  retrowave: () => import('./templates/retrowave.js'),
  terminal: () => import('./templates/terminal.js')
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
