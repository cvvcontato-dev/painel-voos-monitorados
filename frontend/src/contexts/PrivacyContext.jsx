import { createContext, useState, useRef, useEffect, useCallback } from 'react';

// O default vale para qualquer árvore SEM provider — em particular as rotas de
// exportação (/voucher-preview/...), que retornam antes do provider no AppShell.
// É isso que garante que o voucher real do cliente nunca saia borrado.
export const PrivacyContext = createContext({
  enabled: false,
  toggle: () => {},
  pseudonym: (name) => name,
});

export function PrivacyProvider({ children }) {
  // Sem persistência: nasce desligado a cada carregamento.
  const [enabled, setEnabled] = useState(false);

  // Mapa nome->apelido. Vive em ref para sobreviver a ligar/desligar sem
  // renumerar ninguém durante a sessão.
  const namesRef = useRef(new Map());

  useEffect(() => {
    const root = document.documentElement;
    if (enabled) root.classList.add('privacy-on');
    else root.classList.remove('privacy-on');
    return () => root.classList.remove('privacy-on');
  }, [enabled]);

  const toggle = useCallback(() => setEnabled(v => !v), []);

  const pseudonym = useCallback((name) => {
    const key = (name || '').trim();
    if (!key || key === '(sem cliente)') return 'Cliente sem nome';
    const map = namesRef.current;
    if (!map.has(key)) map.set(key, `Cliente ${map.size + 1}`);
    return map.get(key);
  }, []);

  return (
    <PrivacyContext.Provider value={{ enabled, toggle, pseudonym }}>
      {children}
    </PrivacyContext.Provider>
  );
}
