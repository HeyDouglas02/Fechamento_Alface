// Diagnóstico de atualização — confere se o botão "Atualizar agora" vai
// funcionar neste computador, SEM alterar nada.
//
//   npm run diagnostico
//
// Roda os mesmos comandos que a atualização usaria (git, npm, build), mas nunca
// executa `git pull` nem reinicia o servidor. Serve para descobrir na hora da
// instalação — e não meses depois, na primeira atualização — que falta o git,
// que a pasta não é um clone, que não há permissão de escrita, etc.

import { exec as execCb } from 'node:child_process';
import { accessSync, constants, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Comandos fixos, sem interpolação de entrada do usuário.
function exec(comando) {
  return new Promise((resolve, reject) => {
    execCb(comando, { cwd: RAIZ, maxBuffer: 10 * 1024 * 1024, timeout: 180000 },
      (err, stdout, stderr) => {
        if (err) reject(new Error((stderr || err.message).trim().split('\n')[0]));
        else resolve(String(stdout));
      });
  });
}

let problemas = 0;
function ok(titulo, detalhe = '') {
  console.log(`  OK    ${titulo}${detalhe ? ` — ${detalhe}` : ''}`);
}
function falha(titulo, motivo, comoResolver) {
  problemas++;
  console.log(`  FALHA ${titulo}`);
  console.log(`        motivo: ${motivo}`);
  console.log(`        como resolver: ${comoResolver}`);
}
function aviso(titulo, detalhe) {
  console.log(`  aviso ${titulo} — ${detalhe}`);
}

console.log('\nDIAGNÓSTICO DE ATUALIZAÇÃO');
console.log('='.repeat(66));
console.log(`Pasta: ${RAIZ}\n`);

// 1. Node
try {
  const v = (await exec('node --version')).trim();
  const maior = Number(v.replace('v', '').split('.')[0]);
  if (maior >= 18) ok('Node.js instalado', v);
  else falha('Node.js muito antigo', `versão ${v}`, 'instale a versão LTS em https://nodejs.org');
} catch (e) {
  falha('Node.js', e.message, 'instale a versão LTS em https://nodejs.org');
}

// 2. Git
try {
  ok('Git instalado', (await exec('git --version')).trim());
} catch (e) {
  falha('Git não encontrado', e.message,
    'instale em https://git-scm.com/download/win e reinicie o computador');
}

// 3. A pasta é um clone do Git?
let ehClone = false;
try {
  await exec('git rev-parse --is-inside-work-tree');
  ehClone = true;
  ok('A pasta é um clone do Git');
} catch {
  falha('A pasta não é um clone do Git',
    'foi instalada copiando arquivos (zip), não com git clone',
    'refaça a instalação com "git clone" — sem isso a atualização remota nunca funciona');
}

// 4. Remote configurado
if (ehClone) {
  try {
    const remote = (await exec('git remote get-url origin')).trim();
    ok('Repositório de origem configurado', remote);
  } catch {
    falha('Sem repositório de origem', 'nenhum remote "origin" configurado',
      'rode: git remote add origin <URL-DO-REPOSITORIO>');
  }

  // 5. Branch com upstream (é o que o "atualização disponível" consulta)
  try {
    const upstream = (await exec('git rev-parse --abbrev-ref "@{u}"')).trim();
    ok('Branch acompanha o remoto', upstream);
  } catch {
    falha('Branch sem upstream', 'o branch local não está ligado a um do servidor',
      'rode: git branch --set-upstream-to=origin/main');
  }

  // 6. Internet + acesso ao repositório (o mesmo fetch que a atualização faz)
  try {
    await exec('git fetch --dry-run');
    ok('Consegue acessar o repositório', 'internet e credenciais funcionando');
  } catch (e) {
    falha('Não consegue acessar o repositório', e.message,
      'confira a internet; se o repositório for privado, configure as credenciais do Git');
  }

  // 7. Alterações locais que travariam o git pull
  try {
    // Cada linha vem como "XY caminho" (XY = status de 2 colunas). Corta pelo
    // primeiro bloco de espaços em vez de posição fixa, porque a coluna 1 pode
    // ser espaço e sumir num trim.
    const linhas = (await exec('git status --porcelain'))
      .split('\n').map((l) => l.trim()).filter(Boolean)
      .map((l) => l.replace(/^\S+\s+/, ''));
    if (!linhas.length) ok('Nenhuma alteração local pendente');
    else {
      aviso('Há arquivos modificados na pasta',
        `${linhas.length} arquivo(s) — o git pull pode dar conflito`);
      console.log(`        ${linhas.slice(0, 5).join(', ')}${linhas.length > 5 ? ', …' : ''}`);
    }
  } catch { /* já reportado acima */ }
}

// 8. Permissão de escrita (o build reescreve dist/, o pull reescreve a pasta)
try {
  accessSync(RAIZ, constants.W_OK);
  ok('Permissão de escrita na pasta');
} catch {
  falha('Sem permissão de escrita', 'o Windows está bloqueando alterações na pasta',
    'mova o sistema para uma pasta do usuário (ex: C:\\Fechamento_Alface_v2)');
}

// 9. npm funciona (a atualização chama npm install e npm run build)
try {
  ok('npm disponível', 'v' + (await exec('npm --version')).trim());
} catch (e) {
  falha('npm não encontrado', e.message, 'reinstale o Node.js (o npm vem junto)');
}

// 10. Dependências instaladas
if (existsSync(path.join(RAIZ, 'node_modules'))) ok('Dependências instaladas');
else falha('Dependências ausentes', 'a pasta node_modules não existe', 'rode: npm install');

// 11. Build funciona de verdade (é a etapa mais demorada da atualização)
console.log('  ...   Testando a compilação (pode demorar até 1 minuto)');
try {
  await exec('npm run build');
  ok('Compilação funciona', 'a etapa mais pesada da atualização está OK');
} catch (e) {
  falha('A compilação falhou', e.message,
    'rode "npm install" e tente de novo; se persistir, o código precisa ser corrigido');
}

// 12. Banco de dados presente (não é da atualização, mas é o que não pode sumir)
{
  let dbPath = 'server/data/fechamento.db';
  const envPath = path.join(RAIZ, '.env');
  if (existsSync(envPath)) {
    const m = readFileSync(envPath, 'utf-8').match(/^\s*DB_PATH\s*=\s*(.+)$/m);
    if (m) dbPath = m[1].trim();
  }
  const abs = path.isAbsolute(dbPath) ? dbPath : path.join(RAIZ, dbPath);
  if (existsSync(abs)) {
    const tam = (readFileSync(abs).length / 1024).toFixed(0);
    ok('Banco de dados encontrado', `${dbPath} (${tam} KB)`);
  } else {
    aviso('Banco de dados não encontrado ainda',
      `${dbPath} — será criado vazio no primeiro uso. Se a loja já tem fechamentos, confira o DB_PATH no .env`);
  }
}

console.log('\n' + '='.repeat(66));
if (problemas === 0) {
  console.log('TUDO CERTO — o botão "Atualizar agora" vai funcionar neste computador.');
  process.exit(0);
}
console.log(`${problemas} problema(s) encontrado(s) — resolva antes de contar com a atualização remota.`);
process.exit(1);
