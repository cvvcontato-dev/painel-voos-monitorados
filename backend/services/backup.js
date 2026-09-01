const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const db = require('../database');

// Os backups ficam dentro do mesmo volume persistente do banco (/data em produção).
const dataDir = process.env.DB_PATH || path.join(__dirname, '..');
const BACKUP_DIR = path.join(dataDir, 'backups');
const PREFIX = 'database-';
const SUFFIX = '.sqlite';
// Formato: database-AAAAMMDD-HHmmss.sqlite (horário de Brasília), com sufixo
// -NN quando duas cópias caem no mesmo segundo.
const FILE_RE = /^database-\d{8}-\d{6}(-\d{2})?\.sqlite$/;

function keepCount() {
  const n = parseInt(process.env.BACKUP_KEEP, 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 365) : 14;
}

function isEnabled() {
  return (process.env.BACKUP_ENABLED || '1') !== '0';
}

/** Carimbo de tempo em Brasília (UTC-3), legível e ordenável. */
function stamp(d = new Date()) {
  const b = new Date(d.getTime() - 3 * 60 * 60 * 1000);
  const p = n => String(n).padStart(2, '0');
  return `${b.getUTCFullYear()}${p(b.getUTCMonth() + 1)}${p(b.getUTCDate())}-`
       + `${p(b.getUTCHours())}${p(b.getUTCMinutes())}${p(b.getUTCSeconds())}`;
}

function ensureDir() {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

/** Lista os backups existentes, mais recentes primeiro. */
function listBackups() {
  try {
    ensureDir();
    return fs.readdirSync(BACKUP_DIR)
      .filter(f => FILE_RE.test(f))
      .map(f => {
        const st = fs.statSync(path.join(BACKUP_DIR, f));
        return { arquivo: f, bytes: st.size, criado_em: st.mtime.toISOString() };
      })
      .sort((a, b) => b.criado_em.localeCompare(a.criado_em));
  } catch (err) {
    console.error('[BACKUP] Falha ao listar:', err.message);
    return [];
  }
}

/** Remove os backups além do limite de retenção. Retorna quantos apagou. */
function rotate() {
  const keep = keepCount();
  const all = listBackups();
  const excedentes = all.slice(keep);
  let apagados = 0;
  for (const b of excedentes) {
    try { fs.unlinkSync(path.join(BACKUP_DIR, b.arquivo)); apagados++; }
    catch (err) { console.error(`[BACKUP] Não consegui apagar ${b.arquivo}:`, err.message); }
  }
  return apagados;
}

// Serializa as execucoes: o cron, o backup de boot e o botao manual podem
// coincidir, e duas chamadas concorrentes escolheriam o mesmo nome de arquivo
// (o VACUUM INTO recusa destino existente e uma delas falharia).
let emAndamento = null;

/**
 * Gera um snapshot consistente com VACUUM INTO — funciona com o banco em uso,
 * sem travar escritas, e já entrega o arquivo compactado (sem páginas livres).
 * Chamadas concorrentes compartilham o mesmo backup em andamento.
 */
function runBackup() {
  if (emAndamento) return emAndamento;
  emAndamento = executarBackup().finally(() => { emAndamento = null; });
  return emAndamento;
}

function executarBackup() {
  return new Promise((resolve) => {
    if (!isEnabled()) return resolve({ ok: false, motivo: 'desativado' });

    let destino;
    try {
      ensureDir();
      // VACUUM INTO recusa arquivo existente: procura um nome livre no mesmo segundo.
      const base = `${PREFIX}${stamp()}`;
      destino = path.join(BACKUP_DIR, `${base}${SUFFIX}`);
      for (let i = 1; fs.existsSync(destino) && i <= 99; i++) {
        destino = path.join(BACKUP_DIR, `${base}-${String(i).padStart(2, '0')}${SUFFIX}`);
      }
      if (fs.existsSync(destino)) return resolve({ ok: false, motivo: 'sem_nome_livre' });
    } catch (err) {
      console.error('[BACKUP] Não consegui preparar o diretório:', err.message);
      return resolve({ ok: false, motivo: err.message });
    }

    const inicio = Date.now();
    // Aspas simples duplicadas para escapar o caminho no literal SQL.
    db.run(`VACUUM INTO '${destino.replace(/'/g, "''")}'`, (err) => {
      if (err) {
        console.error('[BACKUP] VACUUM INTO falhou:', err.message);
        return resolve({ ok: false, motivo: err.message });
      }
      let bytes = 0;
      try { bytes = fs.statSync(destino).size; } catch { /* ignore */ }
      const apagados = rotate();
      const ms = Date.now() - inicio;
      console.log(`[BACKUP] ${path.basename(destino)} — ${(bytes / 1024).toFixed(0)} KB em ${ms}ms`
                + `${apagados ? ` | ${apagados} antigo(s) removido(s)` : ''}`);
      resolve({ ok: true, arquivo: path.basename(destino), bytes, duracao_ms: ms, removidos: apagados });
    });
  });
}

let backupJob = null;

/** Cron diário às 03:00 (América/São_Paulo) + um backup logo após o boot. */
function startBackupScheduler() {
  if (!isEnabled()) {
    console.log('[BACKUP] Desativado por BACKUP_ENABLED=0');
    return null;
  }
  if (backupJob) { backupJob.stop(); backupJob = null; }

  const timezone = 'America/Sao_Paulo';
  backupJob = cron.schedule('0 3 * * *', async () => {
    try { await runBackup(); }
    catch (err) { console.error('[BACKUP] Erro no ciclo:', err.message); }
  }, { timezone });

  console.log(`[BACKUP] Agendado: 03:00 (${timezone}) | retenção: ${keepCount()} cópias | destino: ${BACKUP_DIR}`);

  // Após um deploy, garante uma cópia — mas só se a última já tiver mais de 12h,
  // para não gerar uma pilha de backups quando há vários deploys seguidos.
  setTimeout(async () => {
    try {
      const ultimo = listBackups()[0];
      const velho = !ultimo || (Date.now() - new Date(ultimo.criado_em).getTime()) > 12 * 3600 * 1000;
      if (velho) await runBackup();
      else console.log('[BACKUP] Backup recente encontrado no boot, pulando.');
    } catch (err) { console.error('[BACKUP] Erro no backup de boot:', err.message); }
  }, 30000).unref?.();

  return backupJob;
}

/** Resolve o caminho de um backup validando o nome (evita path traversal). */
function resolveBackupPath(nome) {
  if (!FILE_RE.test(nome)) return null;
  const alvo = path.join(BACKUP_DIR, nome);
  // Confere que o caminho final continua dentro do diretório de backups.
  if (path.dirname(path.resolve(alvo)) !== path.resolve(BACKUP_DIR)) return null;
  return fs.existsSync(alvo) ? alvo : null;
}

module.exports = { runBackup, listBackups, rotate, startBackupScheduler, resolveBackupPath, BACKUP_DIR };
