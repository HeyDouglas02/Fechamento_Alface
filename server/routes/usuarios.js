// routes/usuarios.js — operadores que fazem o fechamento (login simples).
//
// O sistema roda 100% local, num único computador. O login serve para registrar
// QUEM fez/editou cada fechamento, não como barreira de segurança forte.
//
// Senhas são guardadas com hash scrypt + salt (módulo `crypto` nativo do Node —
// puro core, sem addon nativo, respeitando a restrição do Smart App Control).
// Formato gravado: "salt_hex:hash_hex".

import express from 'express';
import crypto from 'node:crypto';

const router = express.Router();

// Gera o hash de uma senha (salt aleatório + scrypt).
function hashSenha(senha) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(senha), salt, 32).toString('hex');
  return `${salt}:${hash}`;
}

// Confere uma senha contra o hash guardado (comparação em tempo constante).
function senhaConfere(senha, guardado) {
  if (!guardado || !guardado.includes(':')) return false;
  const [salt, hashHex] = guardado.split(':');
  const hash = Buffer.from(hashHex, 'hex');
  const tentativa = crypto.scryptSync(String(senha), salt, 32);
  return hash.length === tentativa.length && crypto.timingSafeEqual(hash, tentativa);
}

function usuarioParaApi(row) {
  if (!row) return null;
  return { id: row.id, nome: row.nome, criadoEm: row.criado_em };
}

// GET /api/usuarios — lista os operadores (sem a senha).
router.get('/', (req, res) => {
  const db = req.app.locals.db;
  const rows = db.all('SELECT id, nome, criado_em FROM usuarios ORDER BY nome');
  res.json(rows.map(usuarioParaApi));
});

// POST /api/usuarios — cria um operador.
router.post('/', (req, res) => {
  const db = req.app.locals.db;
  const { nome, senha } = req.body || {};

  if (!nome || !String(nome).trim()) return res.status(400).json({ erro: 'Informe o nome.' });
  if (!senha) return res.status(400).json({ erro: 'Informe a senha.' });

  const existe = db.get('SELECT id FROM usuarios WHERE nome = ?', [String(nome).trim()]);
  if (existe) return res.status(409).json({ erro: 'Já existe um usuário com esse nome.' });

  const { lastInsertRowid } = db.run(
    'INSERT INTO usuarios (nome, senha) VALUES (?, ?)',
    [String(nome).trim(), hashSenha(senha)]
  );
  const novo = db.get('SELECT id, nome, criado_em FROM usuarios WHERE id = ?', [lastInsertRowid]);
  res.status(201).json(usuarioParaApi(novo));
});

// POST /api/usuarios/login — valida nome + senha e devolve o operador.
router.post('/login', (req, res) => {
  const db = req.app.locals.db;
  const { nome, senha } = req.body || {};

  const row = db.get('SELECT * FROM usuarios WHERE nome = ?', [String(nome ?? '').trim()]);
  if (!row || !senhaConfere(senha, row.senha)) {
    return res.status(401).json({ erro: 'Usuário ou senha inválidos.' });
  }
  res.json(usuarioParaApi(row));
});

// DELETE /api/usuarios/:id — remove um operador.
router.delete('/:id', (req, res) => {
  const db = req.app.locals.db;
  const row = db.get('SELECT id FROM usuarios WHERE id = ?', [req.params.id]);
  if (!row) return res.status(404).json({ erro: 'Usuário não encontrado.' });
  db.run('DELETE FROM usuarios WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
});

export default router;
