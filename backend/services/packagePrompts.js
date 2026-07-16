// Prompts de extração (Gemini) e STUBs (dados fake, usados sem GEMINI_API_KEY)
// por tipo de serviço do pacote. Schemas espelham os campos dos vouchers reais
// (hotéis, aluguel de carro, passeios, transfers).

const STUBS = {
  hotel: {
    locator: 'STUBH1', provider: 'Stub Hotels', name: 'Hotel Exemplo', stars: 4,
    address: 'Rua Exemplo, 100, Gramado, Brasil', phone: '555432861777', email: 'reservas@exemplo.com.br',
    checkIn: { date: '2026-10-20', time: '14:00' }, checkOut: { date: '2026-10-25', time: '12:00' },
    nights: 5,
    rooms: [{ type: 'Apartamento Super Luxo', beds: '1 Casal Extra-Grande', regime: 'Café da manhã' }],
    guests: [{ name: 'JOAO DA SILVA', doc: null, birth: null }, { name: 'MARIA SILVA', doc: null, birth: null }],
    guestCount: 2, totalText: 'R$ 2.500,00',
    amenities: ['Wi-Fi', 'Estacionamento grátis', 'Restaurante'],
    cancellation: 'Cancelamento grátis até 7 dias antes do check-in.', notes: null
  },
  car: {
    locator: 'STUBC1', provider: 'Movida', holder: 'André Silva Filho', driver: 'André Silva Filho',
    rentalDays: 5,
    pickup: { datetime: '2026-10-20T16:30:00-03:00', location: 'Agência Movida — Aeroporto Salgado Filho, Av. dos Estados, 4914' },
    dropoff: { datetime: '2026-10-25T16:30:00-03:00', location: 'Agência Movida — Aeroporto Salgado Filho, Av. dos Estados, 4914' },
    category: 'Carros Grandes — Toyota Corolla, VW Virtus ou similar', transmission: 'Câmbio automático',
    features: ['5 lugares', 'Quilometragem ilimitada', 'Driver adicional gratuito'],
    insurance: 'Cobertura por dano e roubo com franquia',
    cancellation: 'Cancele grátis até 24h antes da retirada.'
  },
  tour: {
    locator: '9966527', provider: 'VIDA & ENERGIA', activity: 'Passeio em Campos do Jordão',
    datetime: '2026-02-04T08:00:00-03:00', travelers: 'Adultos: 2',
    meetingPoint: 'Hotel Ibis Paulista — Avenida Paulista, 2355 (aguarde o guia em frente ao hotel).',
    pickupName: 'Jerry Vainio', hotelPickup: 'ibis budget São Paulo Paulista, São Paulo, Brasil',
    includes: ['Guia em espanhol, inglês e português', 'Seguro de passageiros', 'Transfers para hospedagens até 6km da Praça da Sé'],
    excludes: ['Ingressos', 'Refeições', 'Gorjetas'],
    description: 'City tour por Campos do Jordão com paradas nos principais pontos turísticos.',
    cancellation: 'Não reembolsável após a compra (exceto direito de arrependimento em 7 dias).'
  },
  transfer: {
    locator: '9601728_9601729', provider: 'Koi', type: 'Privativo — Carro Standard', travelers: 'Adultos: 2',
    legs: [
      { from: 'Aeroporto Internacional Leonardo da Vinci (Fiumicino)', to: 'Hotel Genova', datetime: '2026-03-30T20:15:00+01:00', pickupWindow: '30 Mar 2026 entre 20:15 e 20:45' },
      { from: 'Hotel Genova', to: 'Aeroporto Internacional Leonardo da Vinci (Fiumicino)', datetime: '2026-04-03T13:15:00+01:00', pickupWindow: '03 Abr 2026 entre 13:15 e 13:45' }
    ],
    meetingPoint: 'O motorista aguarda no saguão de desembarque com uma placa com o nome do passageiro.',
    cancellation: 'Cancele grátis até o dia anterior ao serviço.'
  }
};

const PROMPTS = {
  hotel: `Você é um extrator de vouchers de HOSPEDAGEM. Analise o documento e devolva SOMENTE um JSON válido, sem texto fora dele, no schema:
{ "locator": string, "provider": string, "name": string, "stars": number|null, "address": string, "phone": string|null, "email": string|null,
  "checkIn": { "date": "YYYY-MM-DD", "time": "HH:mm" }, "checkOut": { "date": "YYYY-MM-DD", "time": "HH:mm" }, "nights": number,
  "rooms": [ { "type": string, "beds": string|null, "regime": string|null } ],
  "guests": [ { "name": string, "doc": string|null, "birth": string|null } ], "guestCount": number,
  "totalText": string|null, "amenities": [string], "cancellation": string|null, "notes": string|null }
Regras: datas no formato indicado; preserve o fuso do documento se houver; use null (NÃO invente) para campo ausente.`,
  car: `Você é um extrator de vouchers de ALUGUEL DE CARRO. Devolva SOMENTE um JSON válido no schema:
{ "locator": string, "provider": string, "holder": string, "driver": string, "rentalDays": number,
  "pickup": { "datetime": ISO8601, "location": string }, "dropoff": { "datetime": ISO8601, "location": string },
  "category": string|null, "transmission": string|null, "features": [string], "insurance": string|null, "cancellation": string|null }
Regras: datetimes em ISO8601 preservando o fuso do documento; use null (NÃO invente) para campo ausente; sem texto fora do JSON.`,
  tour: `Você é um extrator de vouchers de PASSEIO/ATIVIDADE. Devolva SOMENTE um JSON válido no schema:
{ "locator": string, "provider": string, "activity": string, "datetime": ISO8601, "travelers": string,
  "meetingPoint": string|null, "pickupName": string|null, "hotelPickup": string|null,
  "includes": [string], "excludes": [string], "description": string|null, "cancellation": string|null }
Regras: datetime em ISO8601 preservando o fuso do documento; use null (NÃO invente) para campo ausente; sem texto fora do JSON.`,
  transfer: `Você é um extrator de vouchers de TRANSFER/TRASLADO. Um voucher pode ter mais de um trecho (ex.: chegada aeroporto→hotel e volta hotel→aeroporto). Devolva SOMENTE um JSON válido no schema:
{ "locator": string, "provider": string, "type": string|null, "travelers": string,
  "legs": [ { "from": string, "to": string, "datetime": ISO8601, "pickupWindow": string|null } ],
  "meetingPoint": string|null, "cancellation": string|null }
Regras: um objeto em legs por trecho; datetime em ISO8601 preservando o fuso do documento; use null (NÃO invente) para campo ausente; sem texto fora do JSON.`
};

module.exports = { PROMPTS, STUBS };
