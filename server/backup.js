import { google } from 'googleapis';
import { createReadStream, existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TOKEN_PATH = path.join(__dirname, 'data', 'google-token.json');
const LOG_PATH = path.join(__dirname, 'data', 'backup-log.json');

function lerToken() {
  if (!existsSync(TOKEN_PATH)) return null;
  try {
    return JSON.parse(readFileSync(TOKEN_PATH, 'utf-8'));
  } catch {
    return null;
  }
}

function lerLogBackup() {
  if (!existsSync(LOG_PATH)) return { ultimoBackup: null, folderId: null };
  try {
    return JSON.parse(readFileSync(LOG_PATH, 'utf-8'));
  } catch {
    return { ultimoBackup: null, folderId: null };
  }
}

function salvarLogBackup(log) {
  writeFileSync(LOG_PATH, JSON.stringify(log, null, 2));
}

function dataHoje() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Faz o upload e devolve { ok, erro }. O motivo da falha sobe junto: engolir o
// erro e mostrar só "falha" deixa quem opera sem saber o que corrigir.
export async function uploadBackup(dbPath) {
  const token = lerToken();
  if (!token) {
    console.warn('[Backup] Google Drive não conectado — ignorando backup');
    return { ok: false, erro: 'Google Drive não conectado. Use "Conectar Google Drive" primeiro.' };
  }

  if (!existsSync(dbPath)) {
    console.warn(`[Backup] Banco não encontrado em ${dbPath}`);
    return { ok: false, erro: `Banco de dados não encontrado em ${dbPath}.` };
  }

  try {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      'http://localhost:3001/api/sistema/google/callback'
    );
    oauth2Client.setCredentials(token);

    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    // Pasta "Fechamento Alface Backups". O ID é guardado depois da primeira
    // criação e reusado dali em diante — buscar por nome toda vez tem corrida
    // (duas chamadas simultâneas podem não ver a pasta uma da outra e criar
    // duas pastas iguais).
    let log = lerLogBackup();
    let folderId = log.folderId;

    if (folderId) {
      // Confirma que a pasta salva ainda existe e não foi pra lixeira.
      try {
        const info = await drive.files.get({ fileId: folderId, fields: 'id, trashed' });
        if (info.data.trashed) folderId = null;
      } catch {
        folderId = null;
      }
    }

    if (!folderId) {
      const query = "name='Fechamento Alface Backups' and mimeType='application/vnd.google-apps.folder' and trashed=false";
      const rootSearch = await drive.files.list({ q: query, spaces: 'drive', pageSize: 1 });

      if (rootSearch.data.files.length > 0) {
        folderId = rootSearch.data.files[0].id;
      } else {
        const folderMeta = {
          name: 'Fechamento Alface Backups',
          mimeType: 'application/vnd.google-apps.folder',
        };
        const createdFolder = await drive.files.create({ resource: folderMeta, fields: 'id' });
        folderId = createdFolder.data.id;
      }

      salvarLogBackup({ ...log, folderId });
    }

    // Upload do backup com nome data-based. Se já existe um backup de hoje
    // (rodou 2x no mesmo dia, manual + agendado, etc.), sobrescreve em vez de
    // duplicar — o Drive não impede nomes repetidos numa pasta.
    const hoje = dataHoje();
    const fileName = `fechamento_${hoje}.db`;
    const media = {
      mimeType: 'application/octet-stream',
      body: createReadStream(dbPath),
    };

    const existenteQuery = `name='${fileName}' and '${folderId}' in parents and trashed=false`;
    const existente = await drive.files.list({ q: existenteQuery, spaces: 'drive', pageSize: 1 });

    if (existente.data.files.length > 0) {
      await drive.files.update({ fileId: existente.data.files[0].id, media });
    } else {
      const fileMetadata = { name: fileName, parents: [folderId] };
      await drive.files.create({ resource: fileMetadata, media, fields: 'id' });
    }

    // Atualiza log (preserva o folderId já salvo)
    salvarLogBackup({ ...lerLogBackup(), ultimoBackup: hoje, folderId });

    console.log(`[Backup] ✓ Backup realizado: ${fileName}`);
    return { ok: true, arquivo: fileName };
  } catch (err) {
    // A googleapis embute o motivo em lugares diferentes conforme o tipo de
    // falha (HTTP, OAuth, rede).
    const detalhe =
      err?.response?.data?.error_description ||
      err?.response?.data?.error?.message ||
      err?.errors?.[0]?.message ||
      err?.message ||
      'erro desconhecido';
    console.error(`[Backup] Erro ao fazer upload: ${detalhe}`);

    // Token revogado/expirado é o caso mais comum e tem conserto claro.
    const precisaReconectar =
      /invalid_grant|invalid_token|unauthorized|Token has been expired or revoked/i.test(detalhe);
    return {
      ok: false,
      erro: precisaReconectar
        ? 'A autorização do Google expirou. Clique em "Conectar Google Drive" para autorizar de novo.'
        : `Falha no backup: ${detalhe}`,
      precisaReconectar,
    };
  }
}

export function statusBackup() {
  const token = lerToken();
  const log = lerLogBackup();

  return {
    conectado: !!token,
    ultimoBackup: log.ultimoBackup,
  };
}
