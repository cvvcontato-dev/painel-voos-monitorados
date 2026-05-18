import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { X, User, Plane, Calendar, Mail, MessageSquare, Clock } from 'lucide-react';

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

const inputCls = "w-full bg-slate-800/50 border border-slate-700 text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all px-4 py-2.5 rounded-lg";

export default function StatusModal({ isOpen, onClose, editing, onSubmit }) {
  const { register, handleSubmit, reset, formState: { errors } } = useForm();

  useEffect(() => {
    if (editing) {
      reset({
        cliente: editing.cliente,
        numero_voo: editing.numero_voo,
        data_voo: editing.data_voo,
        email_cliente: editing.email_cliente || '',
        telegram_chat_id: editing.telegram_chat_id || '',
        cadencia_minutos: editing.cadencia_minutos
      });
    } else {
      reset({ cliente:'', numero_voo:'', data_voo:'', email_cliente:'', telegram_chat_id:'', cadencia_minutos:60 });
    }
  }, [editing, reset, isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={onClose}></div>
      <div className="relative w-full max-w-lg bg-slate-900/60 backdrop-blur-xl border border-slate-700/50 shadow-2xl rounded-2xl overflow-hidden">
        <div className="flex justify-between items-center p-6 border-b border-slate-700/50">
          <h2 className="text-xl font-semibold text-white">{editing ? 'Editar Voo' : 'Monitorar Novo Voo'}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white cursor-pointer"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-300 flex items-center gap-2"><User className="w-4 h-4" /> Cliente</label>
            <input {...register('cliente', { required: true })} className={inputCls} placeholder="Nome do passageiro" />
            {errors.cliente && <span className="text-xs text-red-400">Obrigatório</span>}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-300 flex items-center gap-2"><Plane className="w-4 h-4" /> Número do Voo</label>
              <input {...register('numero_voo', { required: true, pattern: /^[A-Z0-9]{2}\d{1,4}$/i })}
                     className={inputCls} placeholder="LA8084" disabled={!!editing} />
              {errors.numero_voo && <span className="text-xs text-red-400">Formato: 2 letras/dígitos + 1-4 dígitos</span>}
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-300 flex items-center gap-2"><Calendar className="w-4 h-4" /> Data do Voo</label>
              <input type="date" {...register('data_voo', { required: true })} className={inputCls} disabled={!!editing} />
              {errors.data_voo && <span className="text-xs text-red-400">Obrigatório</span>}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-300 flex items-center gap-2"><Mail className="w-4 h-4" /> E-mail</label>
              <input type="email" {...register('email_cliente')} className={inputCls} placeholder="email@exemplo.com" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-300 flex items-center gap-2"><MessageSquare className="w-4 h-4" /> Telegram ID</label>
              <input {...register('telegram_chat_id')} className={inputCls} placeholder="@usuario ou ID" />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-300 flex items-center gap-2"><Clock className="w-4 h-4" /> Cadência de Checagem</label>
            <select {...register('cadencia_minutos', { required: true, valueAsNumber: true })} className={`${inputCls} appearance-none`}>
              {CADENCIA_OPTIONS.map(o => <option key={o.value} value={o.value} className="bg-slate-900">{o.label}</option>)}
            </select>
          </div>
          <div className="pt-4 flex justify-end gap-3 border-t border-slate-700/50">
            <button type="button" onClick={onClose} className="px-5 py-2.5 text-sm text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg cursor-pointer">Cancelar</button>
            <button type="submit" className="px-5 py-2.5 text-sm text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg shadow-lg shadow-indigo-500/25 cursor-pointer active:scale-95">
              {editing ? 'Salvar' : 'Monitorar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
