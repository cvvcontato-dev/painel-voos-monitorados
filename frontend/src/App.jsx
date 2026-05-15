import { useState, useEffect } from 'react';
import axios from 'axios';
import { Plane, Plus, Edit2, Trash2, ExternalLink, CheckCircle2, Circle, AlertCircle, Calendar, DollarSign, User, Link as LinkIcon, X } from 'lucide-react';
import { useForm } from 'react-hook-form';
import logo from './assets/logo.png';

const API_URL = '/api/flights';

function App() {
  const [flights, setFlights] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingFlight, setEditingFlight] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const { register, handleSubmit, reset, setValue, formState: { errors } } = useForm();

  const fetchFlights = async () => {
    setIsLoading(true);
    try {
      const response = await axios.get(API_URL);
      setFlights(response.data);
    } catch (error) {
      console.error('Error fetching flights', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchFlights();
  }, []);

  const openModal = (flight = null) => {
    if (flight) {
      setEditingFlight(flight);
      Object.keys(flight).forEach(key => {
        setValue(key, flight[key]);
      });
    } else {
      setEditingFlight(null);
      reset();
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingFlight(null);
    reset();
  };

  const onSubmit = async (data) => {
    try {
      const payload = {
        ...data,
        preco_esperado: parseFloat(data.preco_esperado),
        check_diario: !!data.check_diario
      };

      if (editingFlight) {
        await axios.put(`${API_URL}/${editingFlight.id}`, payload);
      } else {
        await axios.post(API_URL, payload);
      }
      fetchFlights();
      closeModal();
    } catch (error) {
      console.error('Error saving flight', error);
      if (error.response?.status === 409) {
        alert('Este link já está cadastrado!');
      } else {
        alert('Ocorreu um erro ao salvar o voo.');
      }
    }
  };

  const deleteFlight = async (id) => {
    if (window.confirm('Tem certeza que deseja excluir este voo?')) {
      try {
        await axios.delete(`${API_URL}/${id}`);
        fetchFlights();
      } catch (error) {
        console.error('Error deleting flight', error);
      }
    }
  };

  const toggleCheck = async (flight) => {
    try {
      await axios.put(`${API_URL}/${flight.id}`, {
        ...flight,
        check_diario: !flight.check_diario
      });
      fetchFlights();
    } catch (error) {
      console.error('Error updating check status', error);
    }
  };

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'Urgente': return 'bg-red-500/10 text-red-400 border border-red-500/20';
      case 'Alta': return 'bg-orange-500/10 text-orange-400 border border-orange-500/20';
      case 'Média': return 'bg-amber-500/10 text-amber-400 border border-amber-500/20';
      case 'Baixa': return 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
      default: return 'bg-slate-500/10 text-slate-400 border border-slate-500/20';
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
        <div className="flex items-center gap-3">
          <img src={logo} alt="Clube do Voo Viagens" className="w-14 h-14 rounded-full object-cover border-2 border-indigo-500/30 shadow-lg shadow-indigo-500/20" />
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
              Monitoramento de Voos
            </h1>
            <p className="text-slate-400 text-sm mt-1">Gerencie e acompanhe preços de passagens aéreas</p>
          </div>
        </div>
        <button
          onClick={() => openModal()}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2.5 rounded-lg font-medium transition-all shadow-lg shadow-indigo-500/25 cursor-pointer active:scale-95"
        >
          <Plus className="w-5 h-5" />
          Novo Voo
        </button>
      </header>

      {/* Main Content */}
      <main className="bg-slate-900/60 backdrop-blur-xl border border-slate-700/50 shadow-2xl rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-900/80 backdrop-blur-md border-b border-slate-800 text-xs uppercase tracking-wider text-slate-400">
                <th className="px-6 py-4 font-semibold">Cliente</th>
                <th className="px-6 py-4 font-semibold">Viagem</th>
                <th className="px-6 py-4 font-semibold">Prioridade</th>
                <th className="px-6 py-4 font-semibold">Preço Alvo</th>
                <th className="px-6 py-4 font-semibold text-center">Check Diário</th>
                <th className="px-6 py-4 font-semibold text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {isLoading ? (
                <tr>
                  <td colSpan="6" className="px-6 py-12 text-center text-slate-400">
                    <div className="flex justify-center items-center gap-2">
                      <div className="w-5 h-5 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin"></div>
                      Carregando voos...
                    </div>
                  </td>
                </tr>
              ) : flights.length === 0 ? (
                <tr>
                  <td colSpan="6" className="px-6 py-12 text-center text-slate-400">
                    <Plane className="w-12 h-12 mx-auto text-slate-600 mb-3 opacity-50" />
                    <p>Nenhum voo sendo monitorado.</p>
                    <p className="text-sm mt-1">Clique em "Novo Voo" para começar.</p>
                  </td>
                </tr>
              ) : (
                flights.map((flight) => (
                  <tr key={flight.id} className="hover:bg-slate-800/30 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="font-medium text-slate-200">{flight.cliente}</div>
                    </td>
                    <td className="px-6 py-4 text-slate-300">
                      {flight.mes_viagem}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-3 py-1 text-xs font-medium rounded-full ${getPriorityColor(flight.prioridade)}`}>
                        {flight.prioridade}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-mono text-emerald-400">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(flight.preco_esperado)}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <button 
                        onClick={() => toggleCheck(flight)}
                        className={`transition-colors rounded-full p-1 cursor-pointer ${flight.check_diario ? 'text-indigo-400 hover:text-indigo-300 bg-indigo-500/10' : 'text-slate-500 hover:text-slate-400 hover:bg-slate-800'}`}
                        title={flight.check_diario ? 'Check realizado' : 'Marcar check'}
                      >
                        {flight.check_diario ? <CheckCircle2 className="w-6 h-6" /> : <Circle className="w-6 h-6" />}
                      </button>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex justify-end gap-2 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                        <a 
                          href={flight.link_voo} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="p-2 text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
                          title="Abrir no Google Voos"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                        <button 
                          onClick={() => openModal(flight)}
                          className="p-2 text-slate-400 hover:text-blue-400 bg-slate-800 hover:bg-blue-500/20 rounded-lg transition-colors cursor-pointer"
                          title="Editar"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => deleteFlight(flight.id)}
                          className="p-2 text-slate-400 hover:text-red-400 bg-slate-800 hover:bg-red-500/20 rounded-lg transition-colors cursor-pointer"
                          title="Excluir"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </main>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={closeModal}></div>
          <div className="relative w-full max-w-lg bg-slate-900/60 backdrop-blur-xl border border-slate-700/50 shadow-2xl rounded-2xl overflow-hidden modal-animate">
            <div className="flex justify-between items-center p-6 border-b border-slate-700/50">
              <h2 className="text-xl font-semibold text-white">
                {editingFlight ? 'Editar Voo' : 'Adicionar Novo Voo'}
              </h2>
              <button onClick={closeModal} className="text-slate-400 hover:text-white transition-colors cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-300 flex items-center gap-2">
                  <User className="w-4 h-4" /> Cliente
                </label>
                <input 
                  {...register('cliente', { required: true })} 
                  className="w-full bg-slate-800/50 border border-slate-700 text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all px-4 py-2.5 rounded-lg"
                  placeholder="Nome do cliente"
                />
                {errors.cliente && <span className="text-xs text-red-400">Campo obrigatório</span>}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-sm font-medium text-slate-300 flex items-center gap-2">
                    <Calendar className="w-4 h-4" /> Mês da Viagem
                  </label>
                  <input 
                    {...register('mes_viagem', { required: true })} 
                    className="w-full bg-slate-800/50 border border-slate-700 text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all px-4 py-2.5 rounded-lg"
                    placeholder="Ex: Janeiro/2025"
                  />
                  {errors.mes_viagem && <span className="text-xs text-red-400">Campo obrigatório</span>}
                </div>

                <div className="space-y-1">
                  <label className="text-sm font-medium text-slate-300 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" /> Prioridade
                  </label>
                  <select 
                    {...register('prioridade', { required: true })} 
                    className="w-full bg-slate-800 border border-slate-700 text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all px-4 py-2.5 rounded-lg appearance-none"
                  >
                    <option value="">Selecione...</option>
                    <option value="Urgente">Urgente</option>
                    <option value="Alta">Alta</option>
                    <option value="Média">Média</option>
                    <option value="Baixa">Baixa</option>
                  </select>
                  {errors.prioridade && <span className="text-xs text-red-400">Campo obrigatório</span>}
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-300 flex items-center gap-2">
                  <DollarSign className="w-4 h-4" /> Preço Esperado (R$)
                </label>
                <input 
                  type="number"
                  step="0.01"
                  {...register('preco_esperado', { required: true, min: 0 })} 
                  className="w-full bg-slate-800/50 border border-slate-700 text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all px-4 py-2.5 rounded-lg"
                  placeholder="Ex: 2500.00"
                />
                {errors.preco_esperado && <span className="text-xs text-red-400">Preço inválido</span>}
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-300 flex items-center gap-2">
                  <LinkIcon className="w-4 h-4" /> Link do Google Voos
                </label>
                <input 
                  type="url"
                  {...register('link_voo', { required: true })} 
                  className="w-full bg-slate-800/50 border border-slate-700 text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all px-4 py-2.5 rounded-lg"
                  placeholder="https://www.google.com/travel/flights..."
                />
                {errors.link_voo && <span className="text-xs text-red-400">Link inválido ou obrigatório</span>}
                <p className="text-xs text-slate-400 mt-1">Dica: O link deve ser exclusivo para cada monitoramento.</p>
              </div>

              <div className="pt-4 flex justify-end gap-3 border-t border-slate-700/50 mt-6">
                <button 
                  type="button" 
                  onClick={closeModal}
                  className="px-5 py-2.5 text-sm font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  className="px-5 py-2.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-all shadow-lg shadow-indigo-500/25 cursor-pointer active:scale-95"
                >
                  {editingFlight ? 'Salvar Alterações' : 'Adicionar Voo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
