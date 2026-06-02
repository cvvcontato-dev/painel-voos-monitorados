import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { X, User, Plane, Calendar, Mail, MessageSquare, Clock, Link as LinkIcon, Hand, AlertCircle } from 'lucide-react';

/** Converte "HH:MM" em horário Brasília para ISO UTC dado um data_voo YYYY-MM-DD.
 *  Brasília é UTC-3 (Brasil aboliu DST em 2019). */
function brtTimeToIso(dataVoo, hhmm) {
  if (!dataVoo || !hhmm || !/^\d{2}:\d{2}$/.test(hhmm)) return null;
  const [h, m] = hhmm.split(':').map(Number);
  if (h > 23 || m > 59) return null;
  // BRT → UTC: soma 3 horas
  const d = new Date(`${dataVoo}T${hhmm}:00.000-03:00`);
  if (isNaN(d)) return null;
  return d.toISOString();
}

/** Converte ISO UTC para "HH:MM" no fuso de Brasília. */
function isoToBrtTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
}

const CADENCIA_OPTIONS = [
  { value: 15, label: 'A cada 15 minutos' },
  { value: 30, label: 'A cada 30 minutos' },
  { value: 60, label: 'A cada 1 hora' },
  { value: 120, label: 'A cada 2 horas' },
  { value: 240, label: 'A cada 4 horas' },
  { value: 360, label: 'A cada 6 horas' },
  { value: 720, label: 'A cada 12 horas' },
  { value: 1440, label: '1× por dia' }
];

const inputCls = "w-full px-4 py-2.5 rounded-lg transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent border " +
                 "bg-white text-slate-900 placeholder-slate-400 border-slate-300 " +
                 "dark:bg-slate-800/50 dark:text-slate-100 dark:placeholder-slate-400 dark:border-slate-700";

