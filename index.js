    // Lê horários desativados para filtrar opções
    let horariosDesativados = {};
    try {
      const horariosData = fs.readFileSync('./horarios_desativados.json', 'utf8');
      horariosDesativados = JSON.parse(horariosData);
    } catch (e) {}
const fs = require('fs');
const diasDesabilitadosPath = './dias_desabilitados.json';
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./agendamentos.db');

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

const wppconnect = require('@wppconnect-team/wppconnect');
const { OpenAI } = require('openai');

const openai = new OpenAI({
  apiKey: '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'
});

wppconnect.create({
  session: 'session-barbearia',
  headless: true,
  catchQR: (base64Qrimg, asciiQR, attempts, urlCode) => {
    // QR recebido, você pode adicionar um tratamento aqui se necessário
  }
}).then((client) => {
  client.onMessage(async (message) => {
    if (!message.body) return;

    if (!global.userHistory) global.userHistory = {};
    const user = message.from;



    // Função para formatar datas para DD/MM
    const pad = n => n < 10 ? '0' + n : n;

    // Lê dias desabilitados para filtrar opções
    let diasDesabilitadosPrompt = [];
    try {
      const diasData = fs.readFileSync(diasDesabilitadosPath, 'utf8');
      diasDesabilitadosPrompt = JSON.parse(diasData);
    } catch (e) {}

    // Busca os dois próximos dias disponíveis (não desativados) a partir de hoje
    const diasDisponiveis = [];
    let dataBusca = new Date();
    let tentativas = 0;
    while (diasDisponiveis.length < 2 && tentativas < 14) { // no máximo 2 semanas de busca
      let idxSemana = dataBusca.getDay();
      idxSemana = idxSemana === 0 ? 6 : idxSemana - 1;
      if (!diasDesabilitadosPrompt.includes(idxSemana)) {
        diasDisponiveis.push({
          label: diasDisponiveis.length === 0 ? 'primeiro dia disponível' : 'segundo dia disponível',
          str: `${pad(dataBusca.getDate())}/${pad(dataBusca.getMonth() + 1)}`,
          idx: idxSemana,
          dateObj: new Date(dataBusca)
        });
      }
      dataBusca.setDate(dataBusca.getDate() + 1);
      tentativas++;
    }


    // Horários disponíveis de meia em meia hora: 8:00-12:00 e 13:00-17:00
    const horarios = [
      ...Array.from({ length: 9 }, (_, i) => {
        const hour = 8 + Math.floor(i / 2);
        const min = i % 2 === 0 ? '00' : '30';
        return `${hour < 10 ? '0' + hour : hour}:${min}`;
      }), // 8:00 até 12:00
      ...Array.from({ length: 9 }, (_, i) => {
        const hour = 13 + Math.floor(i / 2);
        const min = i % 2 === 0 ? '00' : '30';
        return `${hour}:${min}`;
      }) // 13:00 até 17:00
    ];


    // Busca horários já agendados no banco para os dois próximos dias disponíveis e filtra horários desativados
    let horariosDisponiveis = [];
    for (const diaObj of diasDisponiveis) {
      const horariosOcupados = await new Promise((resolve) => {
        db.all(
          `SELECT horario FROM agendamentos WHERE dia = ?`,
          [diaObj.str],
          (err, rows) => {
            if (err) resolve([]);
            else resolve(rows.map(r => r.horario));
          }
        );
      });
      // Lê horários desativados mais atualizados para cada iteração
      let horariosDesativadosAtual = {};
      try {
        const horariosData = fs.readFileSync('./horarios_desativados.json', 'utf8');
        horariosDesativadosAtual = JSON.parse(horariosData);
      } catch (e) {}
      const desativados = horariosDesativadosAtual[diaObj.str] || [];
      horariosDisponiveis.push(horarios.filter(h => !horariosOcupados.includes(h) && !desativados.includes(h)));
    }


    // Prompt do sistema atualizado dinamicamente
    let systemPrompt = '';
    if (diasDisponiveis.length === 0) {
      systemPrompt = `
Você é um assistente virtual de barbearia para agendamento de horários.
No momento, não há datas disponíveis para agendamento. Peça para o cliente tentar novamente em outro dia.`.trim();
    } else {
      systemPrompt = `
Você é um assistente virtual de barbearia para agendamento de horários.
IMPORTANTE: Sempre que o cliente pedir para agendar, você deve buscar na base de dados do sistema os horários disponíveis para os próximos dias, levando em consideração os horários desabilitados pelo barbeiro (ou seja, nunca mostre horários que estejam bloqueados ou desativados na base de dados de horários desabilitados, nem horários já ocupados por outros clientes).
Mostre as opções de horários disponíveis apenas para os dois próximos dias permitidos:
${diasDisponiveis.map((d, i) => `Para o dia ${d.str} temos: ${horariosDisponiveis[i].length ? horariosDisponiveis[i].join(', ') : 'Nenhum horário disponível'}.`).join('\n')}
Siga este fluxo:
1. Pergunte pelo dia desejado (${diasDisponiveis.map(d => d.str).join(' ou ')}).
2. Mostre os horários disponíveis para o dia escolhido, SEMPRE consultando a base de dados e excluindo horários e os dias desativados pelo barbeiro nos documentos .json que guardam essas informações.
3. Pergunte o nome do cliente.
4. Confirme o agendamento.
Quando for confirmar um agendamento, SEMPRE encerre a mensagem escrevendo uma linha separada no formato:
DADOS_AGENDAMENTO: nome=Nome do Cliente; dia=DD/MM; horario=HH:MM
Se o cliente digitar 'agendar', reinicie o processo.
Se o cliente pedir para cancelar, explique que ainda não há cancelamento automático.
Seja educado, cordial e objetivo.
      `.trim();
    }


    // Sempre reinicia o histórico com o prompt atualizado se:
    // - não existe histórico
    // - o usuário digitou "agendar"
    // - o prompt do sistema mudou (dias disponíveis mudaram)
    if (!global.userHistory[user] || message.body.toLowerCase().includes('agendar')) {
      global.userHistory[user] = [
        { role: 'system', content: systemPrompt }
      ];
    } else {
      // Se o prompt do sistema mudou (dias disponíveis mudaram), reinicia o histórico
      const lastSystem = global.userHistory[user][0]?.content;
      if (lastSystem !== systemPrompt) {
        global.userHistory[user] = [
          { role: 'system', content: systemPrompt }
        ];
      }
    }

    // Adiciona mensagem do usuário ao histórico
    global.userHistory[user].push({ role: 'user', content: message.body });

    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: global.userHistory[user],
        max_tokens: 300
      });

      const resposta = completion.choices[0].message.content;
      global.userHistory[user].push({ role: 'assistant', content: resposta });


      // Procura pelo padrão DADOS_AGENDAMENTO
      const regex = /DADOS_AGENDAMENTO:\s*nome=([^;]+);\s*dia=([^;]+);\s*horario=([^\n;]+)/i;
      const match = resposta.match(regex);

      if (match) {
        const nome = match[1].trim();
        const dia = match[2].trim();
        const horario = match[3].trim();
        // Remove o sufixo '@c.us' e o prefixo '55' se existir
        let telefone = user.replace(/@c\.us$/, '');
        if (telefone.startsWith('55') && telefone.length > 11) {
          telefone = telefone.slice(2);
        }
        // Formata para (XX) X XXXXXXXX
        telefone = telefone.replace(/^(\d{2})(\d{1})(\d{8})$/, '($1) $2 $3');

        // Bloqueia agendamento para dias desabilitados
        let diasDesabilitados = [];
        try {
          const diasData = fs.readFileSync(diasDesabilitadosPath, 'utf8');
          diasDesabilitados = JSON.parse(diasData);
        } catch (e) {}

        // Descobre o índice do dia da semana do agendamento (0=Seg, 6=Dom, igual ao frontend)
        const [diaAg, mesAg] = dia.split('/').map(Number);
        const dataAg = new Date(new Date().getFullYear(), mesAg - 1, diaAg);
        let idxSemana = dataAg.getDay();
        idxSemana = idxSemana === 0 ? 6 : idxSemana - 1;
        if (diasDesabilitados.includes(idxSemana)) {
          await client.sendText(message.from, 'Desculpe, não é possível agendar para este dia. O barbeiro não atenderá nesta data.');
          return;
        }

        // Bloqueia agendamento para horário desativado
        let horariosDesativadosAg = {};
        try {
          const horariosData = fs.readFileSync('./horarios_desativados.json', 'utf8');
          horariosDesativadosAg = JSON.parse(horariosData);
        } catch (e) {}
        if ((horariosDesativadosAg[dia] || []).includes(horario)) {
          await client.sendText(message.from, 'Desculpe, este horário está indisponível para agendamento. Escolha outro horário.');
          return;
        }

        db.run(
          `INSERT INTO agendamentos (nome, dia, horario, telefone) VALUES (?, ?, ?, ?)`,
          [nome, dia, horario, telefone],
          function (err) {
            if (err) {
              client.sendText(message.from, 'Erro ao salvar agendamento no banco de dados.');
            } else {
              client.sendText(message.from, 'Seu agendamento foi salvo com sucesso!');
            }
          }
        );
      } else {
        await client.sendText(message.from, resposta);
      }

    } catch (err) {
      await client.sendText(message.from, 'Desculpe, houve um erro ao conectar com o assistente. Tente novamente em instantes.');
      console.error(err);
    }
  });
});