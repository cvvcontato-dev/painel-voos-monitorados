import { useState, useCallback, useRef } from 'react';

export function useSmartProgress() {
  const [state, setState] = useState({
    isOpen: false,
    title: '',
    subtitle: '',
    steps: [],
    isComplete: false,
    error: null,
  });
  const timerRef = useRef(null);

  const start = useCallback((config = {}) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setState({
      isOpen: true,
      title: config.title || 'Processando com Inteligência Artificial',
      subtitle: config.subtitle || 'Por favor, aguarde alguns instantes...',
      steps: config.steps || [
        { title: 'Lendo dados da reserva com IA...', desc: 'Interpretando comprovante, localizadores e cia aérea' },
        { title: 'Formatando arte e itinerário...', desc: 'Estruturando trechos, conexões, passageiros e valores' },
        { title: 'Voucher e itinerário prontos!', desc: 'Gerando documento oficial e link público seguro' }
      ],
      isComplete: false,
      error: null
    });
  }, []);

  const close = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setState(s => ({ ...s, isOpen: false }));
  }, []);

  const complete = useCallback(() => {
    setState(s => ({ ...s, isComplete: true }));
    if (timerRef.current) clearTimeout(timerRef.current);
    // Garante fechamento automático mesmo se o consumidor não amarrar onClose
    timerRef.current = setTimeout(() => {
      setState(s => ({ ...s, isOpen: false }));
    }, 850);
  }, []);

  const fail = useCallback((errMsg) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setState(s => ({ ...s, error: errMsg }));
  }, []);

  return { ...state, start, complete, fail, close, onClose: close };
}

export default useSmartProgress;
