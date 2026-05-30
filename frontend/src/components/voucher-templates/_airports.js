// Common Brazilian airports — IATA → full name
// Extend as needed. Fallback to IATA itself when not found.
const AIRPORTS = {
  GRU: 'Guarulhos',
  CGH: 'Congonhas',
  VCP: 'Viracopos',
  GIG: 'Galeão Antônio Carlos Jobim',
  SDU: 'Santos Dumont',
  SSA: 'Deputado Luís Eduardo Magalhães',
  BSB: 'Presidente Juscelino Kubitschek',
  CNF: 'Tancredo Neves (Confins)',
  REC: 'Guararapes',
  FOR: 'Pinto Martins',
  POA: 'Salgado Filho',
  CWB: 'Afonso Pena',
  FLN: 'Hercílio Luz',
  NAT: 'Augusto Severo',
  MCZ: 'Zumbi dos Palmares',
  AJU: 'Santa Maria',
  JPA: 'Castro Pinto',
  THE: 'Senador Petrônio Portella',
  SLZ: 'Marechal Cunha Machado',
  BEL: 'Val de Cans',
  MAO: 'Eduardo Gomes',
  CGB: 'Marechal Rondon',
  CGR: 'Campo Grande',
  GYN: 'Santa Genoveva',
  VIX: 'Eurico de Aguiar Salles',
  PMW: 'Brigadeiro Lysias Rodrigues',
  IOS: 'Jorge Amado',
  IGU: 'Cataratas',
  NVT: 'Ministro Victor Konder',
  BPS: 'Porto Seguro',
  PNZ: 'Petrolina',
  UDI: 'Uberlândia',
  RAO: 'Leite Lopes',
  LDB: 'Governador José Richa',
  PFB: 'Lauro Kortz'
};

export function airportName(iata) {
  if (!iata) return '';
  return AIRPORTS[iata.toUpperCase()] || '';
}
