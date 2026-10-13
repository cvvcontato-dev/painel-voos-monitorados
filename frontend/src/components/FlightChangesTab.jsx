import { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, Trash2, RefreshCw, Loader2, X } from 'lucide-react';
import * as api from '../api/flightChangeClient';
import { errorMessage } from '../api/flightChangeClient';
import { sectionCls, inputCls, labelCls, btnPrimary, btnGhost, STATUS, fmtDateTime } from './flight-changes/ui';
import UploadZone from './flight-changes/UploadZone';
import CaseView from './flight-changes/CaseView';

function NewCasePanel({ showToast, onCreated, onLate, onClose }) {
  const [vouchers, setVouchers] = useState(null);
  const [voucherId, setVoucherId] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  const [vErr, setVErr] = useState(false);
  const [vTry, setVTry] = useState(0);

  useEffect(() => {
    let cancel = false;
    api.voucherList()
      .then(v => { if (!cancel) { setVErr(false); setVouchers(Array.isArray(v) ? v : []); } })
      .catch(() => { if (!cancel) { setVErr(true); setVouchers([]); } });
    return () => { cancel = true; };
  }, [vTry]);

  async function create(fn) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      const d = await fn();
      if (alive.current) onCreated(d);
      else onLate(d); // painel já fechado/trocado: não rouba a seleção atual
    } catch (e) {
      showToast(errorMessage(e, 'Erro ao criar a alteração'), 'error');
    } finally {
      lock.current = false;
      if (alive.current) setBusy(false);
    }
  }

  return (
    <div className={`${sectionCls} space-y-4`} aria-busy={busy}>
      <div className="flex items-center justify-between">
        <div className="font-semibold text-slate-900 dark:text-slate-100">Nova alteração</div>
        <button type="button" className={btnGhost} onClick={onClose} disabled={busy} aria-label="Fechar"><X className="w-3.5 h-3.5" /></button>
      </div>
      <div>
        <label className={labelCls} htmlFor="fc-voucher">Usar um voucher salvo</label>
        {vouchers === null ? (
          <div className="text-xs text-slate-500">Carregando vouchers…</div>
        ) : vErr ? (
          <div className="text-xs text-red-600 dark:text-red-300 flex items-center gap-2">
            Não consegui carregar os vouchers salvos.
            <button type="button" className={btnGhost} onClick={() => { setVouchers(null); setVTry(n => n + 1); }}>Tentar de novo</button>
          </div>
        ) : vouchers.length === 0 ? (
          <div className="text-xs text-slate-500 dark:text-slate-400">Nenhum voucher salvo — envie o arquivo abaixo.</div>
        ) : (
          <div className="flex gap-2">
            <select id="fc-voucher" className={`${inputCls} pii`} value={voucherId} onChange={e => setVoucherId(e.target.value)} disabled={busy}>
              <option value="">— Escolha um voucher —</option>
              {vouchers.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
            </select>
            <button type="button" className={btnPrimary} disabled={busy || !voucherId} onClick={() => create(() => api.createFromVoucher(Number(voucherId)))}>
              Usar
            </button>
          </div>
        )}
      </div>
      <div className="text-center text-xs text-slate-400">ou</div>
      <UploadZone
        onFile={file => create(() => api.createFromFile(file))}
        loading={busy}
        showToast={showToast}
              />
    </div>
  );
}

