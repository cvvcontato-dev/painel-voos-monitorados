import { useState, useEffect } from 'react';
import axios from 'axios';
import { Plane, Plus, Edit2, Trash2, ExternalLink, CheckCircle2, Circle, AlertCircle, Calendar, DollarSign, User, Link as LinkIcon, X, Users, GripVertical, RefreshCw, Mail, MessageSquare } from 'lucide-react';
import { useForm } from 'react-hook-form';

const API_URL = '/api/flights';
const fmt = v => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(v);

function timeAgo(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr.endsWith('Z') ? dateStr : dateStr + 'Z');
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff/60000);
  if (mins < 60) return `Verificado há ${mins} min`;
  const hrs = Math.floor(mins/60);
  if (hrs < 24) return `Verificado há ${hrs}h`;
  return `Verificado há ${Math.floor(hrs/24)} dias`;
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

  const fetchFlights = async () => {
    setIsLoading(true);
    try { setFlights((await axios.get(API_URL)).data); }
    catch(e) { console.error('Error fetching flights', e); }
    finally { setIsLoading(false); }
  };

  useEffect(() => { fetchFlights(); }, []);

  const openModal = (flight = null) => {
    if (flight) {
      setEditingFlight(flight);
      Object.keys(flight).forEach(k => setValue(k, flight[k]));
    } else {
      setEditingFlight(null);
      reset({ cliente:'', mes_viagem:'', prioridade:'', preco_esperado:'', link_voo:'', quantidade_pax:1, email_cliente:'', telegram_chat_id:'', status:'ativo' });
    }
    setIsModalOpen(true);
  };

  const closeModal = () => { setIsModalOpen(false); setEditingFlight(null); reset(); };

  const onSubmit = async (data) => {
    try {
      const payload = { ...data, preco_esperado: parseFloat(data.preco_esperado), quantidade_pax: parseInt(data.quantidade_pax||1,10), check_diario: !!data.check_diario };
      if (editingFlight) { await axios.put(`${API_URL}/${editingFlight.id}`, payload); }
      else { payload.posicao = flights.length > 0 ? Math.max(...flights.map(f=>f.posicao||0))+1 : 0; await axios.post(API_URL, payload); }
      fetchFlights(); closeModal(); showToast('Voo salvo com sucesso!','success');
    } catch (error) {
      if (error.response?.status === 409) showToast('Este link já está cadastrado!','error');
      else showToast(error.response?.data?.error || 'Erro ao salvar o voo.','error');
    }
  };

  const deleteFlight = async (id) => {
    if (window.confirm('Tem certeza que deseja excluir este voo?')) {
      try { await axios.delete(`${API_URL}/${id}`); fetchFlights(); showToast('Voo excluído','success'); }
      catch(e) { console.error(e); }
    }
  };

  const toggleCheck = async (flight) => {
    try { await axios.put(`${API_URL}/${flight.id}`, { ...flight, check_diario: !flight.check_diario }); fetchFlights(); }
    catch(e) { console.error(e); }
  };

  const toggleAllChecks = async () => {
    try { await axios.put(`${API_URL}/bulk-check`, { check_diario: flights.some(f=>!f.check_diario) }); fetchFlights(); }
    catch(e) { console.error(e); }
  };

  const checkNow = async (id) => {
    setCheckingId(id);
    try {
      const { data } = await axios.post(`${API_URL}/${id}/check-now`);
      if (data.bloqueado) showToast('Google Voos bloqueou o acesso. Tente novamente mais tarde.','warning');
      else if (!data.sucesso) showToast(data.erro || 'Falha ao verificar preço','error');
      else { showToast(`Preço encontrado: ${fmt(data.preco_encontrado)}${data.alerta_disparado ? ' — Alerta enviado!' : ''}`,'success'); }
      fetchFlights();
    } catch(e) { showToast('Erro ao verificar preço','error'); }
    finally { setCheckingId(null); }
  };

  // Drag and drop
  const handleDragStart = (e,i) => { if(sortBy!=='manual') return; setDraggedIndex(i); e.dataTransfer.effectAllowed='move'; };
  const handleDragOver = (e,i) => { if(sortBy!=='manual') return; e.preventDefault(); if(draggedIndex===null||draggedIndex===i) return; const n=[...flights]; n.splice(draggedIndex,1); n.splice(i,0,flights[draggedIndex]); setFlights(n); setDraggedIndex(i); };
  const handleDragEnd = async () => { setDraggedIndex(null); try { await axios.put(`${API_URL}/reorder`,{ids:flights.map(f=>f.id)}); } catch(e){console.error(e);} };

  const priorityRank = {'Urgente':4,'Alta':3,'Média':2,'Baixa':1};
  const parseTravelDate = (s) => { if(!s) return new Date(0); const p=s.split('/'); if(p.length<2) return new Date(0); const m=p[0].trim().toLowerCase(); const mMap={'jan':0,'janeiro':0,'fev':1,'fevereiro':1,'mar':2,'março':2,'abr':3,'abril':3,'mai':4,'maio':4,'jun':5,'junho':5,'jul':6,'julho':6,'ago':7,'agosto':7,'set':8,'setembro':8,'out':9,'outubro':9,'nov':10,'novembro':10,'dez':11,'dezembro':11}; let mo=0; for(const k in mMap){if(m.startsWith(k)){mo=mMap[k];break;}} let y=parseInt(p[1].trim(),10); if(p[1].trim().length===2) y+=2000; return new Date(y,mo,1); };

  const getPriorityColor = (p) => {
    switch(p) {
      case 'Urgente': return 'bg-red-100 text-red-700 border border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20';
      case 'Alta': return 'bg-orange-100 text-orange-700 border border-orange-200 dark:bg-orange-500/10 dark:text-orange-400 dark:border-orange-500/20';
      case 'Média': return 'bg-amber-100 text-amber-700 border border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20';
      case 'Baixa': return 'bg-emerald-100 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20';
      default: return 'bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-500/10 dark:text-slate-400 dark:border-slate-500/20';
    }
  };

  const sortedFlights = [...flights].sort((a,b) => {
    if(sortBy==='priority') return (priorityRank[b.prioridade]||0)-(priorityRank[a.prioridade]||0);
    if(sortBy==='date') return parseTravelDate(a.mes_viagem)-parseTravelDate(b.mes_viagem);
    return 0;
  });

  const allChecked = flights.length>0 && flights.every(f=>f.check_diario);
  const colCount = sortBy==='manual' ? 8 : 7;
  const inputCls = "w-full px-4 py-2.5 rounded-lg transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent border " +
                   "bg-white text-slate-900 placeholder-slate-400 border-slate-300 " +
                   "dark:bg-slate-800/50 dark:text-slate-100 dark:placeholder-slate-400 dark:border-slate-700";

  return (
    <>
      {/* Toolbar */}
      <div className="flex justify-end mb-4">
        <button onClick={() => openModal()} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2.5 rounded-lg font-medium transition-all shadow-lg shadow-indigo-500/25 cursor-pointer active:scale-95">
          <Plus className="w-5 h-5" /> Novo Voo
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-white/80 border border-slate-200 dark:bg-slate-900/40 dark:backdrop-blur-xl dark:border-slate-800/50 p-4 rounded-xl flex items-center gap-3">
          <div className="bg-indigo-500/10 p-2.5 rounded-lg text-indigo-400 border border-indigo-500/20"><Plane className="w-5 h-5" /></div>
          <div><div className="text-xs text-slate-600 dark:text-slate-400 font-medium">Total de Voos</div><div className="text-lg font-bold text-slate-900 dark:text-white">{flights.length}</div></div>
        </div>
        <div className="bg-white/80 border border-slate-200 dark:bg-slate-900/40 dark:backdrop-blur-xl dark:border-slate-800/50 p-4 rounded-xl flex items-center gap-3">
          <div className="bg-indigo-500/10 p-2.5 rounded-lg text-indigo-400 border border-indigo-500/20"><CheckCircle2 className="w-5 h-5" /></div>
          <div><div className="text-xs text-slate-600 dark:text-slate-400 font-medium">Checks Concluídos</div><div className="text-lg font-bold text-slate-900 dark:text-white">{flights.filter(f=>f.check_diario).length} / {flights.length}</div></div>
        </div>
        <div className="bg-white/80 border border-slate-200 dark:bg-slate-900/40 dark:backdrop-blur-xl dark:border-slate-800/50 p-4 rounded-xl flex items-center gap-3">
          <div className="bg-indigo-500/10 p-2.5 rounded-lg text-indigo-400 border border-indigo-500/20"><span className="text-xs font-bold font-mono">ORD</span></div>
          <div className="w-full"><div className="text-xs text-slate-600 dark:text-slate-400 font-medium">Ordenar por</div>
            <select value={sortBy} onChange={e=>setSortBy(e.target.value)} className="bg-transparent border-0 text-sm font-bold text-slate-900 dark:text-white focus:ring-0 focus:outline-none cursor-pointer w-full mt-0.5">
              <option value="manual" className="bg-white dark:bg-slate-900">Manual ↕</option>
              <option value="priority" className="bg-white dark:bg-slate-900">Prioridade ★</option>
              <option value="date" className="bg-white dark:bg-slate-900">Data Viagem 📅</option>
            </select>
          </div>
        </div>
      </div>

      {/* Table */}
      <main className="bg-white border border-slate-200 dark:bg-slate-900/60 dark:backdrop-blur-xl dark:border-slate-700/50 shadow-2xl rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500 dark:bg-slate-900/80 dark:border-slate-800 dark:text-slate-400">
                {sortBy==='manual' && <th className="px-4 py-4 font-semibold w-12 text-center">Pos</th>}
                <th className="px-6 py-4 font-semibold">Cliente</th>
                <th className="px-6 py-4 font-semibold">Viagem</th>
                <th className="px-6 py-4 font-semibold">Prioridade</th>
                <th className="px-6 py-4 font-semibold">Preço Alvo</th>
                <th className="px-6 py-4 font-semibold">Preço Atual</th>
                <th className="px-6 py-4 font-semibold text-center select-none">
                  <div className="flex items-center justify-center gap-2"><span>Check</span>
                    <button onClick={toggleAllChecks} className="p-1 hover:bg-slate-800 rounded text-indigo-400 hover:text-indigo-300 font-semibold text-[10px] tracking-wide border border-indigo-400/20 cursor-pointer active:scale-95" title={allChecked?"Desmarcar todos":"Marcar todos"}>
                      {allChecked?"DESMARCAR":"MARCAR"} ALL
                    </button>
                  </div>
                </th>
                <th className="px-6 py-4 font-semibold text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800/50">
              {isLoading ? (
                <tr><td colSpan={colCount} className="px-6 py-12 text-center text-slate-400 dark:text-slate-400">
                  <div className="flex justify-center items-center gap-2"><div className="w-5 h-5 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin"></div>Carregando...</div>
                </td></tr>
              ) : flights.length===0 ? (
                <tr><td colSpan={colCount} className="px-6 py-12 text-center text-slate-400 dark:text-slate-400">
                  <Plane className="w-12 h-12 mx-auto text-slate-400 dark:text-slate-600 mb-3 opacity-50" /><p>Nenhum voo sendo monitorado.</p>
                </td></tr>
              ) : sortedFlights.map((flight,index) => (
                <tr key={flight.id} draggable={sortBy==='manual'} onDragStart={e=>handleDragStart(e,index)} onDragOver={e=>handleDragOver(e,index)} onDragEnd={handleDragEnd}
                  className={`hover:bg-slate-100/60 dark:hover:bg-slate-800/30 transition-all group ${sortBy==='manual'?'cursor-move':''} ${draggedIndex===index?'opacity-30 bg-indigo-500/10':''}`}>
                  {sortBy==='manual' && <td className="px-4 py-4 text-center text-slate-400 dark:text-slate-500 group-hover:text-slate-700 dark:group-hover:text-slate-300"><GripVertical className="w-5 h-5 mx-auto cursor-grab" /></td>}
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <span className="font-semibold text-slate-900 dark:text-slate-200">{flight.cliente}</span>
                      <span className="text-xs text-slate-600 dark:text-slate-400 flex items-center gap-1 mt-0.5">
                        <Users className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" /> {flight.quantidade_pax||1} {(flight.quantidade_pax||1)===1?'pax':'pax'}
                        {flight.email_cliente && <Mail className="w-3 h-3 text-slate-400 dark:text-slate-500 ml-1" />}
                        {flight.telegram_chat_id && <MessageSquare className="w-3 h-3 text-slate-400 dark:text-slate-500" />}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-slate-700 dark:text-slate-300">{flight.mes_viagem}</td>
                  <td className="px-6 py-4"><span className={`px-3 py-1 text-xs font-semibold rounded-full ${getPriorityColor(flight.prioridade)}`}>{flight.prioridade}</span></td>
                  <td className="px-6 py-4 font-mono text-emerald-700 dark:text-emerald-400">{fmt(flight.preco_esperado)}</td>
                  <td className="px-6 py-4">
                    {flight.preco_atual != null ? (
                      <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                          <span className={`font-mono font-semibold ${flight.preco_atual <= flight.preco_esperado ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-700 dark:text-slate-300'}`}>{fmt(flight.preco_atual)}</span>
                          {flight.preco_atual <= flight.preco_esperado && <span className="text-[10px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-400 dark:border-emerald-500/30 px-1.5 py-0.5 rounded">✓ ALERTA</span>}
                        </div>
                        {flight.ultima_verificacao && <span className="text-[10px] text-slate-500 dark:text-slate-500 mt-0.5">{timeAgo(flight.ultima_verificacao)}</span>}
                      </div>
                    ) : <span className="text-slate-400 dark:text-slate-600">—</span>}
                  </td>
                  <td className="px-6 py-4 text-center">
                    <button onClick={()=>toggleCheck(flight)} className={`transition-colors rounded-full p-1 cursor-pointer ${flight.check_diario?'text-indigo-400 hover:text-indigo-300 bg-indigo-500/10':'text-slate-400 hover:text-slate-500 hover:bg-slate-100 dark:text-slate-500 dark:hover:text-slate-400 dark:hover:bg-slate-800'}`}>
                      {flight.check_diario ? <CheckCircle2 className="w-6 h-6" /> : <Circle className="w-6 h-6" />}
                    </button>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex justify-end gap-1.5 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={()=>checkNow(flight.id)} disabled={checkingId===flight.id} className="p-2 text-slate-600 hover:text-amber-700 bg-slate-100 hover:bg-amber-100 dark:text-slate-400 dark:hover:text-amber-400 dark:bg-slate-800 dark:hover:bg-amber-500/20 rounded-lg transition-colors cursor-pointer disabled:opacity-50" title="Verificar agora">
                        <RefreshCw className={`w-4 h-4 ${checkingId===flight.id?'animate-spin':''}`} />
                      </button>
                      <a href={flight.link_voo} target="_blank" rel="noopener noreferrer" className="p-2 text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 dark:text-slate-400 dark:hover:text-white dark:bg-slate-800 dark:hover:bg-slate-700 rounded-lg transition-colors" title="Google Voos"><ExternalLink className="w-4 h-4" /></a>
                      <button onClick={()=>openModal(flight)} className="p-2 text-slate-600 hover:text-blue-700 bg-slate-100 hover:bg-blue-100 dark:text-slate-400 dark:hover:text-blue-400 dark:bg-slate-800 dark:hover:bg-blue-500/20 rounded-lg transition-colors cursor-pointer" title="Editar"><Edit2 className="w-4 h-4" /></button>
                      <button onClick={()=>deleteFlight(flight.id)} className="p-2 text-slate-600 hover:text-red-700 bg-slate-100 hover:bg-red-100 dark:text-slate-400 dark:hover:text-red-400 dark:bg-slate-800 dark:hover:bg-red-500/20 rounded-lg transition-colors cursor-pointer" title="Excluir"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>

      {/* Flight Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/50 dark:bg-slate-950/80 backdrop-blur-sm" onClick={closeModal}></div>
          <div className="relative w-full max-w-lg bg-white border border-slate-200 dark:bg-slate-900/60 dark:backdrop-blur-xl dark:border-slate-700/50 shadow-2xl rounded-2xl overflow-hidden modal-animate max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center p-6 border-b border-slate-200 dark:border-slate-700/50">
              <h2 className="text-xl font-semibold text-slate-900 dark:text-white">{editingFlight?'Editar Voo':'Adicionar Novo Voo'}</h2>
              <button onClick={closeModal} className="text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors cursor-pointer"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-2 space-y-1">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2"><User className="w-4 h-4" /> Cliente</label>
                  <input {...register('cliente',{required:true})} className={inputCls} placeholder="Nome do cliente" />
                  {errors.cliente && <span className="text-xs text-red-700 dark:text-red-400">Obrigatório</span>}
                </div>
                <div className="col-span-1 space-y-1">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2"><Users className="w-4 h-4" /> Pax</label>
                  <input type="number" min="1" {...register('quantidade_pax',{required:true,min:1})} className={inputCls} placeholder="1" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2"><Calendar className="w-4 h-4" /> Mês da Viagem</label>
                  <input {...register('mes_viagem',{required:true})} className={inputCls} placeholder="Ex: Janeiro/2025" />
                  {errors.mes_viagem && <span className="text-xs text-red-700 dark:text-red-400">Obrigatório</span>}
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2"><AlertCircle className="w-4 h-4" /> Prioridade</label>
                  <select {...register('prioridade',{required:true})} className={`${inputCls} appearance-none`}>
                    <option value="" className="bg-white dark:bg-slate-900">Selecione...</option>
                    <option value="Urgente" className="bg-white dark:bg-slate-900">Urgente</option><option value="Alta" className="bg-white dark:bg-slate-900">Alta</option><option value="Média" className="bg-white dark:bg-slate-900">Média</option><option value="Baixa" className="bg-white dark:bg-slate-900">Baixa</option>
                  </select>
                  {errors.prioridade && <span className="text-xs text-red-700 dark:text-red-400">Obrigatório</span>}
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2"><DollarSign className="w-4 h-4" /> Preço Esperado (R$)</label>
                <input type="number" step="0.01" {...register('preco_esperado',{required:true,min:0})} className={inputCls} placeholder="2500.00" />
                {errors.preco_esperado && <span className="text-xs text-red-700 dark:text-red-400">Preço inválido</span>}
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2"><LinkIcon className="w-4 h-4" /> Link do Google Voos</label>
                <input type="url" {...register('link_voo',{required:true})} className={inputCls} placeholder="https://www.google.com/travel/flights..." />
                {errors.link_voo && <span className="text-xs text-red-700 dark:text-red-400">Link obrigatório</span>}
              </div>

              {/* New fields */}
              <div className="border-t border-slate-200 dark:border-slate-700/50 pt-4 mt-2">
                <p className="text-xs text-slate-500 dark:text-slate-500 uppercase tracking-wider font-semibold mb-3">Notificações & Status</p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2"><Mail className="w-4 h-4" /> E-mail</label>
                    <input type="email" {...register('email_cliente',{pattern:/^[^\s@]+@[^\s@]+\.[^\s@]+$/})} className={inputCls} placeholder="email@exemplo.com" />
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
                <button type="button" onClick={closeModal} className="px-5 py-2.5 text-sm font-medium text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 dark:text-slate-300 dark:hover:text-white dark:bg-slate-800 dark:hover:bg-slate-700 rounded-lg transition-colors cursor-pointer">Cancelar</button>
                <button type="submit" className="px-5 py-2.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-all shadow-lg shadow-indigo-500/25 cursor-pointer active:scale-95">
                  {editingFlight?'Salvar Alterações':'Adicionar Voo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </>
  );
}
