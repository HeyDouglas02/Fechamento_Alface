// db.js — carrega e salva o banco SQLite via sql.js (WebAssembly, JS puro).
//
// Não usa better-sqlite3 nem nenhum binário nativo: o Smart App Control do
// Windows bloqueia esses módulos nesta máquina. Todo o banco vive em memória
// (sql.js) e é exportado para um arquivo .db a cada operação de escrita.
//
// Uso:
//   const db = await initDb('/caminho/fechamento.db');
//   db.all('SELECT * FROM usuarios');
//   db.run('INSERT INTO usuarios (nome, senha) VALUES (?, ?)', ['ana', 'h']);
//   // toda chamada a run() persiste o arquivo automaticamente.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import initSqlJs from 'sql.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WASM_PATH = path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

// Estado do módulo (singleton — o servidor abre um único banco).
let SQL = null;
let database = null;
let filePath = null;

// Localiza o sql-wasm.wasm dentro de node_modules (em vez de buscar via fetch).
function locateFile(file) {
  return path.join(WASM_PATH, file);
}

// Grava o banco atual em disco. Exporta o sql.js para bytes e escreve o arquivo
// de forma atômica (escreve em .tmp e renomeia) para não corromper em caso de
// falha no meio da escrita.
function persist() {
  if (!database || !filePath) return;
  const data = Buffer.from(database.export());
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, filePath);
}

// Executa um INSERT/UPDATE/DELETE e persiste o arquivo. Retorna o número de
// linhas afetadas e o último id inserido.
function run(sql, params = []) {
  const stmt = database.prepare(sql);
  stmt.bind(params);
  stmt.step();
  stmt.free();
  const changes = database.getRowsModified();
  const idRow = database.exec('SELECT last_insert_rowid() AS id');
  const lastId = idRow.length ? idRow[0].values[0][0] : null;
  persist();
  return { changes, lastInsertRowid: lastId };
}

// Executa um SELECT e devolve todas as linhas como array de objetos.
function all(sql, params = []) {
  const stmt = database.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

// Igual a all(), mas devolve só a primeira linha (ou null).
function get(sql, params = []) {
  const rows = all(sql, params);
  return rows.length ? rows[0] : null;
}

// Executa SQL bruto (vários statements) SEM persistir — usado só na criação
// do schema. Use run() para escritas normais.
function execRaw(sql) {
  database.run(sql);
}

// Migrações leves: adiciona colunas novas a bancos já existentes (o
// CREATE TABLE IF NOT EXISTS não altera tabelas antigas). Idempotente.
function migrar() {
  const colunas = all('PRAGMA table_info(fechamentos)').map((c) => c.name);
  if (!colunas.includes('numero_vendas')) {
    database.run('ALTER TABLE fechamentos ADD COLUMN numero_vendas INTEGER NOT NULL DEFAULT 0');
  }
  if (!colunas.includes('ajustes_dinheiro')) {
    database.run('ALTER TABLE fechamentos ADD COLUMN ajustes_dinheiro TEXT');
  }
  if (!colunas.includes('dinheiro_contado_ajustado')) {
    database.run('ALTER TABLE fechamentos ADD COLUMN dinheiro_contado_ajustado REAL NOT NULL DEFAULT 0');
  }

  const colunasPendencias = all('PRAGMA table_info(pendencias)').map((c) => c.name);
  if (!colunasPendencias.includes('forma_recebimento')) {
    database.run('ALTER TABLE pendencias ADD COLUMN forma_recebimento TEXT');
  }
}

// Cria as tabelas (idempotente) e garante a linha única de configurações.
function applySchema() {
  const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
  database.run(schema);
  migrar();
  const cfg = get('SELECT id FROM configuracoes LIMIT 1');
  if (!cfg) {
    database.run('INSERT INTO configuracoes (id) VALUES (1)');
  }
  persist();
}

// Inicializa o banco: carrega o arquivo .db (ou cria) e aplica o schema.
export async function initDb(dbPath) {
  filePath = path.resolve(dbPath);
  SQL = await initSqlJs({ locateFile });

  if (fs.existsSync(filePath)) {
    const fileBuffer = fs.readFileSync(filePath);
    database = new SQL.Database(fileBuffer);
  } else {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    database = new SQL.Database();
  }

  applySchema();

  return { run, all, get, execRaw, persist, raw: () => database, path: filePath };
}