export default function FlightChangesTab({ showToast }) {
  const [items, setItems] = useState(null);
  const [selected, setSelected] = useState(null); // { id, initial }
  const [creating, setCreating] = useState(false);
  const [removing, setRemoving] = useState(null);

  const [listError, setListError] = useState(false);
  const reqSeq = useRef(0);

  const reload = useCallback(async () => {
    const n = ++reqSeq.current;
    try {
      const r = await api.list();
      if (n !== reqSeq.current) return; // resposta fora de ordem
      setItems(r);
      setListError(false);
    } catch (e) {
      if (n !== reqSeq.current) return;
      setListError(true);
      showToast(errorMessage(e, 'Erro ao carregar alterações'), 'error');
    }
  }, [showToast]);

  useEffect(() => { reload(); }, [reload]);

  function open(id) { setCreating(false); setSelected({ id, initial: null }); }
  function created(detail) {
    setCreating(false);
    setSelected({ id: detail.id, initial: detail });
    reload();
  }

  function createdLate(detail) {
    reload();
    showToast(`Alteração criada para ${detail.client_name || 'cliente'}`, 'success');
  }

  async function remove(item) {
    if (removing) return;
    if (!window.confirm(`Apagar a alteração de ${item.client_name || 'cliente'} (${item.locator || 's/ localizador'})?`)) return;
    setRemoving(item.id);
    try {
      await api.remove(item.id);
      setSelected(s => (s?.id === item.id ? null : s));
      reload();
    } catch (e) {
      showToast(errorMessage(e, 'Erro ao apagar'), 'error');
    } finally {
      setRemoving(null);
    }
  }

  return (
    <div className="grid lg:grid-cols-3 gap-6 items-start">
      <div className="space-y-3">
        <button type="button" className={`${btnPrimary} w-full`} onClick={() => { setCreating(true); setSelected(null); }}>
          <Plus className="w-4 h-4" /> Nova alteração
        </button>
        <div className={`${sectionCls} max-h-[70vh] overflow-y-auto p-2`} aria-busy={items === null}>
          {listError && items === null ? (
            <div className="p-3 text-sm text-red-600 dark:text-red-300 space-y-2">
              <p>Não consegui carregar a lista.</p>
              <button type="button" className={btnGhost} onClick={() => { setListError(false); reload(); }}>Tentar de novo</button>
            </div>
          ) : items === null ? (
            <div className="p-3 text-sm text-slate-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Carregando…</div>
          ) : items.length === 0 ? (
            <div className="p-4 text-sm text-slate-600 dark:text-slate-400 space-y-2">
              <RefreshCw className="w-5 h-5 text-slate-400" />
              <p className="font-medium text-slate-700 dark:text-slate-300">Nenhuma alteração de voo ainda.</p>
              <p>Quando a companhia mudar um voo do cliente: (1) envie o voucher antigo e avise o cliente; (2) envie o voucher novo, confira as diferenças e confirme.</p>
            </div>
          ) : (
            <ul className="space-y-1">
              {items.map(it => {
                const st = STATUS[it.status] || STATUS.aviso_pendente;
                const active = selected?.id === it.id;
                return (
                  <li key={it.id} className={`flex items-center gap-1 rounded-lg ${active ? 'bg-indigo-50 dark:bg-indigo-500/10' : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'}`}>
                    <button type="button" onClick={() => open(it.id)} aria-current={active ? 'true' : undefined} className="flex-1 text-left p-2 min-w-0 cursor-pointer">
                      <div className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate pii">{it.client_name || 'Cliente'}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400"><span className="pii">{it.locator || '—'}</span> · {fmtDateTime(it.created_at)}</div>
                      <span className={`inline-block mt-1 text-[11px] font-medium px-2 py-0.5 rounded-full ${st.cls}`}>{st.label}</span>
                    </button>
                    <button type="button" onClick={() => remove(it)} disabled={removing === it.id} aria-label={`Apagar alteração de ${it.client_name || 'cliente'}`}
                      className="p-2 text-slate-400 hover:text-red-500 disabled:opacity-50 cursor-pointer">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      <div className="lg:col-span-2">
        {creating ? (
          <NewCasePanel showToast={showToast} onCreated={created} onLate={createdLate} onClose={() => setCreating(false)} />
        ) : selected ? (
          <CaseView key={selected.id} id={selected.id} initial={selected.initial} showToast={showToast} onChanged={reload} />
        ) : (
          <div className={`${sectionCls} text-sm text-slate-500 dark:text-slate-400`}>Selecione uma alteração na lista ou crie uma nova.</div>
        )}
      </div>
    </div>
  );
}
