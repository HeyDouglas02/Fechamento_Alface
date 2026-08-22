// index.js — servidor Express local do sistema de fechamento de caixa.
//
// Sobe a API local (sem internet) e cuida do arquivo .db via sql.js. O banco é
// salvo em disco automaticamente a cada escrita (ver db.js) — o operador nunca
// salva manualmente. Fazer backup é só copiar o arquivo .db.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { exec } from 'node:child_process';
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cron from 'node-cron';
import { initDb } from './db.js';
import { uploadBackup } from './backup.js';
import fechamentosRouter from './routes/fechamentos.js';
import configuracoesRouter from './routes/configuracoes.js';
import pendenciasRouter from './routes/pendencias.js';
import usuariosRouter from './routes/usuarios.js';
import aPrazoRouter from './routes/aPrazo.js';
import despesasRouter from './routes/despesas.js';
import ifoodRouter from './routes/ifood.js';
import sistemaRouter from './routes/sistema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(__dirname, '..');
const PORT = process.env.PORT || 3001;
// Por padrão o banco fica em server/data/fechamento.db. Pode ser sobrescrito
// pela variável de ambiente DB_PATH.
//
// Um DB_PATH relativo é resolvido contra a RAIZ DO PROJETO, não contra a pasta
// de onde o processo foi iniciado. Sem isso, abrir pelo atalho da área de
// trabalho (que sobe de outra pasta) apontava para um caminho inexistente, e o
// sistema criava um banco vazio — parecendo que os fechamentos sumiram.
// Caminho absoluto continua sendo respeitado como está (path.resolve ignora a
// base quando o segundo argumento já é absoluto).
const DB_PATH = process.env.DB_PATH
  ? path.resolve(RAIZ, process.env.DB_PATH)
  : path.join(__dirname, 'data', 'fechamento.db');

async function main() {
  const db = await initDb(DB_PATH);

  const app = express();
  app.use(cors());
  app.use(express.json());

  // Disponibiliza o banco para as rotas (req.app.locals.db).
  app.locals.db = db;

  // Agendador de backup automático (sexta 18h)
  cron.schedule('0 18 * * 5', async () => {
    console.log('[Cron] Executando backup automático semanal...');
    await uploadBackup(db.path);
  });

  // Catch-up: se o PC ficou desligado na sexta, roda backup no boot
  const logPath = path.join(__dirname, 'data', 'backup-log.json');
  if (fs.existsSync(logPath)) {
    try {
      const log = JSON.parse(fs.readFileSync(logPath, 'utf-8'));
      const ultimoBackup = log.ultimoBackup;
      if (ultimoBackup) {
        const hoje = new Date();
        const hojeStr = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
        const diffDias = Math.floor((new Date(hojeStr) - new Date(ultimoBackup)) / (1000 * 60 * 60 * 24));
        if (diffDias > 7) {
          console.log(`[Boot] Último backup foi há ${diffDias} dias — disparando backup de catch-up...`);
          await uploadBackup(db.path);
        }
      }
    } catch (err) {
      console.warn('[Boot] Erro ao checar log de backup:', err.message);
    }
  }

  // Health check — confirma que o servidor e o banco estão de pé.
  app.get('/api/health', (req, res) => {
    res.json({ ok: true, db: path.basename(db.path) });
  });

  // Rotas da API.
  app.use('/api/fechamentos', fechamentosRouter);
  app.use('/api/configuracoes', configuracoesRouter);
  app.use('/api/pendencias', pendenciasRouter);
  app.use('/api/usuarios', usuariosRouter);
  app.use('/api/a-prazo', aPrazoRouter);
  app.use('/api/despesas', despesasRouter);
  app.use('/api/ifood', ifoodRouter);
  app.use('/api/sistema', sistemaRouter);

  // Em produção local, serve o frontend já buildado (pasta dist/) na mesma
  // porta da API — assim o operador acessa tudo por um único endereço. Em
  // desenvolvimento o Vite serve o frontend e faz proxy do /api (ver vite.config).
  const distPath = path.join(__dirname, '..', 'dist');
  if (fs.existsSync(distPath)) {
    app.use(express.static(distPath));
    // Fallback do SPA: qualquer GET que não seja /api devolve o index.html.
    app.use((req, res, next) => {
      if (req.method === 'GET' && !req.path.startsWith('/api')) {
        return res.sendFile(path.join(distPath, 'index.html'));
      }
      next();
    });
  }

  app.listen(PORT, () => {
    const url = `http://localhost:${PORT}`;
    console.log(`Servidor de fechamento rodando em ${url}`);
    console.log(`Banco: ${db.path}`);
    if (!fs.existsSync(distPath)) {
      console.log('(frontend não buildado — rode "npm run build" para servir a interface aqui)');
    }
    // Abre o navegador automaticamente quando iniciado pelo atalho (ABRIR_NAVEGADOR=1).
    if (process.env.ABRIR_NAVEGADOR === '1') {
      exec(`start "" "${url}"`);
    }
  });
}

main().catch((err) => {
  console.error('Falha ao iniciar o servidor:', err);
  process.exit(1);
});
