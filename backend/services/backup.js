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

// Fotos do banco de fundos: <dataDir>/promo-backgrounds → backups/fundos-<carimbo>/
const BG_SRC = path.join(dataDir, 'promo-backgrounds');
const BG_PREFIX = 'fundos-';
const BG_RE = /^fundos-\d{8}-\d{6}(-\d{2})?$/;
const BG_TMP_RE = /^fundos-\d{8}-\d{6}(-\d{2})?\.tmp$/;
const BG_FILE_RE = /^[a-z0-9][a-z0-9-]*\.(jpg|png|webp)$/;

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

function fotosDoBackup(arquivo) {
  const pasta = path.join(BACKUP_DIR, BG_PREFIX + arquivo.slice(PREFIX.length, -SUFFIX.length));
  try { return fs.readdirSync(pasta).filter(f => BG_FILE_RE.test(f)).length; } catch { return 0; }
}

/** Lista os backups existentes, mais recentes primeiro. */
function listBackups() {
  try {
    ensureDir();
    return fs.readdirSync(BACKUP_DIR)
      .filter(f => FILE_RE.test(f))
      .map(f => {
        try {
          const st = fs.statSync(path.join(BACKUP_DIR, f));
          return { arquivo: f, bytes: st.size, criado_em: st.mtime.toISOString(), fotos: fotosDoBackup(f) };
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .sort((a, b) => b.criado_em.localeCompare(a.criado_em));
  } catch (err) {
    console.error('[BACKUP] Falha ao listar:', err.message);
    return [];
  }
}

// Erros de hard link que justificam cair para cópia (outro FS, permissão, limite de links).
const LINK_FALLBACK = new Set(['EXDEV', 'EPERM', 'EMLINK', 'ENOTSUP', 'EACCES']);

/**
 * Copia as fotos de fundo para backups/fundos-<carimbo>/ (hard link; cópia como fallback).
 * As fotos são imutáveis (nome aleatório, gravadas uma só vez), por isso o hard link é seguro.
 * Monta em .tmp e só renomeia no fim, para uma falha no meio não deixar pasta parcial.
 * Síncrono de propósito, como o restante do módulo (poucas fotos pequenas).
 */
function backupBackgrounds(carimbo) {
  const tmp = path.join(BACKUP_DIR, `${BG_PREFIX}${carimbo}.tmp`);
  try {
    // Sobras de uma execução interrompida.
    try {
      for (const f of fs.readdirSync(BACKUP_DIR).filter(f => BG_TMP_RE.test(f))) {
        fs.rmSync(path.join(BACKUP_DIR, f), { recursive: true, force: true });
      }
    } catch { /* diretório ainda não existe */ }

    if (!fs.existsSync(BG_SRC)) return { ok: true, arquivos: 0, pasta: null };
    const arquivos = fs.readdirSync(BG_SRC).filter(f => BG_FILE_RE.test(f));
    if (!arquivos.length) return { ok: true, arquivos: 0, pasta: null };
    ensureDir();
    fs.mkdirSync(tmp, { recursive: true });
    let copiados = 0;
    for (const f of arquivos) {
      const origem = path.join(BG_SRC, f);
      const destino = path.join(tmp, f);
      try {
        try { fs.linkSync(origem, destino); }
        catch (err) {
          if (!LINK_FALLBACK.has(err.code)) throw err;
          fs.copyFileSync(origem, destino);
        }
        copiados++;
      } catch (err) {
        if (err.code === 'ENOENT') continue; // foto removida entre a listagem e a cópia
        throw err;
      }
    }
    if (!copiados) {
      fs.rmSync(tmp, { recursive: true, force: true });
      return { ok: true, arquivos: 0, pasta: null };
    }
    const pasta = path.join(BACKUP_DIR, BG_PREFIX + carimbo);
    fs.rmSync(pasta, { recursive: true, force: true });
    fs.renameSync(tmp, pasta);
    return { ok: true, arquivos: copiados, pasta: path.basename(pasta) };
  } catch (err) {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ }
    console.error('[BACKUP] Falha ao copiar as fotos de fundo:', err.message);
    return { ok: false, arquivos: 0, erro: err.message };
  }
}

/** Apaga as pastas de fotos cujo backup do banco (mesmo carimbo) não existe mais. */
function rotateBackgrounds(backupsConhecidos) {
  try {
    let carimbos;
    if (Array.isArray(backupsConhecidos)) {
      carimbos = backupsConhecidos.map(b => b.arquivo.slice(PREFIX.length, -SUFFIX.length));
    } else {
      carimbos = fs.readdirSync(BACKUP_DIR)
        .filter(f => FILE_RE.test(f))
        .map(f => f.slice(PREFIX.length, -SUFFIX.length));
    }

    const pastasFundos = fs.readdirSync(BACKUP_DIR).filter(f => BG_RE.test(f));
    if (!pastasFundos.length) return;

    // Proteção: se não encontrou nenhum backup de banco, preserva os fundos para evitar
    // deleção acidental causada por falha de leitura ou lista vazia inesperada.
    if (!carimbos.length) {
      console.warn('[BACKUP] Nenhum backup de banco identificado; preservando pastas de fundos.');
      return;
    }

    const vivos = new Set(carimbos);
    for (const p of pastasFundos) {
      if (vivos.has(p.slice(BG_PREFIX.length))) continue;
      try { fs.rmSync(path.join(BACKUP_DIR, p), { recursive: true, force: true }); }
      catch (err) { console.error(`[BACKUP] Não consegui apagar ${p}:`, err.message); }
    }
  } catch { /* diretório ainda não existe */ }
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
  const sobreviventes = all.slice(0, keep);
  rotateBackgrounds(sobreviventes);
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

    let destino, base;
    try {
      ensureDir();
      // VACUUM INTO recusa arquivo existente: procura um nome livre no mesmo segundo.
      base = `${PREFIX}${stamp()}`;
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
      const fotos = backupBackgrounds(base.slice(PREFIX.length));
      const apagados = rotate();
      const ms = Date.now() - inicio;
      console.log(`[BACKUP] ${path.basename(destino)} — ${(bytes / 1024).toFixed(0)} KB em ${ms}ms`
                + `${fotos.arquivos ? ` | ${fotos.arquivos} foto(s) de fundo` : ''}`
                + `${fotos.ok ? '' : ` | FALHA nas fotos: ${fotos.erro}`}`
                + `${apagados ? ` | ${apagados} antigo(s) removido(s)` : ''}`);
      resolve({ ok: true, arquivo: path.basename(destino), bytes, duracao_ms: ms, removidos: apagados, fotos });
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

module.exports = { runBackup, listBackups, rotate, startBackupScheduler, resolveBackupPath, BACKUP_DIR, backupBackgrounds, BG_RE, rotateBackgrounds };
