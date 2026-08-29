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

// Só o npm precisa de shell no Windows (é npm.cmd, não um .exe). Usar shell
// para tudo fazia cada comando git abrir um cmd.exe, e a janela do console
// piscava na tela do operador a cada chamada.
const PRECISA_SHELL = new Set(['npm', 'npx']);

function exec(cmd, args, opcoes = {}) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, {
      cwd: PROJECT_ROOT,
      shell: PRECISA_SHELL.has(cmd),
      windowsHide: true, // sem janela de console piscando
      maxBuffer: 10 * 1024 * 1024,
      ...opcoes,
    }, (err, stdout, stderr) => {
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

// Commit atual — lido uma vez só, na subida do servidor. Não muda enquanto o
// processo vive: toda atualização reinicia o Node. Antes era lido a cada
// abertura de Configurações, dois processos git por vez, e a tela ficava
// esperando isso no PC da loja. A leitura começa aqui e ninguém espera por
// ela; quem chamar a rota pega o resultado já pronto.
const INFO_GIT = (async () => {
  try {
    // Um comando só: hash e data do mesmo commit, separados por barra vertical.
    const [hash, data] = (await exec('git', ['log', '-1', '--format=%H|%ai'])).split('|');
    return { commit: hash.slice(0, 7), data: data.slice(0, 10) };
  } catch (err) {
    // Sem git (ou pasta que não é um clone): ainda dá pra informar a versão.
    return { commit: null, data: null, aviso: err.message };
  }
})();

// GET /api/sistema/versao — versão e commit atual.
// A versão é o que o operador lê; o commit fica como detalhe técnico (útil pra
// saber exatamente qual código está rodando quando a versão não mudou).
// Só informação LOCAL — nada de rede. Abrir Configurações não pode ficar
// esperando um git fetch: a checagem de novidade é sob demanda, no botão
// "Verificar atualizações" (ver /verificar-atualizacao).
router.get('/versao', async (req, res) => {
  res.json({ versao: VERSAO, ...(await INFO_GIT) });
});

// GET /api/sistema/verificar-atualizacao — consulta o servidor (tem rede).
// Conta quantos commits o remoto tem que o local ainda não tem: comparar hash
// não serve, porque o local pode estar À FRENTE (commits ainda não publicados).
router.get('/verificar-atualizacao', async (req, res) => {
  try {
    // Timeout curto: sem internet, o git fica ~20s tentando abrir a conexão
    // antes de desistir, e a tela fica travada esperando esse tempo todo.
    await exec('git', ['fetch'], { timeout: 12000 });
    const atras = Number(await exec('git', ['rev-list', '--count', 'HEAD..@{u}']));
    res.json({ temAtualizacao: atras > 0, commitsAtras: atras });
  } catch (err) {
    res.status(503).json({
      erro: 'Não foi possível consultar o servidor. Verifique a conexão com a internet.',
      detalhe: err.message,
    });
  }
});

// Arquivos que o próprio processo de atualização reescreve sozinho. O
// `npm install` reescreve o package-lock.json quando a versão do npm da loja
// difere da que gerou o lock, e o arquivo fica modificado sem ninguém ter
// editado nada. Na atualização seguinte o `git pull` aborta com "your local
// changes would be overwritten by merge" e o sistema trava até alguém abrir um
// terminal na loja. Como são arquivos gerados por máquina, descartar a versão
// local e ficar com a do repositório é sempre o que se quer.
const GERADOS_PELA_ATUALIZACAO = ['package-lock.json'];

async function descartarGerados() {
  // `--` garante que o git leia como caminho de arquivo, nunca como branch.
  // Falha quando o arquivo não está modificado — não é erro, é o caso normal.
  await exec('git', ['checkout', '--', ...GERADOS_PELA_ATUALIZACAO]).catch(() => {});
}

// Arquivos rastreados e modificados que NÃO são gerados pela atualização. Se
// houver algum, alguém editou o código na máquina da loja e o pull vai abortar
// — melhor dizer isso na tela do que deixar o git responder em inglês.
async function edicoesLocais() {
  const saida = await exec('git', ['status', '--porcelain']).catch(() => '');
  return saida
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => l.replace(/^\S+\s+/, ''))
    .filter((arquivo) => !GERADOS_PELA_ATUALIZACAO.includes(arquivo));
}

// POST /api/sistema/atualizar — streaming de git pull → npm install → npm run build → restart
router.post('/atualizar', async (req, res) => {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Transfer-Encoding', 'chunked');

  const write = (msg) => res.write(msg + '\n');

  try {
    // 1. git pull
    write('[1/3] Atualizando código...');
    await descartarGerados();

    const editados = await edicoesLocais();
    if (editados.length) {
      throw new Error(
        `há arquivos modificados nesta máquina que o pull sobrescreveria: ${editados.join(', ')}. ` +
        'Alguém editou o código aqui. Resolva isso antes de atualizar.'
      );
    }

    const antes = await exec('git', ['rev-parse', 'HEAD']).catch(() => '');
    await exec('git', ['pull', 'origin']);
    const depois = await exec('git', ['rev-parse', 'HEAD']).catch(() => '');
    write('✓ Código atualizado');

    // 2. npm install — só quando as dependências realmente mudaram. Antes isso
    // comparava o HEAD antes/depois do pull, ou seja, reinstalava tudo a cada
    // commit novo, mesmo em mudança só de front. Nesse PC o install é a etapa
    // mais lenta da atualização.
    //
    // Olha só o package-lock.json, nunca o package.json: é lá que fica o número
    // da versão, então todo lançamento mexe nele e a checagem daria sempre
    // positiva. Trocar dependência sem o npm reescrever o lock não acontece.
    write('[2/3] Verificando dependências...');
    const mudouDependencia = antes && depois && antes !== depois
      ? (await exec('git', ['diff', '--name-only', `${antes}..${depois}`]))
          .split('\n')
          .some((f) => f.trim() === 'package-lock.json')
      : false;

    if (mudouDependencia) {
      write('Instalando dependências...');
      await exec('npm', ['install']);
      // O install pode ter reescrito o lock de novo. Limpa aqui também, senão
      // a próxima atualização já começa com a pasta suja.
      await descartarGerados();
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
        windowsHide: true,
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
