import { Download, Copy, ExternalLink } from 'lucide-react';
import { exportUrl } from '../../api/voucherClient';
import { btnGhost, copyText } from './ui';

// Voucher novo no padrão Clube do Voo (o mesmo da aba Vouchers).
// `ts` muda quando o voucher é re-enviado ou corrigido, recarregando a prévia.
export default function NewVoucherSection({ voucherId, url, ts, partial, showToast }) {
  async function copyLink() {
    if (await copyText(url)) showToast('Link do voucher copiado', 'success');
    else showToast('Não consegui copiar — use "Abrir link"', 'error');
  }
  return (
    <details open className="rounded-lg border border-slate-200 dark:border-slate-700/60 px-3 py-2">
      <summary className="cursor-pointer text-sm font-medium text-slate-800 dark:text-slate-100">Voucher novo (padrão Clube do Voo)</summary>
      <div className="mt-3 space-y-3">
        <p className="text-xs text-slate-500 dark:text-slate-400">É o mesmo voucher gerado na aba Vouchers, com os dados novos — este é o PDF que vai por e-mail.{partial ? ' Só as viagens marcadas foram substituídas; os demais permanecem como no voucher antigo. A viagem pode ter um número de voos diferente (conexão ↔ direto).' : ''}</p>
        <div className="rounded-lg border border-slate-200 dark:border-slate-700/60 overflow-hidden bg-slate-100 dark:bg-slate-900/40">
          <iframe key={`${voucherId}-${ts}`} src={`/voucher-preview/${voucherId}?ts=${ts}`} title="Prévia do voucher novo" className="w-full border-0" style={{ height: '70vh', minHeight: 420 }} />
        </div>
        <div className="flex flex-wrap gap-2">
          <a className={btnGhost} href={exportUrl(voucherId, 'pdf')} target="_blank" rel="noopener noreferrer"><Download className="w-3.5 h-3.5" /> Baixar PDF</a>
          <a className={btnGhost} href={exportUrl(voucherId, 'png')} target="_blank" rel="noopener noreferrer"><Download className="w-3.5 h-3.5" /> Baixar PNG</a>
          {url && <button type="button" className={btnGhost} onClick={copyLink}><Copy className="w-3.5 h-3.5" /> Copiar link do voucher</button>}
          {url && <a className={btnGhost} href={url} target="_blank" rel="noopener noreferrer"><ExternalLink className="w-3.5 h-3.5" /> Abrir link</a>}
        </div>
      </div>
    </details>
  );
}
