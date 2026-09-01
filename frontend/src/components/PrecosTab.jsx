import { useState, useEffect, useCallback } from 'react';
import api from '../hooks/useApi';
import {
  Plane, Plus, Edit2, Trash2, ExternalLink, CheckCircle2, Circle,
  AlertCircle, Calendar, DollarSign, User, Link as LinkIcon, X,
  Users, GripVertical, RefreshCw, Mail, MessageSquare, TrendingDown, Clock, Bell,
  ShoppingBag, XCircle, LineChart as LineChartIcon, Filter, AlertTriangle, PiggyBank, Sparkles
} from 'lucide-react';
import { useForm } from 'react-hook-form';
import PriceHistoryChart from './PriceHistoryChart';

const API_URL = '/api/flights';
const PRIORIDADES = ['Urgente', 'Alta', 'Média', 'Baixa'];
const fmt = v => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

// Voos ativos sao verificados 2x ao dia; 2 dias sem sucesso ja indica problema.
const DIAS_DESATUALIZADO = 2;

function diasDesde(dateStr) {
  if (!dateStr) return null;
  const iso = dateStr.includes('T') ? dateStr : dateStr.replace(' ', 'T');
  const d = new Date(iso.endsWith('Z') ? iso : iso + 'Z');
  if (isNaN(d)) return null;
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}

