import { useEffect, useRef, useState } from 'react';
import { Loader2, CheckCircle2, Pencil, Info } from 'lucide-react';
import * as api from '../../api/flightChangeClient';
import { errorMessage, errorCode } from '../../api/flightChangeClient';
import AffectedTripsSection from './AffectedTripsSection';
import { sectionCls, btnPrimary, btnGhost, STATUS, fmtDateTime } from './ui';
import MessageBox from './MessageBox';
import UploadZone from './UploadZone';
import FlightDiffView, { tripSummary } from './FlightDiffView';
import CorrectionForm from './CorrectionForm';
import NewVoucherSection from './NewVoucherSection';
import EmailPreviewModal from './EmailPreviewModal';

const h3 = 'text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider';

// Caso aberto. Use com key={id}: trocar de caso remonta e zera todo o estado local.
export default function CaseView({ id, initial, showToast, onChanged }) {
  const [detail, setDetail] = useState(initial || null);
  const [loadError, setLoadError] = useState(false);
  const [busy, setBusy] = useState(null); // 'notice' | 'upload' | 'save' | 'confirm' | 'email'
  const [skip, setSkip] = useState(false);
  const [editing, setEditing] = useState(false);
  const [preview, setPreview] = useState(null); // 'aviso' | 'confirmacao'
  const [pvTs, setPvTs] = useState(() => Date.now());
  const [focusTick, setFocusTick] = useState(0);
  const alive = useRef(true);
  const lock = useRef(false);
  const ver = useRef(0); // versão do detalhe: descarta respostas antigas

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  useEffect(() => {
    if (initial) return;
    let cancel = false;
    const v = ++ver.current;
    api.get(id)
      .then(d => { if (!cancel && v === ver.current) setDetail(d); })
      .catch(e => { if (!cancel) { setLoadError(true); showToast(errorMessage(e, 'Erro ao abrir o caso'), 'error'); } });
    return () => { cancel = true; };
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Atualiza o detalhe só se for a versão mais recente e o caso ainda estiver aberto.
  function commit(d, v) {
    if (alive.current && v === ver.current) setDetail(d);
  }

  // Executa uma ação com trava de duplo clique. O onOk roda mesmo se o caso foi
  // trocado (lista + toast); só o estado local depende de alive/versão.
  // Devolve true se a ação (e o onOk) concluiu sem erro.
  async function run(kind, fn, onOk) {
    if (lock.current) return false;
    lock.current = true;
    setBusy(kind);
    try {
      const r = await fn();
      await onOk?.(r);
      return true;
    } catch (e) {
      showToast(errorMessage(e), 'error');
      if (errorCode(e) === 'escolha_trechos' && alive.current) {
        setFocusTick(n => n + 1); // leva o operador à seção de trechos
        const v = ++ver.current;
        api.get(id).then(d => commit(d, v)).catch(() => {}); // estado local estava defasado
      }
      return false;
    } finally {
      lock.current = false;
      if (alive.current) setBusy(null);
    }
  }

  if (loadError) return <div className={`${sectionCls} text-sm text-red-600 dark:text-red-300`}>Não foi possível abrir este caso.</div>;
  if (!detail) return <div className={`${sectionCls} text-sm text-slate-500 flex items-center gap-2`} aria-busy="true"><Loader2 className="w-4 h-4 animate-spin" /> Carregando…</div>;

  const done = detail.status === 'confirmado';
  const hasNew = !!detail.new;
  const hasChanges = !!detail.diff?.hasChanges;
  const step2 = done || hasNew || skip || detail.status !== 'aviso_pendente';
  const st = STATUS[detail.status] || STATUS.aviso_pendente;
  const old = detail.old || {};
  const apply = (d) => { commit(d, ++ver.current); onChanged?.(); };
  const bumpPreview = () => { if (alive.current) setPvTs(Date.now()); };
  const openPreview = (kind) => {
    if (editing) showToast('Salve ou cancele a correção — o modelo mostra a última versão salva', 'warning');
    setPreview(kind);
  };
  const stopEditing = () => { if (alive.current) setEditing(false); };

  const needsAffected = !!detail.needs_affected;
  const total = old.trips?.length || 0;
  const partial = Array.isArray(detail.affected) && detail.affected.length > 0 && detail.affected.length < total;
  const saveAffected = (list) => run('affected', () => api.setAffected(id, list), d => {
    const had = !!detail.new;
    apply(d);
    if (had) bumpPreview();
    showToast(had ? 'Viagens atualizadas — voucher novo refeito' : 'Viagens salvas', 'success');
  });
  const markNotice =() => run('notice', () => api.markNoticeSent(id), d => { apply(d); showToast('Aviso marcado como enviado', 'success'); });
  const uploadNew = (file) => run('upload', () => api.uploadNewVoucher(id, file), d => { apply(d); stopEditing(); bumpPreview(); showToast('Voucher novo lido', 'success'); });
  const saveEdits = (unified) => run('save', () => api.saveNew(id, unified), d => { apply(d); stopEditing(); bumpPreview(); showToast('Correções salvas', 'success'); });
  const sendEmail = (kind) => (emails) => run('email', () => api.sendEmail(id, kind, emails), async () => {
    showToast('E-mail enviado', 'success');
    const v = ++ver.current;
    try {
      const d = await api.get(id);
      commit(d, v);
      onChanged?.();
    } catch {
      showToast('E-mail enviado, mas não consegui atualizar o caso — recarregue', 'warning');
    }
  });
  function confirmCase() {
    if (!window.confirm('Confirmar a alteração? O caso será marcado como concluído.')) return;
    run('confirm', () => api.confirm(id), d => { apply(d); showToast('Alteração confirmada', 'success'); });
  }

  return (
    <>
    <div className="space-y-4 max-h-[80vh] overflow-y-auto pr-1" aria-busy={!!busy}>
      <div className={sectionCls}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="font-semibold text-slate-900 dark:text-slate-100 pii">{detail.client_name || 'Cliente'}</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">Localizador <span className="pii">{detail.locator || '—'}</span> · criado em {fmtDateTime(detail.created_at)}</div>
          </div>
          <span className={`text-xs font-medium px-2 py-1 rounded-full ${st.cls}`}>{st.label}</span>
        </div>
        <ul className="mt-3 space-y-1 text-sm text-slate-700 dark:text-slate-300">
          {(old.trips || []).map((t, i) => <li key={i}>{tripSummary(t)}</li>)}
        </ul>
      </div>

      <AffectedTripsSection detail={detail} busy={busy} locked={editing} focusTick={focusTick} onSave={saveAffected} />

      {needsAffected ? (
        <div className={`${sectionCls} text-sm text-slate-600 dark:text-slate-400`}>
          Os passos 1 (aviso) e 2 (confirmação) ficam disponíveis depois de confirmar as viagens alteradas.
        </div>
      ) : (<>
      <div className={`${sectionCls} space-y-3`}>
        <div className={h3}>Passo 1 — Aviso ao cliente</div>
        {!detail.support_phone && (
          <div className="flex gap-2 rounded-lg border border-blue-200 dark:border-blue-500/30 bg-blue-50 dark:bg-blue-500/10 px-3 py-2 text-xs text-blue-800 dark:text-blue-200">
            <Info className="w-4 h-4 shrink-0" />
            <span>Configure o telefone de contato em Vouchers → Configurações para incluir o botão de WhatsApp no aviso.</span>
          </div>
        )}
        <MessageBox
          idPrefix={`aviso-${id}`}
          title="Mensagem de aviso"
          text={detail.messages?.notice}
          busy={busy}
          readOnly={done}
          blocked={editing}
          emailLabel="Enviar e-mail do aviso"
          onSendEmail={sendEmail('aviso')}
          onPreview={() => openPreview('aviso')}
          showToast={showToast}
        >
          {!done && detail.status === 'aviso_pendente' && (
            <button type="button" className={btnGhost} onClick={markNotice} disabled={!!busy} aria-busy={busy === 'notice'}>
              <CheckCircle2 className="w-3.5 h-3.5" /> Marcar aviso como enviado
            </button>
          )}
          {detail.notice_sent_at && <div className="text-xs text-slate-500 dark:text-slate-400">Aviso enviado em {fmtDateTime(detail.notice_sent_at)}</div>}
        </MessageBox>
      </div>

      <div className={`${sectionCls} space-y-3`}>
        <div className={h3}>Passo 2 — Confirmação</div>
        {!step2 ? (
          <div className="space-y-2">
            <p className="text-sm text-slate-600 dark:text-slate-400">Envie o aviso e marque como enviado para liberar este passo.</p>
            <button type="button" className={btnGhost} onClick={() => setSkip(true)}>Pular aviso (cliente já avisado)</button>
          </div>
        ) : (
          <>
            {!done && (
              <UploadZone
                onFile={uploadNew}
                loading={busy === 'upload'}
                disabled={!!busy}
                showToast={showToast}
                label={(partial ? 'Só as viagens marcadas serão substituídas; os demais permanecem como no voucher antigo. A viagem pode ter um número de voos diferente (conexão ↔ direto). ' : '') + (hasNew ? 'Substituir o voucher novo — o voucher novo é refeito a partir do voucher antigo: envie um print que mostre TODAS as viagens alteradas. Clique, arraste ou cole (Ctrl+V).' : 'Voucher novo — PDF ou imagem. Pode ser só um print dos voos: passageiros e bagagem são mantidos do voucher antigo; o localizador só muda se aparecer na imagem; só as viagens que aparecerem são substituídas. Clique, arraste ou, com esta área selecionada, cole (Ctrl+V).')}
              />
            )}
            {hasNew && detail.diff && (
              <>
                {!hasChanges && (
                  <div className="rounded-lg border border-yellow-300 dark:border-yellow-500/40 bg-yellow-50 dark:bg-yellow-500/10 px-3 py-2 text-sm text-yellow-800 dark:text-yellow-200">
                    Nenhuma diferença encontrada entre os vouchers
                  </div>
                )}
                {Array.isArray(detail.warnings) && detail.warnings.length > 0 && (
                  <div role="status" className="rounded-lg border border-amber-300 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
                    <div className="font-medium">Confira antes de confirmar:</div>
                    <ul className="list-disc pl-5">
                      {detail.warnings.map((w, i) => <li key={i}>{w}</li>)}
                    </ul>
                  </div>
                )}
                <FlightDiffView diff={detail.diff} />
                {detail.new_voucher_id && (
                  <NewVoucherSection voucherId={detail.new_voucher_id} url={detail.new_voucher_url} ts={pvTs} partial={partial} showToast={showToast} />
                )}
                {!done && !editing && (
                  <button type="button" className={btnGhost} onClick={() => setEditing(true)} disabled={!!busy}>
                    <Pencil className="w-3.5 h-3.5" /> Corrigir dados lidos
                  </button>
                )}
                {!done && editing && (
                  <CorrectionForm unified={detail.new} saving={busy === 'save'} onSave={saveEdits} onNoChange={() => { setEditing(false); showToast('Nada foi alterado', 'info'); }} onCancel={() => setEditing(false)} showToast={showToast} />
                )}
                {(hasChanges || done) && detail.messages?.confirmation && (
                  <MessageBox
                    idPrefix={`conf-${id}`}
                    title="Mensagem de confirmação"
                    text={detail.messages.confirmation}
                    busy={busy}
                    readOnly={done}
                    blocked={editing}
                    emailLabel="Enviar e-mail com novo voucher (opcional)"
                    onSendEmail={sendEmail('confirmacao')}
                    onPreview={() => openPreview('confirmacao')}
                    previewDisabled={!detail.new_voucher_id}
                    previewTitle={!detail.new_voucher_id ? 'Envie o voucher novo para ver o modelo' : undefined}
                    showToast={showToast}
                  />
                )}
                {!done && (
                  <button type="button" className={btnPrimary} onClick={confirmCase} disabled={!!busy || !hasChanges || editing} aria-busy={busy === 'confirm'}>
                    {busy === 'confirm' ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Confirmar alteração
                  </button>
                )}
              </>
            )}
            {done && <div className="text-xs text-emerald-700 dark:text-emerald-300">Concluído em {fmtDateTime(detail.confirmed_at)}.</div>}
          </>
        )}
      </div>
      </>)}
    </div>
    {preview && <EmailPreviewModal key={preview} id={id} kind={preview} onClose={() => setPreview(null)} showToast={showToast} />}
    </>
  );
}
