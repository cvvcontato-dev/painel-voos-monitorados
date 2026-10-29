import { useState, useCallback } from 'react';

export function useSmartProgress() {
  const [state, setState] = useState({
    isOpen: false,
    title: '',
    subtitle: '',
    steps: [],
    isComplete: false,
    error: null,
  });

  const start = useCallback((config = {}) => {
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

  const complete = useCallback(() => {
    setState(s => ({ ...s, isComplete: true }));
  }, []);

  const fail = useCallback((errMsg) => {
    setState(s => ({ ...s, error: errMsg }));
  }, []);

  const close = useCallback(() => {
    setState(s => ({ ...s, isOpen: false }));
  }, []);

  return { ...state, start, complete, fail, close };
}

export default useSmartProgress;
