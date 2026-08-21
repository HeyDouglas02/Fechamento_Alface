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

function salvarToken(tokens) {
  writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
}

function lerLogBackup() {
  if (!existsSync(LOG_PATH)) return { ultimoBackup: null };
  try {
    return JSON.parse(readFileSync(LOG_PATH, 'utf-8'));
  } catch {
    return { ultimoBackup: null };
  }
}

function salvarLogBackup(log) {
  writeFileSync(LOG_PATH, JSON.stringify(log, null, 2));
}

function dataHoje() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export async function uploadBackup(dbPath) {
  const token = lerToken();
  if (!token) {
    console.warn('[Backup] Google Drive não conectado — ignorando backup');
    return false;
  }

  if (!existsSync(dbPath)) {
    console.warn(`[Backup] Banco não encontrado em ${dbPath}`);
    return false;
  }

  try {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      'http://localhost:3001/api/sistema/google/callback'
    );
    oauth2Client.setCredentials(token);

    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    // Verifica/cria pasta "Fechamento Alface Backups"
    const query = "name='Fechamento Alface Backups' and mimeType='application/vnd.google-apps.folder' and trashed=false";
    const rootSearch = await drive.files.list({ q: query, spaces: 'drive', pageSize: 1 });
    let folderId;

    if (rootSearch.data.files.length > 0) {
      folderId = rootSearch.data.files[0].id;
    } else {
      // Cria a pasta
      const folderMeta = {
        name: 'Fechamento Alface Backups',
        mimeType: 'application/vnd.google-apps.folder',
      };
      const createdFolder = await drive.files.create({ resource: folderMeta, fields: 'id' });
      folderId = createdFolder.data.id;
    }

    // Upload do backup com nome data-based
    const hoje = dataHoje();
    const fileName = `fechamento_${hoje}.db`;
    const fileMetadata = {
      name: fileName,
      parents: [folderId],
    };

    const media = {
      mimeType: 'application/octet-stream',
      body: createReadStream(dbPath),
    };

    await drive.files.create({ resource: fileMetadata, media, fields: 'id' });

    // Atualiza log
    const log = { ultimoBackup: hoje, proxima: null };
    salvarLogBackup(log);

    console.log(`[Backup] ✓ Backup realizado: ${fileName}`);
    return true;
  } catch (err) {
    console.error(`[Backup] Erro ao fazer upload: ${err.message}`);
    return false;
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
