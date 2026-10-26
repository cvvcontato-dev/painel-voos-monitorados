// Auditoria mobile. Cole no console (ou rode via javascript_exec) com a aba que quer medir aberta.
// Retorna um relatório; compare ANTES e DEPOIS de cada etapa.
(() => {
  const W = window.innerWidth;
  const de = document.documentElement;
  const visivel = (e) => {
    const r = e.getBoundingClientRect(); const cs = getComputedStyle(e);
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
  };
  const emRolagemX = (e) => {
    for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) {
      const ox = getComputedStyle(p).overflowX;
      if (ox === 'auto' || ox === 'scroll') return true;
    }
    return false;
  };
  const nome = (e) => {
    const t = (e.getAttribute('aria-label') || e.title || e.textContent || e.placeholder || '').replace(/\s+/g, ' ').trim().slice(0, 30);
    return `${e.tagName.toLowerCase()}${t ? ` "${t}"` : ''} ${Math.round(e.getBoundingClientRect().width)}x${Math.round(e.getBoundingClientRect().height)}`;
  };
  const todos = [...document.querySelectorAll('body *')].filter(visivel);
  const estouram = todos.filter(e => getComputedStyle(e).position !== 'fixed' && !emRolagemX(e) && e.getBoundingClientRect().right > W + 1);
  const alvos = [...document.querySelectorAll('button, a[href], input:not([type=hidden]), select, textarea, [role=button], summary')]
    .filter(visivel).filter(e => !e.closest('[aria-hidden="true"]'));
  const pequenos36 = alvos.filter(e => { const r = e.getBoundingClientRect(); return Math.min(r.width, r.height) < 36; });
  const pequenos44 = alvos.filter(e => { const r = e.getBoundingClientRect(); return Math.min(r.width, r.height) < 44; });
  const textoMin = todos.filter(e => e.children.length === 0 && e.textContent.trim() && parseFloat(getComputedStyle(e).fontSize) < 11);
  const campos16 = W < 768
    ? [...document.querySelectorAll('input:not([type=checkbox]):not([type=radio]):not([type=hidden]):not([type=file]), select, textarea')]
        .filter(visivel).filter(e => parseFloat(getComputedStyle(e).fontSize) < 16)
    : [];
  return {
    largura: W,
    rolagemHorizontalPx: de.scrollWidth - de.clientWidth,
    estouram: estouram.slice(0, 6).map(nome),
    alvosMenor36: pequenos36.length, exemplosMenor36: pequenos36.slice(0, 6).map(nome),
    alvosMenor44: pequenos44.length,
    textoMenor11px: textoMin.length, exemplosTexto: textoMin.slice(0, 4).map(nome),
    camposMenor16px: campos16.length,
    alturaPagina: de.scrollHeight
  };
})();
