import express from 'express';
import { execFile, spawn } from 'node:child_process';
import { createReadStream, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { google } from 'googleapis';
import { uploadBackup, statusBackup } from '../backup.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// server/routes/sistema.js -> sobe 2 níveis (routes -> server -> raiz do
// repo, onde ficam .git e package.json).
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

const router = express.Router();

function exec(cmd, args, cwd = PROJECT_ROOT) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { cwd, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr || err.message));
      else resolve(stdout.trim());
    });
  });
}

// GET /api/sistema/versao — commit atual e status de atualização
router.get('/versao', async (req, res) => {
  try {
    const commitHash = await exec('git', ['rev-parse', 'HEAD']);
    const commitDate = await exec('git', ['log', '-1', '--format=%ai', commitHash]);

    // Tenta buscar do remoto (pode falhar se offline). Conta quantos commits o
    // branch remoto tem que o local ainda não tem — não basta comparar hash,
    // porque o local pode estar À FRENTE (commits locais não publicados).
    let temAtualizacao = false;
    try {
      await exec('git', ['fetch']);
      const atras = await exec('git', ['rev-list', '--count', 'HEAD..@{u}']);
      temAtualizacao = Number(atras) > 0;
    } catch {
      // Offline, ou sem upstream configurado — fica como false
    }

    res.json({
      commit: commitHash.slice(0, 7),
      data: commitDate.slice(0, 10),
      temAtualizacao,
    });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// POST /api/sistema/atualizar — streaming de git pull → npm install → npm run build → restart
router.post('/atualizar', async (req, res) => {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Transfer-Encoding', 'chunked');

  const write = (msg) => res.write(msg + '\n');

  try {
    // 1. git pull
    write('[1/3] Atualizando código...');
    const beforePullHash = await exec('git', ['rev-parse', 'HEAD']).catch(() => '');
    await exec('git', ['pull', 'origin']);
    write('✓ Código atualizado');

    // 2. npm install (só se package-lock.json mudou)
    write('[2/3] Verificando dependências...');
    const afterPullHash = await exec('git', ['rev-parse', 'HEAD']).catch(() => '');
    const packageLockChanged = beforePullHash !== afterPullHash;

    if (packageLockChanged) {
      write('Instalando dependências...');
      await exec('npm', ['install']);
      write('✓ Dependências instaladas');
    } else {
      write('✓ Dependências sem alteração');
    }

    // 3. npm run build
    write('[3/3] Compilando frontend...');
    await exec('npm', ['run', 'build']);
    write('✓ Frontend compilado');

    // 4. Sucesso — reinicia o servidor
    write('✓ Atualização concluída');
    write('Reiniciando servidor...');
    res.write('SUCCESS\n');
    res.end();

    // Aguarda 500ms pra que o cliente receba a resposta, depois mata o processo e deixa que seja reiniciado
    setTimeout(() => {
      // Spawn um novo processo Node (detached) pra executar o server novamente
      const newProcess = spawn('node', ['server/index.js'], {
        cwd: PROJECT_ROOT,
        detached: true,
        stdio: 'ignore',
        env: { ...process.env, ABRIR_NAVEGADOR: '0' }, // Não abre navegador em restart automático
      });
      newProcess.unref();

      // Mata o processo atual
      process.exit(0);
    }, 500);
  } catch (err) {
    write(`ERRO: ${err.message}`);
    res.end();
  }
});

// GET /api/sistema/google/status — status da conexão e último backup
router.get('/google/status', (req, res) => {
  const status = statusBackup();
  res.json(status);
});

// GET /api/sistema/google/auth-url — URL de consentimento OAuth
router.get('/google/auth-url', (req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return res.status(400).json({ erro: 'Credenciais do Google não configuradas no .env (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET).' });
  }
  try {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      'http://localhost:3001/api/sistema/google/callback'
    );

    const scopes = ['https://www.googleapis.com/auth/drive.file'];
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
    });

    res.json({ authUrl });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// GET /api/sistema/google/callback — troca code por token
router.get('/google/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).send('Código não fornecido');

  try {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      'http://localhost:3001/api/sistema/google/callback'
    );

    const { tokens } = await oauth2Client.getToken(code);
    const tokenPath = path.join(__dirname, '..', 'data', 'google-token.json');
    const fs = await import('node:fs');
    fs.writeFileSync(tokenPath, JSON.stringify(tokens, null, 2));

    res.send('✓ Google Drive conectado! Você pode fechar esta aba e voltar ao sistema.');
  } catch (err) {
    res.status(500).send(`Erro: ${err.message}`);
  }
});

// POST /api/sistema/google/backup-agora — backup manual
router.post('/google/backup-agora', async (req, res) => {
  const db = req.app.locals.db;
  const dbPath = db.path;

  try {
    const sucesso = await uploadBackup(dbPath);
    if (sucesso) {
      res.json({ ok: true, msg: 'Backup realizado com sucesso' });
    } else {
      res.status(500).json({ erro: 'Falha ao fazer backup' });
    }
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

export default router;
