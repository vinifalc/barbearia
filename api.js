const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const fs = require('fs');
const horariosDesativadosPath = './horarios_desativados.json';



const app = express();
// Middleware deve vir antes das rotas
app.use(cors());
app.use(express.json());

// Endpoint para obter horários desativados por dia
app.get('/api/horarios-desativados', (req, res) => {
  fs.readFile(horariosDesativadosPath, 'utf8', (err, data) => {
    if (err) {
      // Se o arquivo não existir, retorna objeto vazio
      if (err.code === 'ENOENT') return res.json({});
      return res.status(500).json({ error: 'Erro ao ler horários desativados.' });
    }
    try {
      const horarios = JSON.parse(data);
      res.json(horarios);
    } catch (e) {
      res.status(500).json({ error: 'Erro ao processar horários desativados.' });
    }
  });
});

// Endpoint para salvar horários desativados por dia
app.post('/api/horarios-desativados', (req, res) => {
  const body = req.body || {};
  const { horarios } = body;
  if (typeof horarios !== 'object' || horarios === null) return res.status(400).json({ error: 'Formato inválido.' });
  fs.writeFile(horariosDesativadosPath, JSON.stringify(horarios), (err) => {
    if (err) return res.status(500).json({ error: 'Erro ao salvar horários desativados.' });
    res.json({ success: true });
  });
});
const diasDesabilitadosPath = './dias_desabilitados.json';
const db = new sqlite3.Database('./agendamentos.db');
const dbClientes = new sqlite3.Database('./clientes.db');


// Endpoint para obter dias desabilitados
app.get('/api/dias-desabilitados', (req, res) => {
  fs.readFile(diasDesabilitadosPath, 'utf8', (err, data) => {
    if (err) return res.status(500).json({ error: 'Erro ao ler dias desabilitados.' });
    try {
      const dias = JSON.parse(data);
      res.json(dias);
    } catch (e) {
      res.status(500).json({ error: 'Erro ao processar dias desabilitados.' });
    }
  });
});

// Endpoint para atualizar dias desabilitados
app.post('/api/dias-desabilitados', (req, res) => {
  const body = req.body || {};
  const { dias } = body;
  if (!Array.isArray(dias)) return res.status(400).json({ error: 'Formato inválido.' });
  fs.writeFile(diasDesabilitadosPath, JSON.stringify(dias), (err) => {
    if (err) return res.status(500).json({ error: 'Erro ao salvar dias desabilitados.' });
    res.json({ success: true });
  });
});



// Endpoint para mover cliente de agendamentos para clientes_atendidos
app.post('/api/atender/:id', (req, res) => {
  const id = req.params.id;
  // Busca o agendamento pelo id
  db.get('SELECT * FROM agendamentos WHERE id = ?', [id], (err, agendamento) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!agendamento) return res.status(404).json({ error: 'Agendamento não encontrado.' });
    // Insere no clientes_atendidos
    dbClientes.run(
      'INSERT INTO clientes_atendidos (nome, telefone, dia, horario) VALUES (?, ?, ?, ?)',
      [agendamento.nome, agendamento.telefone, agendamento.dia, agendamento.horario],
      function (err2) {
        if (err2) return res.status(500).json({ error: err2.message });
        // Remove do agendamentos
        db.run('DELETE FROM agendamentos WHERE id = ?', [id], function (err3) {
          if (err3) return res.status(500).json({ error: err3.message });
          res.json({ success: true });
        });
      }
    );
  });
});

// Cria tabela de agendamentos se não existir
db.run(`
  CREATE TABLE IF NOT EXISTS agendamentos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT,
    dia TEXT,
    horario TEXT,
    telefone TEXT,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Cria tabela de clientes atendidos se não existir
dbClientes.run(`
  CREATE TABLE IF NOT EXISTS clientes_atendidos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT,
    telefone TEXT,
    dia TEXT,
    horario TEXT,
    atendido_em DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Endpoint para listar clientes atendidos
app.get('/api/clientes-atendidos', (req, res) => {
  dbClientes.all('SELECT * FROM clientes_atendidos ORDER BY atendido_em DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Endpoint para criar um novo agendamento
app.post('/api/agendamentos', (req, res) => {
  const { nome, dia, horario, telefone } = req.body;
  if (!nome || !dia || !horario || !telefone) {
    return res.status(400).json({ error: 'Campos obrigatórios ausentes.' });
  }
  db.run(
    'INSERT INTO agendamentos (nome, dia, horario, telefone) VALUES (?, ?, ?, ?)',
    [nome, dia, horario, telefone],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      db.get('SELECT * FROM agendamentos WHERE id = ?', [this.lastID], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        res.status(201).json(row);
      });
    }
  );
});

// Endpoint para editar um agendamento existente
app.put('/api/agendamentos/:id', (req, res) => {
  const { nome, dia, horario, telefone } = req.body;
  const { id } = req.params;
  if (!nome || !dia || !horario || !telefone) {
    return res.status(400).json({ error: 'Campos obrigatórios ausentes.' });
  }
  db.run(
    'UPDATE agendamentos SET nome = ?, dia = ?, horario = ?, telefone = ? WHERE id = ?',
    [nome, dia, horario, telefone, id],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      db.get('SELECT * FROM agendamentos WHERE id = ?', [id], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(row);
      });
    }
  );
});

// Endpoint para listar todos os agendamentos
app.get('/api/agendamentos', (req, res) => {
  db.all('SELECT * FROM agendamentos ORDER BY dia, horario', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Endpoint para listar horários ocupados em um dia específico
app.get('/api/horarios', (req, res) => {
  const dia = req.query.dia;
  db.all('SELECT horario FROM agendamentos WHERE dia = ?', [dia], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows.map(r => r.horario));
  });
});

const PORT = 3001;
app.listen(PORT, () => console.log(`API backend rodando em http://localhost:${PORT}`));