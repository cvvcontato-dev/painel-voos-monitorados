/**
 * Jest globalSetup — runs once before any test file or module loads.
 * Deletes SQLite test databases so each full-suite run starts clean,
 * avoiding Windows file-lock issues that prevent deletion at module load time.
 */
const path = require('path');
const fs = require('fs');

module.exports = async function globalSetup() {
  const tmpDir = path.join(__dirname, '.tmp');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

  const filesToDelete = [
    path.join(tmpDir, 'database.sqlite'),
    path.join(tmpDir, 'sessions-test.sqlite'),
    // WAL-mode journal files
    path.join(tmpDir, 'database.sqlite-shm'),
    path.join(tmpDir, 'database.sqlite-wal'),
    path.join(tmpDir, 'sessions-test.sqlite-shm'),
    path.join(tmpDir, 'sessions-test.sqlite-wal'),
  ];

  for (const f of filesToDelete) {
    try { fs.unlinkSync(f); } catch (_) { /* not found or locked — OK */ }
  }

  // PDFs guardados de execuções anteriores: os ids de voucher se repetem a cada banco novo e um arquivo velho
  // (mesmo id + mesmo hash) faz testes de "nenhum PDF guardado" falharem de forma intermitente.
  const pdfDir = path.join(tmpDir, 'voucher-pdfs');
  try { for (const f of fs.readdirSync(pdfDir)) { try { fs.unlinkSync(path.join(pdfDir, f)); } catch (_) { /* ignora */ } } } catch (_) { /* pasta ausente */ }
};
