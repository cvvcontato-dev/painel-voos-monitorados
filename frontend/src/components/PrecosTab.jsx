import { useState, useEffect, useCallback } from 'react';
import api from '../hooks/useApi';
import {
  Plane, Plus, Edit2, Trash2, ExternalLink, CheckCircle2, Circle,
  AlertCircle, Calendar, DollarSign, User, Link as LinkIcon, X,
  Users, GripVertical, RefreshCw, Mail, MessageSquare, TrendingDown, Clock
} from 'lucide-react';
import { useForm } from 'react-hook-form';

const API_URL = '/api/flights';
const fmt = v => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

function timeAgo(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr.endsWith('Z') ? dateStr : dateStr + 'Z');
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `Verificado há ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `Verificado há ${hrs}h`;
  return `Verificado há ${Math.floor(hrs / 24)} dias`;
}

export default function PrecosTab({ showToast }) {
  const [flights, setFlights] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingFlight, setEditingFlight] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sortBy, setSortBy] = useState('manual');
  const [draggedIndex, setDraggedIndex] = useState(null);
  const [checkingId, setCheckingId] = useState(null);

  const { register, handleSubmit, reset, setValue, formState: { errors } } = useForm();

  const fetchFlights = useCallback(async () => {
    setIsLoading(true);
    try { setFlights((await api.get(API_URL)).data); }
    catch (e) { console.error('Error fetching flights', e); }
    finally { setIsLoading(false); }
  }, []);

  useEffect(() => { fetchFlights(); }, [fetchFlights]);

  const openModal = (flight = null) => {
    if (flight) {
      setEditingFlight(flight);
      Object.keys(flight).forEach(k => setValue(k, flight[k]));
    } else {
      setEditingFlight(null);
      reset({ cliente: '', mes_viagem: '', prioridade: '', preco_esperado: '', link_voo: '', quantidade_pax: 1, email_cliente: '', telegram_chat_id: '', status: 'ativo' });
    }
    setIsModalOpen(true);
  };

  const closeModal = () => { setIsModalOpen(false); setEditingFlight(null); reset(); };

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

  const checkNow = async (id) => {
    setCheckingId(id);
    try {
      const { data } = await api.post(`${API_URL}/${id}/check-now`);
      if (data.bloqueado) showToast('Google Voos bloqueou o acesso. Tente novamente mais tarde.', 'warning');
      else if (!data.sucesso) showToast(data.erro || 'Falha ao verificar preço', 'error');
      else { showToast(`Preço encontrado: ${fmt(data.preco_encontrado)}${data.alerta_disparado ? ' — Alerta enviado!' : ''}`, 'success'); }
      fetchFlights();
    } catch (e) { showToast('Erro ao verificar preço', 'error'); }
    finally { setCheckingId(null); }
  };

  const handleDragStart = (e, i) => { if (sortBy !== 'manual') return; setDraggedIndex(i); e.dataTransfer.effectAllowed = 'move'; };
  const handleDragOver = (e, i) => {
    if (sortBy !== 'manual') return; e.preventDefault();
    if (draggedIndex === null || draggedIndex === i) return;
    const n = [...flights]; n.splice(draggedIndex, 1); n.splice(i, 0, flights[draggedIndex]);
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
      case 'Alta': return 'bg-orange-50 text-orange-700 border border-orange-200 dark:bg-orange-500/10 dark:text-orange-400 dark:border-orange-500/20';
      case 'Média': return 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20';
      case 'Baixa': return 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20';
      default: return 'bg-slate-50 text-slate-600 border border-slate-200 dark:bg-slate-500/10 dark:text-slate-400 dark:border-slate-500/20';
    }
  };

  const sortedFlights = [...flights].sort((a, b) => {
    if (sortBy === 'priority') return (priorityRank[b.prioridade] || 0) - (priorityRank[a.prioridade] || 0);
    if (sortBy === 'date') return parseTravelDate(a.mes_viagem) - parseTravelDate(b.mes_viagem);
    return 0;
  });

  const allChecked = flights.length > 0 && flights.every(f => f.check_diario);

  // Grid columns: drag | cliente | viagem | prioridade | preço alvo | preço atual | check | ações
  const gridStyle = {
    display: 'grid',
    gap: '1rem',
    alignItems: 'center',
    gridTemplateColumns: sortBy === 'manual'
      ? '28px minmax(0,1.8fr) minmax(0,0.9fr) 80px 130px minmax(0,1.1fr) 44px 108px'
      : 'minmax(0,1.8fr) minmax(0,0.9fr) 80px 130px minmax(0,1.1fr) 44px 108px',
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
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-white/80 border border-slate-200 dark:bg-slate-900/40 dark:backdrop-blur-xl dark:border-slate-800/50 p-4 rounded-xl flex items-center gap-3">
          <div className="bg-indigo-500/10 p-2.5 rounded-lg text-indigo-400 border border-indigo-500/20"><Plane className="w-5 h-5" /></div>
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">Total de Voos</div>
            <div className="text-lg font-bold text-slate-900 dark:text-white">{flights.length}</div>
          </div>
        </div>
        <div className="bg-white/80 border border-slate-200 dark:bg-slate-900/40 dark:backdrop-blur-xl dark:border-slate-800/50 p-4 rounded-xl flex items-center gap-3">
          <div className="bg-indigo-500/10 p-2.5 rounded-lg text-indigo-400 border border-indigo-500/20"><CheckCircle2 className="w-5 h-5" /></div>
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">Checks Concluídos</div>
            <div className="text-lg font-bold text-slate-900 dark:text-white">{flights.filter(f => f.check_diario).length} / {flights.length}</div>
          </div>
        </div>
        <div className="bg-white/80 border border-slate-200 dark:bg-slate-900/40 dark:backdrop-blur-xl dark:border-slate-800/50 p-4 rounded-xl flex items-center gap-3">
          <div className="bg-indigo-500/10 p-2.5 rounded-lg text-indigo-400 border border-indigo-500/20"><span className="text-xs font-bold font-mono">ORD</span></div>
          <div className="w-full">
            <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">Ordenar por</div>
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value)}
              className="bg-transparent border-0 text-sm font-bold text-slate-900 dark:text-white focus:ring-0 focus:outline-none cursor-pointer w-full mt-0.5"
            >
              <option value="manual" className="bg-white dark:bg-slate-900">Manual ↕</option>
              <option value="priority" className="bg-white dark:bg-slate-900">Prioridade ★</option>
              <option value="date" className="bg-white dark:bg-slate-900">Data Viagem 📅</option>
            </select>
          </div>
        </div>
      </div>

      {/* ── Card Table ── */}
      <div className="space-y-1.5">

        {/* Column Headers */}
        <div style={gridStyle} className="px-4 py-2">
          {sortBy === 'manual' && <div />}
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
        ) : flights.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400 dark:text-slate-500">
            <Plane className="w-10 h-10 mb-3 opacity-30" />
            <p className="text-sm">Nenhum voo sendo monitorado.</p>
          </div>
        ) : sortedFlights.map((flight, index) => {
          const hasPrice = flight.preco_atual != null;
          const isAlert = hasPrice && flight.preco_atual <= flight.preco_esperado;
          const isDragged = draggedIndex === index;

          return (
            <div
              key={flight.id}
              draggable={sortBy === 'manual'}
              onDragStart={e => handleDragStart(e, index)}
              onDragOver={e => handleDragOver(e, index)}
              onDragEnd={handleDragEnd}
              className={`
                relative
                bg-white dark:bg-slate-800/60
                border rounded-xl overflow-hidden
                transition-all duration-200
                group
                ${isDragged
                  ? 'opacity-30 border-indigo-400/40 dark:border-indigo-500/30'
                  : 'border-slate-200/80 dark:border-slate-700/50 hover:-translate-y-px hover:shadow-md hover:shadow-slate-200/60 dark:hover:shadow-slate-900/60 hover:border-slate-300/80 dark:hover:border-slate-600/60'
                }
                ${sortBy === 'manual' ? 'cursor-move' : ''}
              `}
            >
              {/* Left accent bar */}
              {hasPrice && (
                <div className={`absolute left-0 top-0 bottom-0 w-[3px] ${isAlert ? 'bg-emerald-400 dark:bg-emerald-500' : 'bg-amber-400 dark:bg-amber-500'}`} />
              )}

              {/* Right status gradient */}
              {hasPrice && (
                <div
                  className={`absolute right-0 top-0 bottom-0 w-40 pointer-events-none bg-gradient-to-l ${isAlert ? 'from-emerald-500/[0.06]' : 'from-amber-500/[0.06]'} to-transparent`}
                />
              )}

              {/* Row content */}
              <div style={gridStyle} className="relative px-4 py-3.5">

                {/* Drag handle */}
                {sortBy === 'manual' && (
                  <div className="text-slate-300 dark:text-slate-600 group-hover:text-slate-400 dark:group-hover:text-slate-500 transition-colors flex justify-center">
                    <GripVertical className="w-4 h-4 cursor-grab" />
                  </div>
                )}

                {/* Cliente */}
                <div className="min-w-0">
                  <div className="font-semibold text-slate-800 dark:text-slate-100 truncate">{flight.cliente}</div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <Users className="w-3 h-3 text-slate-400 dark:text-slate-500 shrink-0" />
                    <span className="text-xs text-slate-500 dark:text-slate-400">{flight.quantidade_pax || 1} pax</span>
                    {flight.email_cliente && <Mail className="w-3 h-3 text-slate-400 dark:text-slate-500" />}
                    {flight.telegram_chat_id && <MessageSquare className="w-3 h-3 text-slate-400 dark:text-slate-500" />}
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
                <div className="flex justify-end items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
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
