import { useRef, useState } from 'react';
import { UploadCloud, Loader2, Camera } from 'lucide-react';

const ACCEPT = 'application/pdf,image/png,image/jpeg,image/webp';
const OK_TYPES = ACCEPT.split(',');

// Zona de envio: clique, arrastar-e-soltar ou colar (Ctrl+V). Chama onFile(file).
export default function UploadZone({ onFile, loading = false, disabled = false, label, labelMobile, camera = true, showToast, loadingText = 'Lendo o voucher…' }) {
  const inputRef = useRef(null);
  const cameraRef = useRef(null);
  const [drag, setDrag] = useState(false);
  const [name, setName] = useState('');
  const blocked = loading || disabled;

  function take(file) {
    if (!file || blocked) return;
    if (!OK_TYPES.includes(file.type)) {
      showToast?.('Formato não aceito. Envie um PDF ou imagem (PNG, JPG ou WebP).', 'error');
      return;
    }
    setName(file.name || 'imagem colada');
    Promise.resolve(onFile(file)).finally(() => setName(''));
  }

  function open() {
    if (!blocked) inputRef.current?.click();
  }

  return (
    <div
      tabIndex={0}
      role="button"
      aria-busy={loading}
      aria-disabled={blocked}
      aria-label={label || 'Enviar voucher'}
      onClick={open}
      onKeyDown={e => { if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) { e.preventDefault(); open(); } }}
      onPaste={e => { const f = e.clipboardData?.files?.[0]; if (f) { e.preventDefault(); take(f); } }}
      onDragOver={e => { e.preventDefault(); if (!blocked) setDrag(true); }}
      onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setDrag(false); }}
      onDrop={e => { e.preventDefault(); setDrag(false); take(e.dataTransfer?.files?.[0]); }}
      className={`rounded-xl border-2 border-dashed p-6 text-center text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
        blocked ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'
      } ${drag ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-500/10' : 'border-slate-300 dark:border-slate-700 hover:border-indigo-400'
      } text-slate-600 dark:text-slate-300`}
    >
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        tabIndex={-1}
        aria-label="Arquivo do voucher"
        onClick={e => e.stopPropagation()}
        onChange={e => { take(e.target.files?.[0]); e.target.value = ''; }}
      />
      {camera && (
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          tabIndex={-1}
          aria-label="Fotografar o voucher"
          onClick={e => e.stopPropagation()}
          onChange={e => { take(e.target.files?.[0]); e.target.value = ''; }}
        />
      )}
      {loading ? (
        <div className="flex items-center justify-center gap-2"><Loader2 className="w-5 h-5 animate-spin" /> {loadingText}</div>
      ) : (
        <>
          <UploadCloud className="hidden md:block w-6 h-6 mx-auto mb-2 text-slate-400" />
          <div className="hidden md:block">{label || 'Clique, arraste ou, com esta área selecionada, cole (Ctrl+V) o voucher — PDF ou imagem'}</div>
          <div className="md:hidden">{labelMobile || 'Envie o voucher — PDF ou imagem'}</div>
          {camera && (
            <div className="md:hidden mt-3 flex flex-wrap gap-2 justify-center">
              <button type="button" disabled={blocked}
                      onClick={e => { e.stopPropagation(); if (!blocked) cameraRef.current?.click(); }}
                      className="min-h-[44px] px-4 inline-flex items-center gap-2 rounded-lg border text-sm font-medium disabled:opacity-50 border-indigo-300 text-indigo-600 dark:border-indigo-700 dark:text-indigo-300">
                <Camera className="w-4 h-4" /> Tirar foto
              </button>
              <button type="button" disabled={blocked}
                      onClick={e => { e.stopPropagation(); open(); }}
                      className="min-h-[44px] px-4 inline-flex items-center gap-2 rounded-lg border text-sm font-medium disabled:opacity-50 border-slate-300 text-slate-700 dark:border-slate-600 dark:text-slate-200">
                <UploadCloud className="w-4 h-4" /> Escolher arquivo
              </button>
            </div>
          )}
        </>
      )}
      {name && <div className="mt-2 text-xs text-slate-500 dark:text-slate-400 break-all">Arquivo: {name}</div>}
    </div>
  );
}
