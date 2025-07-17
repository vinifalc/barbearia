import React, { useEffect, useState } from "react";
import axios from "axios";

const API = "http://localhost:3001/api";

const horarios = [
  ...Array.from({ length: 9 }, (_, i) => {
    const hour = 8 + Math.floor(i / 2);
    const min = i % 2 === 0 ? '00' : '30';
    return `${hour < 10 ? '0' + hour : hour}:${min}`;
  }),
  ...Array.from({ length: 9 }, (_, i) => {
    const hour = 13 + Math.floor(i / 2);
    const min = i % 2 === 0 ? '00' : '30';
    return `${hour}:${min}`;
  }),
];

// Gera as datas a partir da semana atual (segunda a domingo) no formato DD/MM
function datasSemanaAtual(qtdSemanas = 1) {
  const hoje = new Date();
  const diaSemana = hoje.getDay();
  const segunda = new Date(hoje);
  segunda.setDate(hoje.getDate() - ((diaSemana + 6) % 7));
  const pad = (n) => (n < 10 ? "0" + n : n);
  // Gera os dias das semanas desejadas
  return Array.from({ length: 7 * qtdSemanas }, (_, i) => {
    const d = new Date(segunda);
    d.setDate(segunda.getDate() + i);
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
  });
}

function App() {
  const [diasDesabilitados, setDiasDesabilitados] = useState([]);
  const [diasLoading, setDiasLoading] = useState(false);
  const [horariosDesativados, setHorariosDesativados] = useState({}); // { "DD/MM": ["08:00", ...] }
  const [horariosLoading, setHorariosLoading] = useState(false);
  const [numSemanas, setNumSemanas] = useState(1);
  const [clock, setClock] = useState('');

  // Atualiza relógio GMT-3
  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      // Ajusta para GMT-3
      const gmt3 = new Date(now.getTime() - (now.getTimezoneOffset() + 180) * 60000);
      const pad = n => n < 10 ? '0' + n : n;
      setClock(`${pad(gmt3.getHours())}:${pad(gmt3.getMinutes())}:${pad(gmt3.getSeconds())}`);
    };
    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, []);

  // Buscar dias desabilitados e horários desativados ao carregar
  useEffect(() => {
    axios.get(`${API}/dias-desabilitados`).then(res => setDiasDesabilitados(res.data)).catch(() => setDiasDesabilitados([]));
    axios.get(`${API}/horarios-desativados`).then(res => setHorariosDesativados(res.data)).catch(() => setHorariosDesativados({}));
  }, []);
  // Alternar horário desativado/ativado para um dia
  const handleToggleHorario = (dia, horario) => {
    const atual = horariosDesativados[dia] || [];
    let novo;
    if (atual.includes(horario)) {
      novo = atual.filter(h => h !== horario);
    } else {
      novo = [...atual, horario];
    }
    const novosHorarios = { ...horariosDesativados, [dia]: novo };
    // Remove chave se array vazio
    if (novo.length === 0) delete novosHorarios[dia];
    setHorariosDesativados(novosHorarios);
    setHorariosLoading(true);
    axios.post(
      `${API}/horarios-desativados`,
      { horarios: novosHorarios },
      { headers: { 'Content-Type': 'application/json' } }
    )
      .finally(() => setHorariosLoading(false));
  };

  // Função para alternar o status de um dia
  const handleToggleDia = (idx) => {
    const newDias = diasDesabilitados.includes(idx % 7)
      ? diasDesabilitados.filter(d => d !== idx)
      : [...diasDesabilitados, idx];
    setDiasDesabilitados(newDias);
    setDiasLoading(true);
    axios.post(`${API}/dias-desabilitados`, { dias: newDias })
      .finally(() => setDiasLoading(false));
  };
  const [agendamentos, setAgendamentos] = useState([]);
  const [ocupados, setOcupados] = useState({}); // { "DD/MM": [hh:mm, ...] }
  const dias = datasSemanaAtual(numSemanas);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ id: null, nome: '', dia: '', horario: '', telefone: '' });
  const [formError, setFormError] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: 'dia', direction: 'asc' });
  const [clientesAtendidos, setClientesAtendidos] = useState([]);
  const [showAtendidos, setShowAtendidos] = useState(false);

  useEffect(() => {
    axios.get(`${API}/agendamentos`).then((res) => setAgendamentos(res.data));

    dias.forEach((dia) => {
      axios.get(`${API}/horarios?dia=${encodeURIComponent(dia)}`).then((res) =>
        setOcupados((prev) => ({
          ...prev,
          [dia]: res.data,
        }))
      );
    });
    // eslint-disable-next-line
  }, [dias, showForm]);

  // Buscar clientes atendidos ao carregar o painel
  useEffect(() => {
    axios.get(`${API}/clientes-atendidos`).then((res) => setClientesAtendidos(res.data));
  }, []);


  // Função para ordenar os agendamentos
  const sortedAgendamentos = React.useMemo(() => {
    const sorted = [...agendamentos];
    if (!sortConfig.key) return sorted;
    sorted.sort((a, b) => {
      let valA = a[sortConfig.key];
      let valB = b[sortConfig.key];
      // Para datas e horários, comparar corretamente
      if (sortConfig.key === 'dia') {
        // Formato DD/MM
        const [dA, mA] = valA.split('/').map(Number);
        const [dB, mB] = valB.split('/').map(Number);
        valA = new Date(2025, mA - 1, dA);
        valB = new Date(2025, mB - 1, dB);
      }
      if (sortConfig.key === 'criado_em') {
        valA = new Date(valA);
        valB = new Date(valB);
      }
      if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
      if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [agendamentos, sortConfig]);

  // Função para mover cliente para atendidos
  const handleAtender = async (id) => {
    try {
      await axios.post(`${API}/atender/${id}`);
      // Atualiza listas após mover
      const [ags, atendidos] = await Promise.all([
        axios.get(`${API}/agendamentos`),
        axios.get(`${API}/clientes-atendidos`)
      ]);
      setAgendamentos(ags.data);
      setClientesAtendidos(atendidos.data);
    } catch (err) {
      alert('Erro ao mover cliente para atendidos.');
    }
  };

  const handleSort = (key) => {
    setSortConfig((prev) => {
      if (prev.key === key) {
        return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { key, direction: 'asc' };
    });
  };

  const handleEdit = (ag) => {
    setFormData({ ...ag });
    setShowForm(true);
    setFormError('');
  };

  const handleAdd = () => {
    setFormData({ id: null, nome: '', dia: '', horario: '', telefone: '' });
    setShowForm(true);
    setFormError('');
  };

  const handleFormChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    if (!formData.nome || !formData.dia || !formData.horario || !formData.telefone) {
      setFormError('Preencha todos os campos.');
      return;
    }
    try {
      if (formData.id) {
        // Editar
        await axios.put(`${API}/agendamentos/${formData.id}`, formData);
      } else {
        // Adicionar
        await axios.post(`${API}/agendamentos`, formData);
      }
      setShowForm(false);
      setFormData({ id: null, nome: '', dia: '', horario: '', telefone: '' });
      setFormError('');
      // Atualiza agendamentos automaticamente pelo useEffect
    } catch (err) {
      setFormError('Erro ao salvar agendamento.');
    }
  };

  const handleFormCancel = () => {
    setShowForm(false);
    setFormData({ id: null, nome: '', dia: '', horario: '', telefone: '' });
    setFormError('');
  };

  return (
    <div style={{ maxWidth: 900, margin: "40px auto", fontFamily: "sans-serif", background: "#f8f9fa", borderRadius: 12, boxShadow: "0 2px 12px #0001", padding: 32 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <h1 style={{ textAlign: 'center', margin: 0, color: '#2d3748', letterSpacing: 1 }}>Painel do Barbeiro</h1>
        <span style={{ fontSize: 15, color: '#555', background: '#edf2f7', borderRadius: 6, padding: '4px 12px', fontWeight: 500 }} title="Horário de referência GMT-3">⏰ {clock} GMT-3</span>
      </div>

      <section style={{ marginBottom: 48 }}>
        <h2 style={{ color: '#2b6cb0', marginBottom: 24 }}>Horários disponíveis da semana</h2>
        <div style={{ marginBottom: 16 }}>
          <button
            onClick={() => setNumSemanas((n) => n === 1 ? 4 : 1)}
            style={{
              background: '#2b6cb0',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              padding: '8px 18px',
              fontWeight: 600,
              fontSize: 15,
              cursor: 'pointer',
              boxShadow: '0 1px 4px #0001',
              marginBottom: 8
            }}
          >
            {numSemanas === 1 ? 'Mostrar mais dias' : 'Ocultar dias'}
          </button>
        </div>
        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', justifyContent: 'space-between' }}>
          {dias.map((dia, idx) => {
            const desabilitado = diasDesabilitados.includes(idx % 7);
            return (
              <div key={dia} style={{
                flex: '1 1 180px',
                background: desabilitado ? '#f7fafc' : '#fff',
                borderRadius: 10,
                boxShadow: '0 1px 4px #0001',
                padding: 18,
                marginBottom: 18,
                minWidth: 180,
                maxWidth: 220,
                opacity: desabilitado ? 0.5 : 1
              }}>
                <div style={{ fontWeight: 700, fontSize: 18, color: '#2b6cb0', marginBottom: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span>
                    {dia}
                    <span style={{ color: '#888', fontWeight: 'normal', fontSize: 13, marginLeft: 6 }}>
                      ({['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'][idx % 7]})
                    </span>
                  </span>
                  <button onClick={() => handleToggleDia(idx % 7)} disabled={diasLoading} style={{ marginLeft: 8, background: desabilitado ? '#e53e3e' : '#38a169', color: '#fff', border: 'none', borderRadius: 5, padding: '2px 10px', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                    {desabilitado ? 'Ativar' : 'Desativar'}
                  </button>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {horarios.map((h) => {
                    const ocupado = ocupados[dia]?.includes(h);
                    const desativado = (horariosDesativados[dia] || []).includes(h);
                    return (
                      <span
                        key={h}
                        onClick={() => !ocupado && handleToggleHorario(dia, h)}
                        style={{
                          padding: '2px 8px',
                          borderRadius: 6,
                          marginBottom: 4,
                          background: ocupado
                            ? '#e2e8f0'
                            : desativado
                              ? '#fed7d7'
                              : '#c6f6d5',
                          color: ocupado
                            ? '#718096'
                            : desativado
                              ? '#c53030'
                              : '#22543d',
                          textDecoration: ocupado
                            ? 'line-through'
                            : desativado
                              ? 'line-through'
                              : 'none',
                          fontWeight: ocupado || desativado ? 400 : 600,
                          fontSize: 15,
                          border: ocupado
                            ? '1px solid #cbd5e0'
                            : desativado
                              ? '1px solid #fc8181'
                              : '1px solid #68d391',
                          transition: 'all 0.2s',
                          cursor: ocupado ? 'not-allowed' : 'pointer',
                          opacity: horariosLoading ? 0.6 : 1
                        }}
                        title={ocupado ? 'Horário já reservado' : desativado ? 'Clique para ativar' : 'Clique para desativar'}
                      >
                        {h}
                      </span>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <h2 style={{ color: '#2b6cb0', marginBottom: 0 }}>Agendamentos</h2>
          <button onClick={handleAdd} style={{ background: '#2b6cb0', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 18px', fontWeight: 600, fontSize: 15, cursor: 'pointer', boxShadow: '0 1px 4px #0001' }}>
            + Adicionar Reserva
          </button>
        </div>
        <div style={{ overflowX: 'auto', background: '#fff', borderRadius: 10, boxShadow: '0 1px 4px #0001', padding: 12 }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 600 }}>
            <thead>
              <tr style={{ background: '#ebf8ff', color: '#2b6cb0' }}>
                <th style={{ padding: 10, fontWeight: 700, textAlign: 'left', cursor: 'pointer' }} onClick={() => handleSort('nome')}>
                  Nome {sortConfig.key === 'nome' ? (sortConfig.direction === 'asc' ? '▲' : '▼') : ''}
                </th>
                <th style={{ padding: 10, fontWeight: 700, textAlign: 'left', cursor: 'pointer' }} onClick={() => handleSort('dia')}>
                  Dia {sortConfig.key === 'dia' ? (sortConfig.direction === 'asc' ? '▲' : '▼') : ''}
                </th>
                <th style={{ padding: 10, fontWeight: 700, textAlign: 'left', cursor: 'pointer' }} onClick={() => handleSort('horario')}>
                  Horário {sortConfig.key === 'horario' ? (sortConfig.direction === 'asc' ? '▲' : '▼') : ''}
                </th>
                <th style={{ padding: 10, fontWeight: 700, textAlign: 'left', cursor: 'pointer' }} onClick={() => handleSort('telefone')}>
                  Telefone {sortConfig.key === 'telefone' ? (sortConfig.direction === 'asc' ? '▲' : '▼') : ''}
                </th>
                <th style={{ padding: 10, fontWeight: 700, textAlign: 'left', cursor: 'pointer' }} onClick={() => handleSort('criado_em')}>
                  Criado em {sortConfig.key === 'criado_em' ? (sortConfig.direction === 'asc' ? '▲' : '▼') : ''}
                </th>
                <th style={{ padding: 10, fontWeight: 700, textAlign: 'left' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {sortedAgendamentos.length === 0 && (
                <tr>
                  <td colSpan="6" style={{ textAlign: 'center', color: '#888', padding: 18 }}>Nenhum agendamento ainda.</td>
                </tr>
              )}
              {sortedAgendamentos.map((ag) => (
                <tr key={ag.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                  <td style={{ padding: 8 }}>{ag.nome}</td>
                  <td style={{ padding: 8 }}>{ag.dia}</td>
                  <td style={{ padding: 8 }}>{ag.horario}</td>
                  <td style={{ padding: 8 }}>{ag.telefone}</td>
                  <td style={{ padding: 8 }}>
                    {(() => {
                      if (!ag.criado_em) return '';
                      const d = new Date(ag.criado_em);
                      if (isNaN(d.getTime())) return ag.criado_em;
                      const pad = n => n < 10 ? '0' + n : n;
                      const gmt3 = new Date(d.getTime() - (d.getTimezoneOffset() + 180) * 60000);
                      const hora = pad(gmt3.getHours());
                      const min = pad(gmt3.getMinutes());
                      const dia = pad(gmt3.getDate());
                      const mes = pad(gmt3.getMonth() + 1);
                      const ano = gmt3.getFullYear().toString().slice(-2);
                      return `${hora}:${min} de ${dia}/${mes}/${ano}`;
                    })()}
                  </td>
                  <td style={{ padding: 8 }}>
                    <button onClick={() => handleEdit(ag)} style={{ background: '#ecc94b', color: '#222', border: 'none', borderRadius: 5, padding: '4px 12px', fontWeight: 600, fontSize: 14, cursor: 'pointer', marginRight: 6 }}>Editar</button>
                    <button onClick={() => handleAtender(ag.id)} style={{ background: '#38a169', color: '#fff', border: 'none', borderRadius: 5, padding: '4px 12px', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>Atender</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {showForm && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: '#0007', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <form onSubmit={handleFormSubmit} style={{ background: '#fff', borderRadius: 10, padding: 32, minWidth: 320, boxShadow: '0 2px 12px #0002', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <h3 style={{ margin: 0, color: '#2b6cb0', fontWeight: 700 }}>{formData.id ? 'Editar Reserva' : 'Adicionar Reserva'}</h3>
            <label>
              Nome:
              <input name="nome" value={formData.nome} onChange={handleFormChange} style={{ width: '100%', padding: 8, borderRadius: 5, border: '1px solid #cbd5e0', marginTop: 4 }} />
            </label>
            <label>
              Dia:
              <select name="dia" value={formData.dia} onChange={handleFormChange} style={{ width: '100%', padding: 8, borderRadius: 5, border: '1px solid #cbd5e0', marginTop: 4 }}>
                <option value="">Selecione...</option>
                {dias.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </label>
            <label>
              Horário:
              <select name="horario" value={formData.horario} onChange={handleFormChange} style={{ width: '100%', padding: 8, borderRadius: 5, border: '1px solid #cbd5e0', marginTop: 4 }}>
                <option value="">Selecione...</option>
                {horarios.map((h) => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </select>
            </label>
            <label>
              Telefone:
              <input name="telefone" value={formData.telefone} onChange={handleFormChange} style={{ width: '100%', padding: 8, borderRadius: 5, border: '1px solid #cbd5e0', marginTop: 4 }} placeholder="(83) 9 99999999" />
            </label>
            {formError && <div style={{ color: 'red', fontWeight: 500 }}>{formError}</div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
              <button type="button" onClick={handleFormCancel} style={{ background: '#e2e8f0', color: '#222', border: 'none', borderRadius: 5, padding: '7px 18px', fontWeight: 600, fontSize: 15, cursor: 'pointer' }}>Cancelar</button>
              <button type="submit" style={{ background: '#2b6cb0', color: '#fff', border: 'none', borderRadius: 5, padding: '7px 18px', fontWeight: 600, fontSize: 15, cursor: 'pointer' }}>{formData.id ? 'Salvar' : 'Adicionar'}</button>
            </div>
          </form>
        </div>
      )}

      {/* Tabela de clientes atendidos */}
      <section style={{ marginTop: 48 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <h2 style={{ color: '#2b6cb0', marginBottom: 0 }}>Clientes Atendidos</h2>
          <button onClick={() => setShowAtendidos((v) => !v)} style={{ background: '#2b6cb0', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 18px', fontWeight: 600, fontSize: 15, cursor: 'pointer', boxShadow: '0 1px 4px #0001' }}>
            {showAtendidos ? 'Ocultar' : 'Expandir'}
          </button>
        </div>
        {showAtendidos && (
          <div style={{ overflowX: 'auto', background: '#fff', borderRadius: 10, boxShadow: '0 1px 4px #0001', padding: 12 }}>
            <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 600 }}>
              <thead>
                <tr style={{ background: '#ebf8ff', color: '#2b6cb0' }}>
                  <th style={{ padding: 10, fontWeight: 700, textAlign: 'left' }}>Nome</th>
                  <th style={{ padding: 10, fontWeight: 700, textAlign: 'left' }}>Telefone</th>
                  <th style={{ padding: 10, fontWeight: 700, textAlign: 'left' }}>Dia</th>
                  <th style={{ padding: 10, fontWeight: 700, textAlign: 'left' }}>Horário</th>
                  <th style={{ padding: 10, fontWeight: 700, textAlign: 'left' }}>Atendido em</th>
                </tr>
              </thead>
              <tbody>
                {clientesAtendidos.length === 0 && (
                  <tr>
                    <td colSpan="5" style={{ textAlign: 'center', color: '#888', padding: 18 }}>Nenhum cliente atendido ainda.</td>
                  </tr>
                )}
                {clientesAtendidos.map((cli) => (
                  <tr key={cli.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                    <td style={{ padding: 8 }}>{cli.nome}</td>
                    <td style={{ padding: 8 }}>{cli.telefone}</td>
                    <td style={{ padding: 8 }}>{cli.dia}</td>
                    <td style={{ padding: 8 }}>{cli.horario}</td>
                    <td style={{ padding: 8 }}>
                      {(() => {
                        if (!cli.atendido_em) return '';
                        const d = new Date(cli.atendido_em);
                        if (isNaN(d.getTime())) return cli.atendido_em;
                        const pad = n => n < 10 ? '0' + n : n;
                        const gmt3 = new Date(d.getTime() - (d.getTimezoneOffset() + 180) * 60000);
                        const hora = pad(gmt3.getHours());
                        const min = pad(gmt3.getMinutes());
                        const dia = pad(gmt3.getDate());
                        const mes = pad(gmt3.getMonth() + 1);
                        const ano = gmt3.getFullYear().toString().slice(-2);
                        return `${hora}:${min} de ${dia}/${mes}/${ano}`;
                      })()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

export default App;
