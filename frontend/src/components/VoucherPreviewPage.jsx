import React, { useEffect, useState } from 'react';
import VoucherCanonicalV1 from './voucher-templates/VoucherCanonicalV1';
import * as api from '../api/voucherClient';

const TEMPLATES = { 'azul.confirmacao.v1': VoucherCanonicalV1 };

export default function VoucherPreviewPage({ id, isExport }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    api.get(id)
      .then(v => setData(v.unified))
      .catch(e => setErr(e.message));
  }, [id]);

  if (err) return <div style={{ padding: 20, color: 'red' }}>{err}</div>;
  if (!data) return <div style={{ padding: 20 }}>Carregando…</div>;

  const Tpl = TEMPLATES[data.layoutVersion];
  if (!Tpl) return <div>Template {data.layoutVersion} não encontrado</div>;

  return (
    <div style={{
      background: isExport ? '#fff' : '#eee',
      minHeight: '100vh',
      display: 'flex',
      justifyContent: 'center',
      padding: isExport ? 0 : 20,
    }}>
      <Tpl data={data} />
    </div>
  );
}