function tempoAtras(dateStr) {
  if (!dateStr) return null;
  const iso = dateStr.includes('T') ? dateStr : dateStr.replace(' ', 'T');
  const d = new Date(iso.endsWith('Z') ? iso : iso + 'Z');
  if (isNaN(d)) return null;
  const mins = Math.floor((Date.now() - d.getTime()) / 60000);
  if (mins < 60) return `há ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `há ${hrs}h`;
  return `há ${Math.floor(hrs / 24)} dias`;
}

function timeAgo(dateStr) {
  const t = tempoAtras(dateStr);
  return t ? `Verificado ${t}` : null;
}

export default function PrecosTab({ showToast }) {
  const [flights, setFlights] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingFlight, setEditingFlight] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sortBy, setSortBy] = useState(() => {
    try { return localStorage.getItem('precos_sort_by') || 'proximidade'; }
    catch { return 'proximidade'; }
  });
  // Filtro por prioridade — Set vazio significa "todas"
  const [priorityFilter, setPriorityFilter] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem('precos_priority_filter') || '[]')); }
    catch { return new Set(); }
  });
  const [draggedIndex, setDraggedIndex] = useState(null);
  const [checkingId, setCheckingId] = useState(null);
  const [testingNotifId, setTestingNotifId] = useState(null);
  // Histórico de preços: quais cards estão expandidos + cache por voo
  const [expandedCharts, setExpandedCharts] = useState(() => new Set());
  const [historyData, setHistoryData] = useState({});
  const [historyState, setHistoryState] = useState({});

  // Estatisticas do historico para sugerir um alvo realista ao editar um voo.
  const [priceStats, setPriceStats] = useState(null);

  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm();

  const fetchFlights = useCallback(async () => {
    setIsLoading(true);
    try { setFlights((await api.get(API_URL)).data); }
    catch (e) { console.error('Error fetching flights', e); }
    finally { setIsLoading(false); }
  }, []);

  useEffect(() => { fetchFlights(); }, [fetchFlights]);

  const carregarPriceStats = async (flightId) => {
    try {
      const { data } = await api.get(`${API_URL}/${flightId}/price-stats?days=60`);
      setPriceStats(data);
    } catch { setPriceStats(null); }
  };

  const openModal = (flight = null) => {
    setPriceStats(null);
    if (flight) {
      setEditingFlight(flight);
      Object.keys(flight).forEach(k => setValue(k, flight[k]));
      carregarPriceStats(flight.id);
    } else {
      setEditingFlight(null);
      reset({ cliente: '', mes_viagem: '', prioridade: '', preco_esperado: '', link_voo: '', quantidade_pax: 1, email_cliente: '', telegram_chat_id: '', status: 'ativo' });
    }
    setIsModalOpen(true);
  };

  const closeModal = () => { setIsModalOpen(false); setEditingFlight(null); setPriceStats(null); reset(); };

  const onSubmit = async (data) => {
    try {
      const payload = { ...data, preco_esperado: parseFloat(data.preco_esperado), quantidade_pax: parseInt(data.quantidade_pax || 1, 10), check_diario: !!data.check_diario };
      if (editingFlight) { await api.put(`${API_URL}/${editingFlight.id}`, payload); }
      else { payload.posicao = flights.length > 0 ? Math.max(...flights.map(f => f.posicao || 0)) + 1 : 0; await api.post(API_URL, payload); }
      fetchFlights(); closeModal(); showToast('Voo salvo com sucesso!', 'success');
    } catch (error) {
      if (error.response?.status === 409) showToast('Este link já está cadastrado!', 'error');
      else showToast(error.response?.data?.error || 'Erro ao salvar o voo.', 'error');
    }
  };

  const deleteFlight = async (id) => {
    if (window.confirm('Tem certeza que deseja excluir este voo?')) {
      try { await api.delete(`${API_URL}/${id}`); fetchFlights(); showToast('Voo excluído', 'success'); }
      catch (e) { console.error(e); }
    }
  };

  const toggleCheck = async (flight) => {
    try { await api.put(`${API_URL}/${flight.id}`, { ...flight, check_diario: !flight.check_diario }); fetchFlights(); }
    catch (e) { console.error(e); }
  };

  const toggleAllChecks = async () => {
    try { await api.put(`${API_URL}/bulk-check`, { check_diario: flights.some(f => !f.check_diario) }); fetchFlights(); }
    catch (e) { console.error(e); }
  };

  const testNotification = async (id) => {
    setTestingNotifId(id);
    try {
      const { data } = await api.post(`${API_URL}/${id}/test-notification`);
      const lines = [];
      if (data.email?.sucesso) lines.push('✓ E-mail enviado');
      else lines.push(`✗ E-mail: ${data.email?.erro || 'falha'}`);
      if (data.telegram?.sucesso) lines.push('✓ Telegram enviado');
      else lines.push(`✗ Telegram: ${data.telegram?.erro || 'falha'}`);

      const envMissing = Object.entries(data.env || {}).filter(([, v]) => !v).map(([k]) => k);
      if (envMissing.length > 0) {
        lines.push(`⚠ Env faltando no servidor: ${envMissing.join(', ')}`);
      }

      const success = data.email?.sucesso || data.telegram?.sucesso;
      showToast(lines.join(' | '), success ? 'success' : 'error');
    } catch (e) {
      showToast(`Erro ao testar: ${e.response?.data?.error || e.message}`, 'error');
    } finally {
      setTestingNotifId(null);
    }
  };

  const loadHistory = useCallback(async (flightId) => {
    setHistoryState(s => ({ ...s, [flightId]: 'loading' }));
    try {
      const { data } = await api.get(`${API_URL}/${flightId}/history?days=60`);
      setHistoryData(d => ({ ...d, [flightId]: data }));
      setHistoryState(s => ({ ...s, [flightId]: 'ok' }));
    } catch (e) {
      setHistoryState(s => ({ ...s, [flightId]: 'error:' + (e.response?.data?.error || e.message) }));
    }
  }, []);

  const toggleChart = (flightId) => {
    const willOpen = !expandedCharts.has(flightId);
    setExpandedCharts(prev => {
      const next = new Set(prev);
      if (willOpen) next.add(flightId); else next.delete(flightId);
      return next;
    });
    if (willOpen && !historyData[flightId]) loadHistory(flightId);
  };

  const checkNow = async (id) => {
    setCheckingId(id);
    try {
      const { data } = await api.post(`${API_URL}/${id}/check-now`);
      if (data.bloqueado) showToast('Google Voos bloqueou o acesso. Tente novamente mais tarde.', 'warning');
      else if (!data.sucesso) showToast(data.erro || 'Falha ao verificar preço', 'error');
      else { showToast(`Preço encontrado: ${fmt(data.preco_encontrado)}${data.alerta_disparado ? ' — Alerta enviado!' : ''}`, 'success'); }
      fetchFlights();
      // O check gera um novo ponto no histórico: recarrega se aberto, senão descarta o cache.
      if (expandedCharts.has(id)) loadHistory(id);
      else setHistoryData(d => { const n = { ...d }; delete n[id]; return n; });
    } catch (e) { showToast('Erro ao verificar preço', 'error'); }
    finally { setCheckingId(null); }
  };

  const setStatus = async (flight, newStatus) => {
    try {
      await api.put(`${API_URL}/${flight.id}`, { ...flight, status: newStatus });
      fetchFlights();
      const labels = { 'passagem comprada': '✅ Passagem comprada!', 'encerrado': '❌ Marcado como desistência', 'ativo': 'Voo reativado' };
      showToast(labels[newStatus] || 'Status atualizado', 'success');
    } catch (e) { showToast('Erro ao atualizar status', 'error'); }
  };

  const getStatusStyle = (status) => {
    switch (status) {
      case 'passagem comprada': return { cls: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/25', icon: <ShoppingBag className="w-3 h-3" />, label: 'Comprado' };
      case 'encerrado':         return { cls: 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-700/40 dark:text-slate-400 dark:border-slate-600/40',           icon: <XCircle className="w-3 h-3" />,    label: 'Desistência' };
      default:                  return null;
    }
  };

  const changeSort = (value) => {
    setSortBy(value);
    try { localStorage.setItem('precos_sort_by', value); } catch { /* ignore */ }
  };

  const persistFilter = (set) => {
    try { localStorage.setItem('precos_priority_filter', JSON.stringify([...set])); } catch { /* ignore */ }
  };

  const togglePriority = (p) => {
    setPriorityFilter(prev => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p); else next.add(p);
      persistFilter(next);
      return next;
    });
  };

  const clearPriorityFilter = () => {
    const empty = new Set();
    setPriorityFilter(empty);
    persistFilter(empty);
  };

  // Arrastar so faz sentido na ordenacao manual e sem filtro ativo: os indices do
  // drag apontam para a lista completa, entao com filtro a reordenacao corromperia.
  const dragEnabled = sortBy === 'manual' && priorityFilter.size === 0;

  const handleDragStart = (e, i) => { if (!dragEnabled) return; setDraggedIndex(i); e.dataTransfer.effectAllowed = 'move'; };
  const handleDragOver = (e, i) => {
    if (!dragEnabled) return; e.preventDefault();
    if (draggedIndex === null || draggedIndex === i) return;
    const n = [...sortedFlights];
    const [movido] = n.splice(draggedIndex, 1);
    n.splice(i, 0, movido);
    setFlights(n); setDraggedIndex(i);
  };
  const handleDragEnd = async () => { setDraggedIndex(null); try { await api.put(`${API_URL}/reorder`, { ids: flights.map(f => f.id) }); } catch (e) { console.error(e); } };

  const priorityRank = { 'Urgente': 4, 'Alta': 3, 'Média': 2, 'Baixa': 1 };
  const parseTravelDate = (s) => {
    if (!s) return new Date(0);
    const p = s.split('/'); if (p.length < 2) return new Date(0);
    const m = p[0].trim().toLowerCase();
    const mMap = { 'jan': 0, 'janeiro': 0, 'fev': 1, 'fevereiro': 1, 'mar': 2, 'março': 2, 'abr': 3, 'abril': 3, 'mai': 4, 'maio': 4, 'jun': 5, 'junho': 5, 'jul': 6, 'julho': 6, 'ago': 7, 'agosto': 7, 'set': 8, 'setembro': 8, 'out': 9, 'outubro': 9, 'nov': 10, 'novembro': 10, 'dez': 11, 'dezembro': 11 };
    let mo = 0; for (const k in mMap) { if (m.startsWith(k)) { mo = mMap[k]; break; } }
    let y = parseInt(p[1].trim(), 10); if (p[1].trim().length === 2) y += 2000;
    return new Date(y, mo, 1);
  };

  const getPriorityColor = (p) => {
    switch (p) {
      case 'Urgente': return 'bg-red-50 text-red-700 border border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20';
      case 'Alta':    return 'bg-orange-50 text-orange-600 border border-orange-200 dark:bg-orange-500/10 dark:text-orange-400 dark:border-orange-500/20';
      case 'Média':   return 'bg-indigo-50 text-indigo-600 border border-indigo-200 dark:bg-indigo-500/10 dark:text-indigo-400 dark:border-indigo-500/20';
      case 'Baixa':   return 'bg-slate-100 text-slate-500 border border-slate-200 dark:bg-slate-700/40 dark:text-slate-400 dark:border-slate-600/40';
      default:        return 'bg-slate-50 text-slate-600 border border-slate-200 dark:bg-slate-500/10 dark:text-slate-400 dark:border-slate-500/20';
    }
  };

  // Distancia relativa ate a meta: preco_atual / preco_alvo.
  // < 1 = ja abaixo do alvo (oportunidade). Voos sem preco coletado vao para o fim.
  // Faixas fixas por status: ativos no topo, comprados abaixo, desistencias por ultimo.
  // Vale para qualquer ordenacao — status sempre vence o criterio escolhido.
  const statusRank = (f) =>
    f.status === 'encerrado' ? 2 : f.status === 'passagem comprada' ? 1 : 0;

  const targetRatio = (f) => {
    if (f.preco_atual == null || !f.preco_esperado) return Infinity;
    return f.preco_atual / f.preco_esperado;
  };

  const visibleFlights = priorityFilter.size === 0
    ? flights
    : flights.filter(f => priorityFilter.has(f.prioridade));

  const sortedFlights = [...visibleFlights].sort((a, b) => {
    const faixa = statusRank(a) - statusRank(b);
    if (faixa !== 0) return faixa;
    if (sortBy === 'proximidade') {
      const ra = targetRatio(a), rb = targetRatio(b);
      // ra !== rb evita Infinity - Infinity = NaN quando ambos estao sem preco
      if (ra !== rb) return ra - rb;
      return (priorityRank[b.prioridade] || 0) - (priorityRank[a.prioridade] || 0);
    }
    if (sortBy === 'priority') return (priorityRank[b.prioridade] || 0) - (priorityRank[a.prioridade] || 0);
    if (sortBy === 'date') return parseTravelDate(a.mes_viagem) - parseTravelDate(b.mes_viagem);
    return 0;
  });

  // Economia usa preco_compra (congelado na compra), nunca preco_atual — que
  // continuaria mudando e daria a economia de hoje, nao a do dia da compra.
  const economiaDoVoo = (f) =>
    f.preco_compra == null ? null
      : (f.preco_esperado - f.preco_compra) * (f.quantidade_pax || 1);

  const comprados = flights.filter(f => f.status === 'passagem comprada');
  const compradosComPreco = comprados.filter(f => f.preco_compra != null);
  const economiaTotal = compradosComPreco.reduce((acc, f) => acc + economiaDoVoo(f), 0);

  // Percentil exige alguma massa de dados; abaixo disso a sugestao seria ruido.
  const MIN_AMOSTRAS_SUGESTAO = 4;
  const temSugestao = !!priceStats && priceStats.amostras >= MIN_AMOSTRAS_SUGESTAO;
  const alvoDigitado = parseFloat(watch('preco_esperado'));
  const avisoAlvo = temSugestao && Number.isFinite(alvoDigitado)
    ? (alvoDigitado < priceStats.min
        ? `Esse alvo está abaixo do menor preço já visto no período (${fmt(priceStats.min)}) — o alerta pode nunca disparar.`
        : alvoDigitado > priceStats.max
          ? `Esse alvo está acima do maior preço do período (${fmt(priceStats.max)}) — o alerta dispararia em toda verificação.`
          : null)
    : null;

  const comFalha = flights.filter(f => f.status === 'ativo' && (f.falhas_consecutivas || 0) > 0).length;

  const allChecked = flights.length > 0 && flights.every(f => f.check_diario);

  // Grid columns: drag | cliente | viagem | prioridade | preço alvo | preço atual | check | ações
  const gridStyle = {
    display: 'grid',
    gap: '1rem',
    alignItems: 'center',
    gridTemplateColumns: dragEnabled
      ? '28px minmax(0,1.8fr) minmax(0,0.9fr) 80px 130px minmax(0,1.1fr) 44px 232px'
      : 'minmax(0,1.8fr) minmax(0,0.9fr) 80px 130px minmax(0,1.1fr) 44px 232px',
  };

  const inputCls = "w-full px-4 py-2.5 rounded-lg transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent border " +
    "bg-white text-slate-900 placeholder-slate-400 border-slate-300 " +
    "dark:bg-slate-800/50 dark:text-slate-100 dark:placeholder-slate-400 dark:border-slate-700";

  return (
    <>
      {/* ── Toolbar ── */}
      <div className="flex justify-end mb-4">
        <button
          onClick={() => openModal()}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2.5 rounded-lg font-medium transition-all shadow-lg shadow-indigo-500/25 cursor-pointer active:scale-95"
        >
          <Plus className="w-4 h-4" /> Novo Voo
        </button>
      </div>

      {/* ── Stats ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        {/* Total */}
        <div className="bg-white/80 border border-slate-200 dark:bg-slate-900/40 dark:backdrop-blur-xl dark:border-slate-800/50 p-4 rounded-xl flex items-center gap-3">
          <div className="bg-indigo-500/10 p-2.5 rounded-lg text-indigo-400 border border-indigo-500/20 shrink-0"><Plane className="w-4 h-4" /></div>
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">Total</div>
            <div className="text-lg font-bold text-slate-900 dark:text-white">{flights.filter(f => f.status === 'ativo').length}</div>
          </div>
        </div>
        {/* Compradas */}
        <div className="bg-white/80 border border-emerald-200/60 dark:bg-slate-900/40 dark:backdrop-blur-xl dark:border-emerald-800/30 p-4 rounded-xl flex items-center gap-3">
          <div className="bg-emerald-500/10 p-2.5 rounded-lg text-emerald-500 border border-emerald-500/20 shrink-0"><ShoppingBag className="w-4 h-4" /></div>
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">Compradas</div>
            <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{comprados.length}</div>
            {compradosComPreco.length > 0 && (
              <div
                className="flex items-center gap-1 text-[10px] font-semibold text-emerald-600/80 dark:text-emerald-400/80 mt-0.5"
                title={`Soma de (preço-alvo − preço pago) × pax em ${compradosComPreco.length} de ${comprados.length} compra(s) com preço registrado`}
              >
                <PiggyBank className="w-2.5 h-2.5 shrink-0" />
                {economiaTotal >= 0 ? `${fmt(economiaTotal)} economizados` : `${fmt(Math.abs(economiaTotal))} acima do alvo`}
              </div>
            )}
          </div>
        </div>
        {/* Desistências */}
        <div className="bg-white/80 border border-slate-200 dark:bg-slate-900/40 dark:backdrop-blur-xl dark:border-slate-800/50 p-4 rounded-xl flex items-center gap-3">
          <div className="bg-slate-500/10 p-2.5 rounded-lg text-slate-400 border border-slate-500/20 shrink-0"><XCircle className="w-4 h-4" /></div>
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">Desistências</div>
            <div className="text-lg font-bold text-slate-600 dark:text-slate-300">{flights.filter(f => f.status === 'encerrado').length}</div>
          </div>
        </div>
        {/* Checks */}
        <div className="bg-white/80 border border-slate-200 dark:bg-slate-900/40 dark:backdrop-blur-xl dark:border-slate-800/50 p-4 rounded-xl flex items-center gap-3">
          <div className="bg-indigo-500/10 p-2.5 rounded-lg text-indigo-400 border border-indigo-500/20 shrink-0"><CheckCircle2 className="w-4 h-4" /></div>
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">Checks</div>
            <div className="text-lg font-bold text-slate-900 dark:text-white">{flights.filter(f => f.check_diario).length}<span className="text-xs font-normal text-slate-400 dark:text-slate-500">/{flights.length}</span></div>
          </div>
        </div>
        {/* Com falha */}
        <div className={`bg-white/80 dark:bg-slate-900/40 dark:backdrop-blur-xl p-4 rounded-xl flex items-center gap-3 border ${
          comFalha > 0 ? 'border-red-200/70 dark:border-red-800/40' : 'border-slate-200 dark:border-slate-800/50'
        }`}>
          <div className={`p-2.5 rounded-lg border shrink-0 ${
            comFalha > 0 ? 'bg-red-500/10 text-red-500 border-red-500/20' : 'bg-slate-500/10 text-slate-400 border-slate-500/20'
          }`}><AlertTriangle className="w-4 h-4" /></div>
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">Com falha</div>
            <div className={`text-lg font-bold ${comFalha > 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-white'}`}>{comFalha}</div>
          </div>
        </div>
        {/* Ordenar */}
        <div className="bg-white/80 border border-slate-200 dark:bg-slate-900/40 dark:backdrop-blur-xl dark:border-slate-800/50 p-4 rounded-xl flex items-center gap-3">
          <div className="bg-indigo-500/10 p-2.5 rounded-lg text-indigo-400 border border-indigo-500/20 shrink-0"><span className="text-xs font-bold font-mono">ORD</span></div>
          <div className="w-full">
            <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">Ordenar por</div>
            <select value={sortBy} onChange={e => changeSort(e.target.value)}
              className="bg-transparent border-0 text-sm font-bold text-slate-900 dark:text-white focus:ring-0 focus:outline-none cursor-pointer w-full mt-0.5">
              <option value="proximidade" className="bg-white dark:bg-slate-900">Proximidade da meta 🎯</option>
              <option value="manual" className="bg-white dark:bg-slate-900">Manual ↕</option>
              <option value="priority" className="bg-white dark:bg-slate-900">Prioridade ★</option>
              <option value="date" className="bg-white dark:bg-slate-900">Data Viagem 📅</option>
            </select>
          </div>
        </div>
      </div>

      {/* Filtro por prioridade */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
          <Filter className="w-3.5 h-3.5" /> Prioridade
        </span>
        {PRIORIDADES.map(p => {
          const active = priorityFilter.has(p);
          const count = flights.filter(f => f.prioridade === p).length;
          return (
            <button
              key={p}
              onClick={() => togglePriority(p)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold rounded-md transition-all cursor-pointer ${
                active
                  ? `${getPriorityColor(p)} ring-2 ring-indigo-400/50 dark:ring-indigo-500/40`
                  : 'bg-white text-slate-500 border border-slate-200 hover:border-slate-300 dark:bg-slate-800/60 dark:text-slate-400 dark:border-slate-700 dark:hover:border-slate-600'
              }`}
              title={active ? `Remover filtro: ${p}` : `Filtrar por ${p}`}
            >
              {p}<span className="opacity-60 font-mono">{count}</span>
            </button>
          );
        })}
        {priorityFilter.size > 0 && (
          <>
            <button
              onClick={clearPriorityFilter}
              className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-md text-slate-500 hover:text-slate-700 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-700/50 transition-colors cursor-pointer"
            >
              <X className="w-3 h-3" /> Limpar
            </button>
            <span className="text-[11px] text-slate-400 dark:text-slate-500">
              {sortedFlights.length} de {flights.length} voos
            </span>
          </>
        )}
        {sortBy === 'manual' && priorityFilter.size > 0 && (
          <span className="text-[11px] text-amber-600 dark:text-amber-400">
            Reordenação manual desativada com filtro ativo
          </span>
        )}
      </div>
      {/* ── Card Table ── */}
      <div className="space-y-1.5">

        {/* Column Headers */}
        <div style={gridStyle} className="px-4 py-2">
          {dragEnabled && <div />}
          <div className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Cliente</div>
          <div className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Viagem</div>
          <div className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Prior.</div>
          <div className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Preço Alvo</div>
          <div className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Preço Atual</div>
          {/* Check header with toggle button */}
          <div className="flex flex-col items-center gap-1">
            <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Check</span>
            <button
              onClick={toggleAllChecks}
              className="text-[9px] font-bold px-1.5 py-0.5 rounded border border-indigo-400/30 text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10 transition-colors cursor-pointer whitespace-nowrap"
              title={allChecked ? 'Desmarcar todos' : 'Marcar todos'}
            >
              {allChecked ? 'DESMARCAR' : 'MARCAR'} ALL
            </button>
          </div>
          <div className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider text-right">Ações</div>
        </div>

        {/* Rows */}
        {isLoading ? (
          <div className="flex justify-center items-center gap-2.5 py-20 text-slate-400 dark:text-slate-500">
            <div className="w-5 h-5 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
            Carregando...
          </div>
        ) : sortedFlights.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400 dark:text-slate-500">
            <Plane className="w-10 h-10 mb-3 opacity-30" />
            <p className="text-sm">
              {flights.length === 0
                ? 'Nenhum voo sendo monitorado.'
                : 'Nenhum voo com a prioridade selecionada.'}
            </p>
            {flights.length > 0 && (
              <button onClick={clearPriorityFilter} className="mt-2 text-xs text-indigo-500 hover:text-indigo-400 underline cursor-pointer">
                Limpar filtro
              </button>
            )}
          </div>
        ) : sortedFlights.map((flight, index) => {
          const hasPrice = flight.preco_atual != null;
          const isAlert = hasPrice && flight.preco_atual <= flight.preco_esperado;
          const isDragged = draggedIndex === index;
          const statusStyle = getStatusStyle(flight.status);
          const isClosed = flight.status === 'encerrado';
          const isBought = flight.status === 'passagem comprada';
          const chartOpen = expandedCharts.has(flight.id);
          const falhas = flight.falhas_consecutivas || 0;
          const diasSemCheck = diasDesde(flight.ultima_verificacao);
          // Só alerta de "desatualizado" quando já houve alguma verificação:
          // voo recém-cadastrado ainda não passou pelo agendador.
          const desatualizado = flight.status === 'ativo' && falhas === 0
            && diasSemCheck !== null && diasSemCheck >= DIAS_DESATUALIZADO;

          return (
            <div
              key={flight.id}
              draggable={dragEnabled}
              onDragStart={e => handleDragStart(e, index)}
              onDragOver={e => handleDragOver(e, index)}
              onDragEnd={handleDragEnd}
              className={`
                relative border rounded-xl overflow-hidden
                transition-all duration-200 group
                ${isDragged ? 'opacity-30 border-indigo-400/40 dark:border-indigo-500/30' :
                  isBought  ? 'bg-emerald-50/50 dark:bg-emerald-900/10 border-emerald-200/60 dark:border-emerald-700/30 hover:shadow-emerald-100/50 dark:hover:shadow-emerald-900/30' :
                  isClosed  ? 'bg-slate-50/80 dark:bg-slate-800/30 border-slate-200/60 dark:border-slate-700/30 opacity-60 hover:opacity-80' :
                  'bg-white dark:bg-slate-800/60 border-slate-200/80 dark:border-slate-700/50 hover:-translate-y-px hover:shadow-md hover:shadow-slate-200/60 dark:hover:shadow-slate-900/60 hover:border-slate-300/80 dark:hover:border-slate-600/60'
                }
                ${dragEnabled ? 'cursor-move' : ''}
              `}
            >
              {/* Left accent bar — status do cliente tem prioridade sobre preço */}
              <div className={`absolute left-0 top-0 bottom-0 w-[3px] ${
                isBought  ? 'bg-emerald-400 dark:bg-emerald-500' :
                isClosed  ? 'bg-slate-300 dark:bg-slate-600' :
                hasPrice  ? (isAlert ? 'bg-emerald-400 dark:bg-emerald-500' : 'bg-amber-400 dark:bg-amber-500') : ''
              }`} />

              {/* Right gradient */}
              {!isBought && !isClosed && hasPrice && (
                <div className={`absolute right-0 top-0 bottom-0 w-40 pointer-events-none bg-gradient-to-l ${isAlert ? 'from-emerald-500/[0.06]' : 'from-amber-500/[0.06]'} to-transparent`} />
              )}

              {/* Row content */}
              <div style={gridStyle} className="relative px-4 py-3.5">

                {/* Drag handle */}
                {dragEnabled && (
                  <div className="text-slate-300 dark:text-slate-600 group-hover:text-slate-400 dark:group-hover:text-slate-500 transition-colors flex justify-center">
                    <GripVertical className="w-4 h-4 cursor-grab" />
                  </div>
                )}

                {/* Cliente */}
                <div className="min-w-0">
                  <div className="font-semibold text-slate-800 dark:text-slate-100 truncate pii">{flight.cliente}</div>
                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                    <Users className="w-3 h-3 text-slate-400 dark:text-slate-500 shrink-0" />
                    <span className="text-xs text-slate-500 dark:text-slate-400">{flight.quantidade_pax || 1} pax</span>
                    {flight.email_cliente && <Mail className="w-3 h-3 text-slate-400 dark:text-slate-500" />}
                    {flight.telegram_chat_id && <MessageSquare className="w-3 h-3 text-slate-400 dark:text-slate-500" />}
                    {statusStyle && (
                      <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded border ${statusStyle.cls}`}>
                        {statusStyle.icon} {statusStyle.label}
                      </span>
                    )}
                    {isBought && economiaDoVoo(flight) != null && (
                      <span
                        className={`inline-flex items-center gap-1 text-[10px] font-semibold ${
                          economiaDoVoo(flight) >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'
                        }`}
                        title={`Pago ${fmt(flight.preco_compra)} · alvo ${fmt(flight.preco_esperado)} · ${flight.quantidade_pax || 1} pax`}
                      >
                        <PiggyBank className="w-2.5 h-2.5 shrink-0" />
                        {economiaDoVoo(flight) >= 0
                          ? `economia ${fmt(economiaDoVoo(flight))}`
                          : `${fmt(Math.abs(economiaDoVoo(flight)))} acima do alvo`}
                      </span>
                    )}
                  </div>
                </div>

                {/* Viagem */}
                <div className="min-w-0">
                  <span className="text-sm text-slate-600 dark:text-slate-300 truncate block">{flight.mes_viagem}</span>
                </div>

                {/* Prioridade */}
                <div>
                  <span className={`inline-block px-2 py-0.5 text-[11px] font-semibold rounded-md ${getPriorityColor(flight.prioridade)}`}>
                    {flight.prioridade}
                  </span>
                </div>

                {/* Preço Alvo */}
                <div>
                  <span className="font-mono text-sm font-medium text-slate-600 dark:text-slate-400">
                    {fmt(flight.preco_esperado)}
                  </span>
                </div>

                {/* Preço Atual */}
                <div className="min-w-0">
                  {hasPrice ? (
                    <div className="space-y-1">
                      <div className={`font-mono text-sm font-bold ${isAlert ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-700 dark:text-slate-200'}`}>
                        {fmt(flight.preco_atual)}
                      </div>
                      <div className="flex items-center gap-1.5">
                        {isAlert ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-400 dark:border-emerald-500/25 px-2 py-0.5 rounded-md">
                            <TrendingDown className="w-2.5 h-2.5" /> ALERTA
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/25 px-2 py-0.5 rounded-md">
                            <Clock className="w-2.5 h-2.5" /> AGUARDAR
                          </span>
                        )}
                      </div>
                      {flight.ultima_verificacao && (
                        <div className="text-[10px] text-slate-400 dark:text-slate-500">{timeAgo(flight.ultima_verificacao)}</div>
                      )}
                    </div>
                  ) : (
                    <span className="text-slate-300 dark:text-slate-600 text-sm">—</span>
                  )}
                  {flight.status === 'ativo' && falhas > 0 && (
                    <div
                      className="flex items-center gap-1 text-[10px] font-semibold text-red-600 dark:text-red-400 mt-1"
                      title={`${flight.ultimo_erro || 'Falha na verificação'}${flight.ultima_falha ? ` — última tentativa ${tempoAtras(flight.ultima_falha)}` : ''}`}
                    >
                      <AlertTriangle className="w-2.5 h-2.5 shrink-0" />
                      {falhas} {falhas === 1 ? 'falha' : 'falhas'} seguidas
                    </div>
                  )}
                  {desatualizado && (
                    <div
                      className="flex items-center gap-1 text-[10px] font-semibold text-amber-600 dark:text-amber-400 mt-1"
                      title={`Sem verificação bem-sucedida há ${diasSemCheck} dias`}
                    >
                      <AlertTriangle className="w-2.5 h-2.5 shrink-0" /> desatualizado
                    </div>
                  )}
                </div>

                {/* Check */}
                <div className="flex justify-center">
                  <button
                    onClick={() => toggleCheck(flight)}
                    className={`transition-all rounded-full p-1 cursor-pointer ${flight.check_diario
                      ? 'text-indigo-500 hover:text-indigo-400 bg-indigo-500/10 hover:bg-indigo-500/20'
                      : 'text-slate-300 dark:text-slate-600 hover:text-slate-500 dark:hover:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700/50'
                    }`}
                    title={flight.check_diario ? 'Desmarcar check' : 'Marcar check'}
                  >
                    {flight.check_diario ? <CheckCircle2 className="w-5 h-5" /> : <Circle className="w-5 h-5" />}
                  </button>
                </div>

                {/* Ações */}
                <div className={`flex justify-end items-center gap-0.5 transition-opacity duration-150 ${
                  chartOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                }`}>
                  <button
                    onClick={() => toggleChart(flight.id)}
                    className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                      chartOpen
                        ? 'text-indigo-600 bg-indigo-50 dark:text-indigo-400 dark:bg-indigo-500/15'
                        : 'text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:text-indigo-400 dark:hover:bg-indigo-500/10'
                    }`}
                    title={chartOpen ? 'Ocultar histórico de preços' : 'Ver histórico de preços (60 dias)'}
                  >
                    <LineChartIcon className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => testNotification(flight.id)}
                    disabled={testingNotifId === flight.id}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-violet-600 hover:bg-violet-50 dark:hover:text-violet-400 dark:hover:bg-violet-500/10 transition-colors disabled:opacity-40 cursor-pointer"
                    title="Enviar notificação de teste (email + telegram)"
                  >
                    <Bell className={`w-3.5 h-3.5 ${testingNotifId === flight.id ? 'animate-pulse' : ''}`} />
                  </button>
                  <button
                    onClick={() => checkNow(flight.id)}
                    disabled={checkingId === flight.id}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:text-amber-400 dark:hover:bg-amber-500/10 transition-colors disabled:opacity-40 cursor-pointer"
                    title="Verificar agora"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${checkingId === flight.id ? 'animate-spin' : ''}`} />
                  </button>
                  <a
                    href={flight.link_voo}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:text-white dark:hover:bg-slate-700/50 transition-colors"
                    title="Abrir no Google Voos"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                  {/* Ação rápida de status */}
                  {flight.status !== 'passagem comprada' && (
                    <button
                      onClick={() => setStatus(flight, 'passagem comprada')}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:text-emerald-400 dark:hover:bg-emerald-500/10 transition-colors cursor-pointer"
                      title="Marcar como passagem comprada"
                    >
                      <ShoppingBag className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {flight.status !== 'encerrado' && (
                    <button
                      onClick={() => setStatus(flight, 'encerrado')}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:text-slate-300 dark:hover:bg-slate-700/50 transition-colors cursor-pointer"
                      title="Marcar como desistência"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {(flight.status === 'passagem comprada' || flight.status === 'encerrado') && (
                    <button
                      onClick={() => setStatus(flight, 'ativo')}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:text-indigo-400 dark:hover:bg-indigo-500/10 transition-colors cursor-pointer"
                      title="Reativar monitoramento"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    onClick={() => openModal(flight)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:text-blue-400 dark:hover:bg-blue-500/10 transition-colors cursor-pointer"
                    title="Editar"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => deleteFlight(flight.id)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:text-red-400 dark:hover:bg-red-500/10 transition-colors cursor-pointer"
                    title="Excluir"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

              </div>

              {/* Histórico de preços (expansível) */}
              {chartOpen && (
                <div
                  className="relative border-t border-slate-200/80 dark:border-slate-700/50 bg-slate-50/60 dark:bg-slate-900/30 px-4 py-4"
                  onDragStart={e => { e.preventDefault(); e.stopPropagation(); }}
                >
                  <div className="flex items-center gap-2 mb-3">
                    <LineChartIcon className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400" />
                    <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      Histórico de preços — últimos 60 dias
                    </span>
                  </div>
                  <PriceHistoryChart
                    data={historyData[flight.id]}
                    targetPrice={flight.preco_esperado}
                    loading={historyState[flight.id] === 'loading'}
                    error={
                      typeof historyState[flight.id] === 'string' && historyState[flight.id].startsWith('error:')
                        ? historyState[flight.id].slice(6)
                        : null
                    }
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Modal ── */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/50 dark:bg-slate-950/80 backdrop-blur-sm" onClick={closeModal} />
          <div className="relative w-full max-w-lg bg-white border border-slate-200 dark:bg-slate-900/60 dark:backdrop-blur-xl dark:border-slate-700/50 shadow-2xl rounded-2xl overflow-hidden modal-animate max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center p-6 border-b border-slate-200 dark:border-slate-700/50">
              <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
                {editingFlight ? 'Editar Voo' : 'Adicionar Novo Voo'}
              </h2>
              <button onClick={closeModal} className="text-slate-400 hover:text-slate-700 dark:hover:text-white transition-colors cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-2 space-y-1">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2"><User className="w-4 h-4" /> Cliente</label>
                  <input {...register('cliente', { required: true })} className={inputCls} placeholder="Nome do cliente" />
                  {errors.cliente && <span className="text-xs text-red-700 dark:text-red-400">Obrigatório</span>}
                </div>
                <div className="col-span-1 space-y-1">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2"><Users className="w-4 h-4" /> Pax</label>
                  <input type="number" min="1" {...register('quantidade_pax', { required: true, min: 1 })} className={inputCls} placeholder="1" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2"><Calendar className="w-4 h-4" /> Mês da Viagem</label>
                  <input {...register('mes_viagem', { required: true })} className={inputCls} placeholder="Ex: Janeiro/2025" />
                  {errors.mes_viagem && <span className="text-xs text-red-700 dark:text-red-400">Obrigatório</span>}
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2"><AlertCircle className="w-4 h-4" /> Prioridade</label>
                  <select {...register('prioridade', { required: true })} className={`${inputCls} appearance-none`}>
                    <option value="" className="bg-white dark:bg-slate-900">Selecione...</option>
                    <option value="Urgente" className="bg-white dark:bg-slate-900">Urgente</option>
                    <option value="Alta" className="bg-white dark:bg-slate-900">Alta</option>
                    <option value="Média" className="bg-white dark:bg-slate-900">Média</option>
                    <option value="Baixa" className="bg-white dark:bg-slate-900">Baixa</option>
                  </select>
                  {errors.prioridade && <span className="text-xs text-red-700 dark:text-red-400">Obrigatório</span>}
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2"><DollarSign className="w-4 h-4" /> Preço Esperado (R$)</label>
                <input type="number" step="0.01" {...register('preco_esperado', { required: true, min: 0 })} className={inputCls} placeholder="2500.00" />
                {errors.preco_esperado && <span className="text-xs text-red-700 dark:text-red-400">Preço inválido</span>}

                {editingFlight && temSugestao && (
                  <div className="mt-2 rounded-lg border border-indigo-200 bg-indigo-50/60 dark:border-indigo-500/25 dark:bg-indigo-500/10 p-3 space-y-2">
                    <div className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-300">
                      <Sparkles className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400 shrink-0 mt-0.5" />
                      <span>
                        Nos últimos {priceStats.dias} dias este voo variou entre{' '}
                        <strong className="font-mono">{fmt(priceStats.min)}</strong> e{' '}
                        <strong className="font-mono">{fmt(priceStats.max)}</strong>
                        {' '}(média <span className="font-mono">{fmt(priceStats.media)}</span>, {priceStats.amostras} verificações).
                      </span>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={() => setValue('preco_esperado', priceStats.sugerido, { shouldDirty: true, shouldValidate: true })}
                        className="px-2.5 py-1 text-[11px] font-semibold rounded-md bg-indigo-600 hover:bg-indigo-500 text-white transition-colors cursor-pointer active:scale-95"
                      >
                        Usar {fmt(priceStats.sugerido)}
                      </button>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400">
                        preço do quarto mais barato do período
                      </span>
                    </div>
                    {avisoAlvo && (
                      <div className="flex items-start gap-1.5 text-[11px] text-amber-700 dark:text-amber-400">
                        <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
                        <span>{avisoAlvo}</span>
                      </div>
                    )}
                  </div>
                )}
                {editingFlight && priceStats && !temSugestao && (
                  <p className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">
                    Ainda sem histórico suficiente para sugerir um alvo ({priceStats.amostras} verificação(ões) em 60 dias).
                  </p>
                )}
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2"><LinkIcon className="w-4 h-4" /> Link do Google Voos</label>
                <input type="url" {...register('link_voo', { required: true })} className={inputCls} placeholder="https://www.google.com/travel/flights..." />
                {errors.link_voo && <span className="text-xs text-red-700 dark:text-red-400">Link obrigatório</span>}
              </div>
              <div className="border-t border-slate-200 dark:border-slate-700/50 pt-4 mt-2">
                <p className="text-xs text-slate-400 dark:text-slate-500 uppercase tracking-wider font-semibold mb-3">Notificações & Status</p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2"><Mail className="w-4 h-4" /> E-mail</label>
                    <input type="email" {...register('email_cliente', { pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ })} className={inputCls} placeholder="email@exemplo.com" />
                    {errors.email_cliente && <span className="text-xs text-red-700 dark:text-red-400">E-mail inválido</span>}
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2"><MessageSquare className="w-4 h-4" /> Telegram ID</label>
                    <input {...register('telegram_chat_id')} className={inputCls} placeholder="@usuario ou ID" />
                  </div>
                </div>
                <div className="mt-3 space-y-1">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Status</label>
                  <select {...register('status')} className={`${inputCls} appearance-none`}>
                    <option value="ativo" className="bg-white dark:bg-slate-900">Ativo</option>
                    <option value="encerrado" className="bg-white dark:bg-slate-900">Encerrado</option>
                    <option value="passagem comprada" className="bg-white dark:bg-slate-900">Passagem Comprada</option>
                  </select>
                </div>
              </div>
              <div className="pt-4 flex justify-end gap-3 border-t border-slate-200 dark:border-slate-700/50 mt-6">
                <button type="button" onClick={closeModal} className="px-5 py-2.5 text-sm font-medium text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 dark:text-slate-300 dark:hover:text-white dark:bg-slate-800 dark:hover:bg-slate-700 rounded-lg transition-colors cursor-pointer">
                  Cancelar
                </button>
                <button type="submit" className="px-5 py-2.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-all shadow-lg shadow-indigo-500/25 cursor-pointer active:scale-95">
                  {editingFlight ? 'Salvar Alterações' : 'Adicionar Voo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
