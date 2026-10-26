import { useEffect, useRef } from 'react';
import { useIsMobile } from './useMediaQuery';

/**
 * Faz o botão "Voltar" do celular fechar a camada aberta (folha, janela, caso em tela cheia)
 * em vez de sair do app. Cada camada aberta empilha UMA entrada no histórico; o Voltar remove
 * só a do topo e fecha só essa camada. Se a camada fecha por outro meio (X, Esc, toque no fundo),
 * a entrada dela é removida do histórico.
 * Só age no celular (< 768px).
 */
const pilha = [];            // camadas abertas, da mais antiga à do topo: { id, close }
let ignorarProximoPop = 0;   // pops causados por nós mesmos (history.back() ao fechar por outro meio)
const pendentes = new Set(); // camadas cuja entrada de histórico será desfeita no próximo ciclo, salvo reaproveitamento
let ouvindo = false;

function aoVoltar() {
  if (ignorarProximoPop > 0) { ignorarProximoPop -= 1; return; }
  const topo = pilha.pop();
  if (topo) topo.close();
}

function garantirOuvinte() {
  if (ouvindo) return;
  window.addEventListener('popstate', aoVoltar);
  ouvindo = true;
}

export default function useBackClose(open, onClose) {
  const mobile = useIsMobile();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const idRef = useRef(null);
  if (idRef.current === null) idRef.current = Symbol('camada');

  useEffect(() => {
    if (!open || !mobile) return undefined;
    const id = idRef.current;
    garantirOuvinte();
    const entrada = { id, close: () => onCloseRef.current() };
    pilha.push(entrada);
    // Se o React refez o efeito logo após o cleanup (StrictMode), a entrada do histórico ainda existe: reaproveita.
    if (pendentes.has(id)) pendentes.delete(id);
    else window.history.pushState({ camada: true }, '');
    return () => {
      // Fechou por outro meio (ou o React refez o efeito): tira a nossa entrada da pilha.
      const i = pilha.lastIndexOf(entrada);
      if (i === -1) return;                 // já foi consumida pelo Voltar
      const eraTopo = i === pilha.length - 1;
      pilha.splice(i, 1);
      if (!eraTopo) return;
      pendentes.add(id);
      setTimeout(() => {
        if (!pendentes.delete(id)) return;  // reaproveitada por um novo efeito
        if (window.history.state && window.history.state.camada) {
          ignorarProximoPop += 1;
          window.history.back();
        }
      }, 0);
    };
  }, [open, mobile]);
}
