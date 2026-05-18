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
};
