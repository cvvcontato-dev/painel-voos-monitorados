import React, { useEffect, useState } from 'react';
import VoucherCanonicalV1 from './voucher-templates/VoucherCanonicalV1';
import VoucherCompactoV1 from './voucher-templates/VoucherCompactoV1';
import api from '../hooks/useApi';

// Renderiza o voucher de voo de um PACOTE (a partir de package.flights),
// reusando o mesmo dispatch de template do VoucherPreviewPage. Consumido pelo
// Playwright via /voucher-preview/pacote/:id?export=1 para gerar o PDF anexo.
const STYLES = {
  institucional: VoucherCanonicalV1,
  compacto: VoucherCompactoV1,
};

export default function PackageFlightPreviewPage({ id, isExport }) {
  const [flights, setFlights] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    api.get(`/api/packages/${id}`)
      .then(r => setFlights((r.data && r.data.package && r.data.package.flights) || null))
      .catch(e => setErr(e.message));
  }, [id]);

  if (err) return <div style={{ padding: 20, color: 'red' }}>{err}</div>;
  if (!flights) return <div style={{ padding: 20 }}>Carregando…</div>;

  const Tpl = STYLES[flights.templateStyle || 'institucional'] || VoucherCanonicalV1;

  return (
    <div style={{
      background: isExport ? '#fff' : '#eee',
      minHeight: '100vh',
      display: 'flex',
      justifyContent: 'center',
      padding: isExport ? 0 : 20,
    }}>
      <Tpl data={flights} />
    </div>
  );
}
