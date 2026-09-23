// Links reais (fornecidos pelo agente) usados nos testes de cartão de embarque.
// Fica em __tests__/fixtures/ e NÃO termina em .test.js, então o Jest não o executa.

const AZUL_JWT = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJlbnRlcnByaXNlLXdhbGxldC1wcmRAZW50ZXJwcmlzZS13YWxsZXQtcHJkLmlhbS5nc2VydmljZWFjY291bnQuY29tIiwiYXVkIjoiZ29vZ2xlIiwidHlwIjoic2F2ZXRvd2FsbGV0IiwicGF5bG9hZCI6eyJmbGlnaHRPYmplY3RzIjpbeyJpZCI6IjMzODgwMDAwMDAwMjI5MTcwNjAucHJkMjAyNjA5MjRBRDI3MzBTU0FSRUNSTldES1ROaUZCUkZRLSJ9XX19.fS23uqiUE6-W1HWXamxNJMhskmtfxQQmU8bZDLNRErtWun55bvNWg6WLzQIdHQe9qj9tnkbsF24ncmp9r_V5Mip7GVN1PCUrDXA-s70ab511tBYzDH_0WqtQge3xp4l41TdVKmORRGWKfuxMPuDmpTm7wsr85VZ-iILBYWt_H3wB9j3BC61_hI2I-LYGZJV1yZvZ9C_9BPtSiIO7DOZJAwXh7aH28fUc9I71d6GN6GX2THnq1rPsRA8uVfSNkR_PpOJelTR9l0tZZQkF-ZWgCGGM3wPDsU8hfZanpJ7NFkYixVXr8s__acETe-H9OlPMWtSKVeTHoNrVwmJ1QMFMRA';

const AZUL_CLEAN = `https://pay.google.com/gp/v/save/${AZUL_JWT}`;

const AZUL_RAW =
  `https://accounts.google.com/v3/signin/identifier?continue=${AZUL_CLEAN}` +
  `&followup=${AZUL_CLEAN}` +
  '&osid=1&passive=1209600&flowName=GlifWebSignIn&flowEntry=ServiceLogin&dsh=S1779555818:1790172118497245';

const AZUL_RAW_ENCODED =
  `https://accounts.google.com/v3/signin/identifier?continue=${encodeURIComponent(AZUL_CLEAN)}` +
  `&followup=${encodeURIComponent(AZUL_CLEAN)}&osid=1`;

const LATAM_RAW =
  'https://www.latamairlines.com/br/pt/boarding-pass?orderId=LA9573044YXJW&lastName=Carneiro&segmentIndex=0&itineraryId=2&origin=om' +
  '&utm_source=eim&utm_medium=wsp&utm_campaign=br_ltm_eim_wsp_dot_checkin_step1_conmaleta_nosbd_ok&messageId=am_checkin_step1_conmaleta_nosbd_ok';

const LATAM_CLEAN =
  'https://www.latamairlines.com/br/pt/boarding-pass?orderId=LA9573044YXJW&lastName=Carneiro&segmentIndex=0&itineraryId=2&origin=om';

module.exports = { AZUL_JWT, AZUL_CLEAN, AZUL_RAW, AZUL_RAW_ENCODED, LATAM_RAW, LATAM_CLEAN };
