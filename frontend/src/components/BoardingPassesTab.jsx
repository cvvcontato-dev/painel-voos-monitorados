import { useEffect, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import * as api from '../api/boardingPassClient';
import PassengerCard from './boarding-passes/PassengerCard';
import SendPanel from './boarding-passes/SendPanel';
import HistoryList from './boarding-passes/HistoryList';
import {
  inputCls, labelCls, sectionCls, btnGhost,
  emptyForm, emptyPassenger, emptySegment, formToPayload, sendToForm, errorMessage
} from './boarding-passes/formState';

export default function BoardingPassesTab({ showToast }) {
  const [form, setForm] = useState(emptyForm);
  const [sendId, setSendId] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [messages, setMessages] = useState([]);
  const [useOriginal, setUseOriginal] = useState(false);
  const [busy, setBusy] = useState(null); // 'prepare' | 'email' | null
  const [emailStatus, setEmailStatus] = useState(null);
  const [history, setHistory] = useState([]);
  const [voucherOptions, setVoucherOptions] = useState([]);

  useEffect(() => {
    refreshHistory();
    api.voucherOptions().then(setVoucherOptions).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function refreshHistory() {
    try { setHistory(await api.list()); }
    catch { showToast('Erro ao carregar histórico', 'error'); }
  }

  // --- edição do formulário ---
  function patchForm(patch) {
    setForm(f => ({ ...f, ...patch }));
    setDirty(true);
  }
  function patchPassenger(pi, patch) {
    setForm(f => ({ ...f, passengers: f.passengers.map((p, i) => (i === pi ? { ...p, ...patch } : p)) }));
    setDirty(true);
  }
  function patchSegment(pi, si, patch) {
    setForm(f => ({
      ...f,
      passengers: f.passengers.map((p, i) => (i !== pi ? p : {
        ...p, segments: p.segments.map((s, j) => (j === si ? { ...s, ...patch } : s))
      }))
    }));
    setDirty(true);
  }
  function addSegment(pi) {
    setForm(f => ({
      ...f,
      passengers: f.passengers.map((p, i) => (i === pi ? { ...p, segments: [...p.segments, emptySegment()] } : p))
    }));
    setDirty(true);
  }
  function removeSegment(pi, si) {
    setForm(f => ({
      ...f,
      passengers: f.passengers.map((p, i) => (i === pi ? { ...p, segments: p.segments.filter((_, j) => j !== si) } : p))
    }));
    setDirty(true);
  }
  function setPassengerCount(n) {
    setForm(f => {
      const passengers = f.passengers.slice(0, n);
      while (passengers.length < n) passengers.push(emptyPassenger());
      return { ...f, passengers };
    });
    setDirty(true);
  }

  async function parseSegment(pi, si, url) {
    const value = String(url || '').trim();
    if (!value) { patchSegment(pi, si, { parsed: null, error: null }); return; }
    try {
      const r = await api.parseLink(value);
      patchSegment(pi, si, r.ok ? { parsed: r, error: null } : { parsed: null, error: r.error });
    } catch {
      patchSegment(pi, si, { parsed: null, error: 'Não consegui verificar o link' });
    }
  }

  // --- voucher ---
  async function pickVoucher(voucherId) {
    if (!voucherId) { patchForm({ voucherId: null }); return; }
    try {
      const pre = await api.voucherPrefill(voucherId);
      setForm({
        ...emptyForm(),
        voucherId: Number(voucherId),
        flightDate: pre.flightDate,
        emailMode: pre.lastEmails.length ? 'single' : 'individual',
        singleEmail: pre.lastEmails.join(', '),
        passengers: pre.passengers.length
          ? pre.passengers.map(p => ({ ...emptyPassenger(), name: p.name, segments: p.segments.map(s => emptySegment(s.label)) }))
          : [emptyPassenger()]
      });
      setSendId(null); setDirty(true); setMessages([]); setEmailStatus(null);
    } catch {
      showToast('Erro ao carregar voucher', 'error');
    }
  }

  // --- salvar / mensagens / envio ---
  async function loadMessages(id, original = useOriginal) {
    setMessages(await api.messages(id, original));
  }

  async function ensureSaved() {
    if (sendId && !dirty) return sendId;
    const payload = formToPayload(form);
    const saved = sendId ? await api.update(sendId, payload) : await api.create(payload);
    setSendId(saved.id);
    setDirty(false);
    setEmailStatus(saved.emailStatus);
    refreshHistory();
    return saved.id;
  }

  async function handlePrepare() {
    setBusy('prepare');
    try {
      const id = await ensureSaved();
      await loadMessages(id);
    } catch (err) {
      showToast(errorMessage(err, 'Erro ao preparar mensagens'), 'error');
    } finally {
      setBusy(null);
    }
  }

  async function handleEmail() {
    setBusy('email');
    try {
      const id = await ensureSaved();
      await loadMessages(id);
      const r = await api.sendEmail(id);
      setEmailStatus(r.status);
      const extra = r.skipped?.length ? ` · sem e-mail: ${r.skipped.join(', ')}` : '';
      if (r.status === 'sent') showToast(`E-mail enviado (${r.sent})${extra}`, 'success');
      else showToast(`Envio parcial: ${r.sent} ok, ${r.failed} com falha${extra}`, 'error');
      refreshHistory();
    } catch (err) {
      if (err?.response?.data?.status) setEmailStatus(err.response.data.status);
      showToast(errorMessage(err, 'Falha ao enviar e-mail'), 'error');
    } finally {
      setBusy(null);
    }
  }

  async function toggleOriginal(value) {
    setUseOriginal(value);
    if (sendId && !dirty) {
      try { await loadMessages(sendId, value); }
      catch { showToast('Erro ao atualizar mensagens', 'error'); }
    }
  }

  async function copyText(text, okMsg) {
    try {
      await navigator.clipboard.writeText(text);
      showToast(okMsg, 'success');
    } catch {
      showToast('Não consegui copiar — selecione o texto manualmente', 'error');
    }
  }

  // --- histórico ---
  function resetForm() {
    setForm(emptyForm());
    setSendId(null); setDirty(false); setMessages([]); setEmailStatus(null);
  }

  async function openFromHistory(id) {
    try {
      const send = await api.get(id);
      setForm(sendToForm(send));
      setSendId(send.id); setDirty(false); setEmailStatus(send.emailStatus);
      await loadMessages(send.id);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
      showToast('Erro ao abrir envio', 'error');
    }
  }

  async function deleteFromHistory(id) {
    if (!window.confirm('Apagar este envio? Os links curtos deixam de funcionar.')) return;
    try {
      await api.remove(id);
      if (id === sendId) resetForm();
      refreshHistory();
    } catch {
      showToast('Erro ao apagar envio', 'error');
    }
  }

  const radio = (name, value, current, label, onPick) => (
    <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
      <input type="radio" name={name} checked={current === value} onChange={() => onPick(value)} /> {label}
    </label>
  );

  return (
    <div className="space-y-6">
      <div className="grid lg:grid-cols-3 gap-6 items-start">
        <div className="lg:col-span-2 space-y-4">
          <div className={sectionCls}>
            <div className="flex flex-wrap items-end gap-4">
              <div className="flex-1 min-w-[220px]">
                <label className={labelCls}>Puxar de um voucher</label>
                <select className={`${inputCls} pii`} value={form.voucherId || ''} onChange={e => pickVoucher(e.target.value)}>
                  <option value="">— Preencher manualmente —</option>
                  {voucherOptions.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
                </select>
              </div>
              <div className="w-36">
                <label className={labelCls}>Passageiros</label>
                <select className={inputCls} value={form.passengers.length} onChange={e => setPassengerCount(Number(e.target.value))}>
                  {Array.from({ length: 9 }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <button type="button" className={btnGhost} onClick={resetForm}>
                <RotateCcw className="w-3.5 h-3.5" /> Novo envio
              </button>
            </div>
          </div>

          {form.passengers.map((p, pi) => (
            <PassengerCard
              key={p.key}
              index={pi}
              passenger={p}
              onChange={patch => patchPassenger(pi, patch)}
              onSegmentChange={(si, patch) => patchSegment(pi, si, patch)}
              onSegmentParse={(si, url) => parseSegment(pi, si, url)}
              onAddSegment={() => addSegment(pi)}
              onRemoveSegment={si => removeSegment(pi, si)}
              onCopy={copyText}
            />
          ))}

          <div className={sectionCls}>
            <div className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-3">Destino</div>
            <div className="grid sm:grid-cols-2 gap-6">
              <div className="space-y-2">
                <div className={labelCls}>E-mail</div>
                {radio('emailMode', 'individual', form.emailMode, 'Cada passageiro recebe o seu', v => patchForm({ emailMode: v }))}
                {radio('emailMode', 'single', form.emailMode, 'Todos os cartões para um e-mail', v => patchForm({ emailMode: v }))}
                {form.emailMode === 'single' && (
                  <input className={`${inputCls} pii`} value={form.singleEmail} placeholder="cliente@email.com, outro@email.com"
                    onChange={e => patchForm({ singleEmail: e.target.value })} />
                )}
              </div>
              <div className="space-y-2">
                <div className={labelCls}>WhatsApp</div>
                {radio('whatsappMode', 'individual', form.whatsappMode, 'Cada um no seu número', v => patchForm({ whatsappMode: v }))}
                {radio('whatsappMode', 'single', form.whatsappMode, 'Todos os cartões para um número', v => patchForm({ whatsappMode: v }))}
                {form.whatsappMode === 'single' && (
                  <input className={`${inputCls} pii`} value={form.singlePhone} placeholder="(75) 99999-9999"
                    onChange={e => patchForm({ singlePhone: e.target.value })} />
                )}
              </div>
            </div>
          </div>
        </div>

        <SendPanel
          messages={messages}
          dirty={dirty}
          saved={!!sendId}
          busy={busy}
          emailStatus={emailStatus}
          useOriginal={useOriginal}
          onToggleOriginal={toggleOriginal}
          onPrepare={handlePrepare}
          onEmail={handleEmail}
          onCopy={copyText}
        />
      </div>

      <HistoryList items={history} activeId={sendId} onOpen={openFromHistory} onDelete={deleteFromHistory} />
    </div>
  );
}
