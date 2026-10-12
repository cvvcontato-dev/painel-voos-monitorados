/**
 * Chave estável de um destino. "Porto Seguro", "porto  seguro" e "Pórto Seguro"
 * caem no mesmo slug. Sufixos entre parênteses ("Porto de Galinhas (Ipojuca)") e
 * depois de vírgula/hífen ("Aruba, Aruba") são descartados, porque a extração do
 * print nem sempre escreve o nome exatamente igual de um dia para o outro.
 */
function slugify(s) {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

function destinationKey(name) {
  const base = String(name ?? '')
    .replace(/\(.*?\)/g, ' ')   // "(Ipojuca)"
    .split(/[,;]| - | – /)[0]   // "Aruba, Aruba" -> "Aruba"
    .trim();
  return slugify(base).replace(/-+/g, '-').replace(/^-|-$/g, '');
}

module.exports = { slugify, destinationKey };
