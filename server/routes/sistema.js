import express from 'express';
import { execFile, spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
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
    // shell: true — no Windows, "npm" é npm.cmd; execFile sem shell não acha.
    execFile(cmd, args, { cwd, shell: true, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr || err.message));
      else resolve(stdout.trim());
    });
  });
}

// Versão do sistema (package.json). Lida uma vez no boot.
const VERSAO = (() => {
  try {
    return JSON.parse(readFileSync(path.join(PROJECT_ROOT, 'package.json'), 'utf-8')).version || '—';
  } catch {
    return '—';
  }
})();

// GET /api/sistema/versao — versão, commit atual e status de atualização.
// A versão é o que o operador lê; o commit fica como detalhe técnico (útil pra
// saber exatamente qual código está rodando quando a versão não mudou).
// Só informação LOCAL — nada de rede. Abrir Configurações não pode ficar
// esperando um git fetch: a checagem de novidade é sob demanda, no botão
// "Verificar atualizações" (ver /verificar-atualizacao).
router.get('/versao', async (req, res) => {
  try {
    const commitHash = await exec('git', ['rev-parse', 'HEAD']);
    const commitDate = await exec('git', ['log', '-1', '--format=%ai', commitHash]);
    res.json({ versao: VERSAO, commit: commitHash.slice(0, 7), data: commitDate.slice(0, 10) });
  } catch (err) {
    // Sem git (ou pasta que não é um clone): ainda dá pra informar a versão.
    res.json({ versao: VERSAO, commit: null, data: null, aviso: err.message });
  }
});

// GET /api/sistema/verificar-atualizacao — consulta o servidor (tem rede).
// Conta quantos commits o remoto tem que o local ainda não tem: comparar hash
// não serve, porque o local pode estar À FRENTE (commits ainda não publicados).
router.get('/verificar-atualizacao', async (req, res) => {
  try {
    await exec('git', ['fetch']);
    const atras = Number(await exec('git', ['rev-list', '--count', 'HEAD..@{u}']));
    res.json({ temAtualizacao: atras > 0, commitsAtras: atras });
  } catch (err) {
    res.status(503).json({
      erro: 'Não foi possível consultar o servidor. Verifique a conexão com a internet.',
      detalhe: err.message,
    });
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

// Credenciais só valem se estiverem preenchidas de verdade — o .env.example vem
// com textos de exemplo, e deixá-los passar gera uma URL que o Google rejeita
// com "401 invalid_client", erro que não diz o que está faltando.
function credenciaisGoogleOk() {
  const id = (process.env.GOOGLE_CLIENT_ID || '').trim();
  const secret = (process.env.GOOGLE_CLIENT_SECRET || '').trim();
  if (!id || !secret) return false;
  if (id.includes('aqui') || secret.includes('aqui')) return false; // placeholders do .env.example
  return id.endsWith('.apps.googleusercontent.com');
}

const ERRO_CREDENCIAIS =
  'Credenciais do Google não configuradas. Preencha GOOGLE_CLIENT_ID e ' +
  'GOOGLE_CLIENT_SECRET no arquivo .env com os valores do Google Cloud e ' +
  'reinicie o sistema.';

// GET /api/sistema/google/status — status da conexão e último backup
router.get('/google/status', (req, res) => {
  const status = statusBackup();
  res.json({ ...status, configurado: credenciaisGoogleOk() });
});

// GET /api/sistema/google/auth-url — URL de consentimento OAuth
router.get('/google/auth-url', (req, res) => {
  if (!credenciaisGoogleOk()) {
    return res.status(400).json({ erro: ERRO_CREDENCIAIS });
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
    const r = await uploadBackup(dbPath);
    if (r.ok) {
      res.json({ ok: true, msg: `Backup enviado: ${r.arquivo}` });
    } else {
      // O motivo vem junto — quem opera precisa saber o que corrigir.
      res.status(500).json({ erro: r.erro, precisaReconectar: !!r.precisaReconectar });
    }
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

export default router;
