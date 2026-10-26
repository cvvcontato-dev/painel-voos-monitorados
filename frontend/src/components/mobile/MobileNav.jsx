import { cloneElement, useEffect, useState } from 'react';
import { Ellipsis } from 'lucide-react';
import BottomSheet, { SheetItem } from './BottomSheet';

// Abas sempre visíveis na barra; as demais ficam em "Mais".
const PRIMARY = ['precos', 'status', 'alteracoes', 'vouchers'];
const TIPOS_SEM_TEXTO = ['checkbox', 'radio', 'button', 'submit', 'file', 'range', 'color', 'reset', 'image'];
const ehCampoDeTexto = (el) => !!el && (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && !TIPOS_SEM_TEXTO.includes(el.type)));

export default function MobileNav({ tabs, active, onChange }) {
  const [maisAberto, setMaisAberto] = useState(false);
  const [digitando, setDigitando] = useState(false);

  // Com o teclado aberto a barra some, para não cobrir o campo que está sendo digitado.
  useEffect(() => {
    const dentro = (e) => setDigitando(ehCampoDeTexto(e.target));
    // Ao ir de um campo para outro o foco passa por focusout → focusin: só mostra a barra se o destino
    // NÃO for um campo de texto, para ela não piscar com o teclado aberto.
    const fora = (e) => { if (!ehCampoDeTexto(e.relatedTarget)) setDigitando(false); };
    document.addEventListener('focusin', dentro);
    document.addEventListener('focusout', fora);
    return () => { document.removeEventListener('focusin', dentro); document.removeEventListener('focusout', fora); };
  }, []);

  // Se o campo sair da tela com o foco nele (fechar janela, trocar de aba), o focusout pode não disparar
  // e a barra ficaria escondida para sempre: enquanto escondida, confere o foco de tempos em tempos.
  useEffect(() => {
    if (!digitando) return undefined;
    const t = setInterval(() => { if (!ehCampoDeTexto(document.activeElement)) setDigitando(false); }, 500);
    return () => clearInterval(t);
  }, [digitando]);

  const principais = PRIMARY.map(v => tabs.find(t => t.value === v)).filter(Boolean);
  const extras = tabs.filter(t => !PRIMARY.includes(t.value));
  const ativaEmMais = extras.find(t => t.value === active);

  const ir = (valor) => { onChange(valor); window.scrollTo({ top: 0 }); };
  const icone = (t) => cloneElement(t.icon, { className: 'w-5 h-5' });
  const btn = (ativo) => `w-full min-h-[56px] flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors
    ${ativo ? 'text-indigo-600 dark:text-indigo-300' : 'text-slate-500 dark:text-slate-400'}`;

  return (
    <>
      {!digitando && (
        <nav aria-label="Navegação principal"
             className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t backdrop-blur
                        bg-white/95 border-slate-200 dark:bg-slate-950/95 dark:border-slate-800
                        pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]">
          <ul className="grid grid-cols-5">
            {principais.map(t => (
              <li key={t.value}>
                <button type="button" onClick={() => ir(t.value)} aria-current={active === t.value ? 'page' : undefined} className={btn(active === t.value)}>
                  {icone(t)}
                  <span className="truncate max-w-full px-1">{t.label}</span>
                </button>
              </li>
            ))}
            <li>
              <button type="button" onClick={() => setMaisAberto(true)} aria-haspopup="dialog" aria-label={ativaEmMais ? `Mais opções (aba atual: ${ativaEmMais.label})` : 'Mais opções'} aria-current={ativaEmMais ? 'page' : undefined} className={btn(!!ativaEmMais)}>
                {ativaEmMais ? icone(ativaEmMais) : <Ellipsis className="w-5 h-5" />}
                <span className="truncate max-w-full px-1">{ativaEmMais ? ativaEmMais.label.split(' ')[0] : 'Mais'}</span>
              </button>
            </li>
          </ul>
        </nav>
      )}

      <BottomSheet open={maisAberto} onClose={() => setMaisAberto(false)} title="Mais">
        {extras.map(t => (
          <SheetItem key={t.value} icon={icone(t)} label={t.label} active={t.value === active}
                     onClick={() => { setMaisAberto(false); ir(t.value); }} />
        ))}
      </BottomSheet>
    </>
  );
}
