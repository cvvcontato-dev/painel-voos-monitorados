import { useState } from 'react';
import { Eye, EyeOff, Sun, Moon, Settings, KeyRound, LogOut } from 'lucide-react';
import BottomSheet, { SheetItem } from './BottomSheet';
import ChangePasswordModal from '../ChangePasswordModal';
import { usePrivacy } from '../../hooks/usePrivacy';
import { logout } from '../../api/authClient';

const iniciais = (nome) => String(nome || '?').split(' ').filter(Boolean).slice(0, 2).map(n => n[0]).join('').toUpperCase() || '?';

/** Menu do cabeçalho no celular: reúne privacidade, tema, configurações, senha e sair. */
export default function MobileMenu({ user, theme, onToggleTheme, onOpenSettings, onToast }) {
  const [aberto, setAberto] = useState(false);
  const [senhaAberta, setSenhaAberta] = useState(false);
  const { enabled, toggle } = usePrivacy();
  const escuro = theme === 'dark';

  async function sair() {
    try { await logout(); } finally { window.location.reload(); }
  }

  return (
    <>
      <button type="button" onClick={() => setAberto(true)} aria-haspopup="dialog" aria-label="Abrir menu"
              className="w-11 h-11 rounded-full bg-indigo-600 text-white text-sm font-bold flex items-center justify-center shrink-0">
        {iniciais(user.nome)}
      </button>

      <BottomSheet open={aberto} onClose={() => setAberto(false)} title={String(user.nome || 'Usuário').split(' ')[0]}>
        <div className="px-3 pb-2 text-xs text-slate-500 dark:text-slate-400">{user.role === 'admin' ? 'Administrador' : 'Usuário'}</div>
        <SheetItem icon={enabled ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                   label={enabled ? 'Mostrar dados dos clientes' : 'Ocultar dados dos clientes'}
                   hint={enabled ? 'Modo privacidade ligado' : 'Modo privacidade desligado'} active={enabled}
                   onClick={() => { toggle(); setAberto(false); }} />
        <SheetItem icon={escuro ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                   label={escuro ? 'Tema claro' : 'Tema escuro'}
                   onClick={() => { onToggleTheme(); setAberto(false); }} />
        <SheetItem icon={<Settings className="w-5 h-5" />} label="Configurações"
                   onClick={() => { setAberto(false); onOpenSettings(); }} />
        <SheetItem icon={<KeyRound className="w-5 h-5" />} label="Trocar senha"
                   onClick={() => { setAberto(false); setSenhaAberta(true); }} />
        <SheetItem icon={<LogOut className="w-5 h-5" />} label="Sair" danger onClick={sair} />
      </BottomSheet>

      <ChangePasswordModal isOpen={senhaAberta} onClose={() => setSenhaAberta(false)} onToast={onToast} />
    </>
  );
}