export default function StatusModal({ isOpen, onClose, editing, onSubmit }) {
  const { register, handleSubmit, reset, watch, formState: { errors } } = useForm();
  const [overrideOn, setOverrideOn] = useState(false);
  const dataVoo = watch('data_voo');

  useEffect(() => {
    if (editing) {
      reset({
        cliente: editing.cliente,
        numero_voo: editing.numero_voo,
        data_voo: editing.data_voo,
        email_cliente: editing.email_cliente || '',
        telegram_chat_id: editing.telegram_chat_id || '',
        cadencia_minutos: editing.cadencia_minutos,
        link_gerenciamento: editing.link_gerenciamento || '',
        override_hora_brt: editing.override_ativo ? isoToBrtTime(editing.partida_programada) : ''
      });
      setOverrideOn(editing.override_ativo === 1);
    } else {
      reset({ cliente:'', numero_voo:'', data_voo:'', email_cliente:'', telegram_chat_id:'', cadencia_minutos:60, link_gerenciamento:'', override_hora_brt:'' });
      setOverrideOn(false);
    }
  }, [editing, reset, isOpen]);

  // Wrapper que traduz override_hora_brt → ISO UTC antes de chamar onSubmit
  const wrappedSubmit = (data) => {
    const { override_hora_brt, ...rest } = data;
    let payload = { ...rest };
    if (editing) {
      if (overrideOn) {
        const iso = brtTimeToIso(rest.data_voo, override_hora_brt);
        if (!iso) { alert('Horário inválido. Use formato HH:MM (ex: 10:00).'); return; }
        payload.override_ativo = 1;
        payload.override_partida_programada = iso;
        payload.override_partida_estimada = iso;
      } else if (editing.override_ativo === 1) {
        // Estava ativo e o usuário desligou
        payload.override_ativo = 0;
      }
    }
    onSubmit(payload);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 dark:bg-slate-950/80 backdrop-blur-sm" onClick={onClose}></div>
      <div className="relative w-full max-w-lg max-h-[90vh] flex flex-col bg-white border border-slate-200 dark:bg-slate-900/60 dark:backdrop-blur-xl dark:border-slate-700/50 shadow-2xl rounded-2xl overflow-hidden">
        <div className="flex justify-between items-center p-6 border-b border-slate-200 dark:border-slate-700/50 shrink-0">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white">{editing ? 'Editar Voo' : 'Monitorar Novo Voo'}</h2>
          <button onClick={onClose} className="text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white cursor-pointer"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handleSubmit(wrappedSubmit)} className="p-6 space-y-4 overflow-y-auto flex-1">
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2"><User className="w-4 h-4" /> Cliente</label>
            <input {...register('cliente', { required: true })} className={inputCls} placeholder="Nome do passageiro" />
            {errors.cliente && <span className="text-xs text-red-700 dark:text-red-400">Obrigatório</span>}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2"><Plane className="w-4 h-4" /> Número do Voo</label>
              <input {...register('numero_voo', { required: true, pattern: /^[A-Z0-9]{2}\d{1,4}$/i })}
                     className={inputCls} placeholder="LA8084" disabled={!!editing} />
              {errors.numero_voo && <span className="text-xs text-red-700 dark:text-red-400">Formato: 2 letras/dígitos + 1-4 dígitos</span>}
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2"><Calendar className="w-4 h-4" /> Data do Voo</label>
              <input type="date" {...register('data_voo', { required: true })} className={inputCls} disabled={!!editing} />
              {errors.data_voo && <span className="text-xs text-red-700 dark:text-red-400">Obrigatório</span>}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2"><Mail className="w-4 h-4" /> E-mail</label>
              <input type="email" {...register('email_cliente')} className={inputCls} placeholder="email@exemplo.com" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2"><MessageSquare className="w-4 h-4" /> Telegram ID</label>
              <input {...register('telegram_chat_id')} className={inputCls} placeholder="@usuario ou ID" />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2"><Clock className="w-4 h-4" /> Cadência de Checagem</label>
            <select {...register('cadencia_minutos', { required: true, valueAsNumber: true })} className={`${inputCls} appearance-none`}>
              {CADENCIA_OPTIONS.map(o => <option key={o.value} value={o.value} className="bg-white dark:bg-slate-900">{o.label}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2">
              <LinkIcon className="w-4 h-4" /> Link de Gerenciamento da Reserva
            </label>
            <input
              type="url"
              {...register('link_gerenciamento', {
                pattern: { value: /^https?:\/\/.+/i, message: 'URL inválida (use http:// ou https://)' }
              })}
              className={inputCls}
              placeholder="https://www.voeazul.com.br/br/pt/minhas-reservas/..."
            />
            <p className="text-xs text-slate-500 dark:text-slate-500">
              Opcional — link da companhia aérea para o cliente gerenciar a reserva (check-in, alterações).
            </p>
            {errors.link_gerenciamento && <span className="text-xs text-red-700 dark:text-red-400">{errors.link_gerenciamento.message}</span>}
          </div>

          {/* Override manual de horário — só ao editar */}
          {editing && (
            <div className="border border-amber-200 dark:border-amber-500/20 bg-amber-50/40 dark:bg-amber-500/5 rounded-lg p-4 space-y-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={overrideOn}
                  onChange={e => setOverrideOn(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-amber-600 focus:ring-amber-500 cursor-pointer"
                />
                <Hand className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                <span className="text-sm font-medium text-slate-800 dark:text-slate-200">
                  Sobrescrever horário manualmente
                </span>
              </label>

              {overrideOn ? (
                <>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-600 dark:text-slate-400 flex items-center gap-2">
                      <Clock className="w-3.5 h-3.5" /> Horário de partida (Brasília)
                    </label>
                    <input
                      type="time"
                      {...register('override_hora_brt', { required: overrideOn })}
                      className={inputCls}
                      placeholder="10:00"
                    />
                    {errors.override_hora_brt && <span className="text-xs text-red-700 dark:text-red-400">Horário obrigatório</span>}
                  </div>
                  <div className="flex items-start gap-2 text-xs text-amber-800 dark:text-amber-300">
                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>
                      Quando ativo, o sistema preserva esse horário e ignora atualizações da API.
                      Cancelamento, desvio e mudança de portão/terminal continuam sendo monitorados normalmente.
                    </span>
                  </div>
                </>
              ) : (
                editing.override_ativo === 1 && (
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    Override será desativado ao salvar. O próximo ciclo da API vai atualizar o horário com dados reais.
                  </div>
                )
              )}
            </div>
          )}
          <div className="pt-4 flex justify-end gap-3 border-t border-slate-200 dark:border-slate-700/50">
            <button type="button" onClick={onClose} className="px-5 py-2.5 text-sm text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 dark:text-slate-300 dark:hover:text-white dark:bg-slate-800 dark:hover:bg-slate-700 rounded-lg cursor-pointer">Cancelar</button>
            <button type="submit" className="px-5 py-2.5 text-sm text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg shadow-lg shadow-indigo-500/25 cursor-pointer active:scale-95">
              {editing ? 'Salvar' : 'Monitorar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
