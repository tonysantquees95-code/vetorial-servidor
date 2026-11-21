import test from "node:test";
import assert from "node:assert/strict";
import { bancoDeTeste } from "./d1.mjs";
import { ErroLoja, registrarLoja } from "../src/loja/lojas.js";
import { tratarLoja } from "../src/loja/rotas.js";
import { tratarAgenda, tratarAgendaDaLoja } from "../src/agenda/rotas.js";
import { agoraLocal, dataValida, dataBonita, diasEntre, hhmm, juntar, lerHHMM, livres, normalizarSemana, somarDias } from "../src/agenda/horarios.js";
import { calendario, dataUtc } from "../src/agenda/ics.js";
import { telefoneBr } from "../src/agenda/dados.js";

process.removeAllListeners("warning");
const SEGUNDA_10H = Date.parse("2026-11-23T10:00:00-03:00"); // segunda-feira
const mk = () => ({ DB: bancoDeTeste(), CHAVE_COFRE: "chave-de-teste-bem-longa-123" });

// ------------------------------------------------------------------------------------------ lógica pura
test("horários: converte e valida", () => {
  assert.equal(lerHHMM("09:30"), 570);
  assert.equal(lerHHMM("24:00"), 1440);
  assert.equal(lerHHMM("25:00"), null);
  assert.equal(lerHHMM("9h"), null);
  assert.equal(hhmm(570), "09:30");
  assert.ok(dataValida("2026-02-28") && !dataValida("2026-02-30") && !dataValida("21/11/2026"));
  assert.equal(somarDias("2026-11-30", 1), "2026-12-01");
  assert.equal(diasEntre("2026-11-21", "2026-11-23"), 2);
  assert.equal(dataBonita("2026-11-23", 900), "seg, 23/11 às 15:00");
  assert.deepEqual(agoraLocal(Date.parse("2026-11-23T01:30:00Z")), { data: "2026-11-22", minuto: 22 * 60 + 30 }); // 22:30 de domingo em Brasília
});

test("horários livres respeitam pausa, ocupados, folga e antecedência", () => {
  const janelas = [{ ini: 540, fim: 720 }, { ini: 780, fim: 1080 }];
  const dia = livres({ janelas, duracao: 60, passo: 60 });
  assert.deepEqual(dia, [540, 600, 660, 780, 840, 900, 960, 1020]);
  // quem está das 10h às 11h bloqueia 10h (e não oferece 9h30 de 60 min, que invadiria)
  assert.deepEqual(livres({ janelas, ocupados: [{ ini: 600, fim: 660 }], duracao: 60, passo: 30 }).filter((s) => s < 720), [540, 660]);
  // folga de 15 min entre atendimentos tira os horários colados
  assert.deepEqual(livres({ janelas, ocupados: [{ ini: 600, fim: 660 }], duracao: 60, passo: 30, intervalo: 15 }).filter((s) => s < 720), []);
  assert.deepEqual(livres({ janelas, duracao: 60, passo: 60, apartirDe: 700 }), [780, 840, 900, 960, 1020]);
  assert.deepEqual(livres({ janelas, duracao: 0, passo: 30 }), []);
  assert.deepEqual(livres({ janelas: [{ ini: 540, fim: 560 }], duracao: 30, passo: 30 }), []); // não cabe
});

test("semana: normaliza, junta trechos e descarta o inválido", () => {
  const s = normalizarSemana([
    { dia: 1, ini: "09:00", fim: "12:00" }, { dia: 1, ini: "11:30", fim: "13:00" }, { dia: 1, ini: "14:00", fim: "18:00" },
    { dia: 9, ini: "09:00", fim: "10:00" }, { dia: 2, ini: "10:00", fim: "09:00" }, { dia: 3, ini: "abc", fim: "10:00" },
  ]);
  assert.deepEqual(s, [{ dia: 1, ini: 540, fim: 780 }, { dia: 1, ini: 840, fim: 1080 }]);
  assert.deepEqual(juntar([{ ini: 10, fim: 20 }, { ini: 20, fim: 30 }, { ini: 40, fim: 50 }]), [{ ini: 10, fim: 30 }, { ini: 40, fim: 50 }]);
});

test("telefone vira 55 + número", () => {
  assert.equal(telefoneBr("(51) 99999-8888"), "5551999998888");
  assert.equal(telefoneBr("+55 51 3333-4444"), "555133334444");
  assert.equal(telefoneBr("123"), "");
});

test("calendário .ics: UTC, alarme, escape e dobra de linha", () => {
  assert.equal(dataUtc("2026-11-23", 900), "20261123T180000Z"); // 15:00 em Brasília
  assert.equal(dataUtc("2026-11-23", 23 * 60 + 30), "20261124T023000Z"); // passa da meia-noite em UTC
  const txt = calendario([{ id: 7, titulo: "Maria, Corte; escova", data: "2026-11-23", ini: 900, fim: 960, descricao: "linha1\nlinha2 " + "x".repeat(120) }], { nome: "Salão", agora: SEGUNDA_10H });
  assert.ok(txt.startsWith("BEGIN:VCALENDAR\r\n") && txt.endsWith("END:VCALENDAR\r\n"));
  assert.ok(txt.includes("DTSTART:20261123T180000Z") && txt.includes("DTEND:20261123T190000Z"));
  assert.ok(txt.includes("SUMMARY:Maria\\, Corte\\; escova"));
  assert.ok(txt.includes("TRIGGER:-PT60M"));
  assert.ok(txt.split("\r\n").every((l) => new TextEncoder().encode(l).length <= 75));
  const cancelado = calendario([{ id: 8, titulo: "x", data: "2026-11-23", ini: 900, fim: 960, cancelado: true }]);
  assert.ok(cancelado.includes("STATUS:CANCELLED") && !cancelado.includes("VALARM"));
});

// ------------------------------------------------------------------------------------------ rotas
async function salao(env, { agora = SEGUNDA_10H } = {}) {
  const reg = await registrarLoja(env, { nome: "Studio Bela", slug: "studio-bela" });
  const loja = await env.DB.prepare("SELECT * FROM lojas WHERE id = ?").bind(reg.id).first();
  const dono = async (metodo, caminho, corpo) => {
    const q = new Request(`https://venus.test${caminho}`, { method: metodo, body: corpo ? JSON.stringify(corpo) : undefined });
    try {
      const r = await tratarAgendaDaLoja(q, env, loja, new URL(q.url), new URL(q.url).pathname, { exigeAcesso: () => {}, agora });
      return { status: r.status, corpo: await r.json() };
    } catch (e) { // em produção quem trata é o servidor da loja
      if (e instanceof ErroLoja) return { status: e.status, corpo: { error: e.message } };
      throw e;
    }
  };
  const publico = async (metodo, caminho, corpo, ip = "1.1.1.1") => {
    const q = new Request(`https://venus.test${caminho}`, { method: metodo, headers: { "cf-connecting-ip": ip }, body: corpo ? JSON.stringify(corpo) : undefined });
    const u = new URL(q.url);
    return tratarAgenda(q, env, {}, u, u.pathname.replace(/\/+$/, ""), agora);
  };
  const corte = (await dono("POST", "/loja/agenda/servicos", { nome: "Corte", duracao_min: 60, preco_centavos: 5000 })).corpo.id;
  const barba = (await dono("POST", "/loja/agenda/servicos", { nome: "Barba", duracao_min: 30, preco_centavos: 3000 })).corpo.id;
  const ana = (await dono("POST", "/loja/agenda/equipe", { nome: "Ana", funcao: "Cabeleireira" })).corpo.id;
  return { reg, loja, dono, publico, corte, barba, ana };
}

test("agenda: serviços e equipe aparecem no painel, com links secretos e horário padrão", async () => {
  const env = mk();
  const { dono, ana, corte } = await salao(env);
  const r = await dono("GET", "/loja/agenda");
  assert.equal(r.status, 200);
  assert.equal(r.corpo.servicos.length, 2);
  assert.equal(r.corpo.equipe[0].id, ana);
  assert.equal(r.corpo.equipe[0].horarios.length, 10); // seg a sex, manhã e tarde
  assert.match(r.corpo.equipe[0].link, /\/agenda\/equipe\/[a-f0-9]{48}$/);
  assert.match(r.corpo.linkRecepcao, /\/agenda\/equipe\/[a-f0-9]{48}$/);
  assert.equal(r.corpo.linkPublico, "https://venus.test/agenda/studio-bela");
  assert.ok(!("token_geral" in r.corpo.config) && !("token" in r.corpo.equipe[0]));
  assert.ok(corte);
});

test("agenda: horários de hoje respeitam a antecedência; amanhã mostra o dia inteiro", async () => {
  const env = mk();
  const { publico, corte } = await salao(env);
  const hoje = await (await publico("GET", `/agenda/studio-bela/horarios?servico=${corte}&data=2026-11-23`)).json();
  assert.deepEqual(hoje.horarios.map((h) => h.hora), ["11:00", "13:00", "13:30", "14:00", "14:30", "15:00", "15:30", "16:00", "16:30", "17:00"]);
  const amanha = await (await publico("GET", `/agenda/studio-bela/horarios?servico=${corte}&data=2026-11-24`)).json();
  assert.equal(amanha.horarios[0].hora, "09:00");
  assert.equal(amanha.horarios.length, 5 + 9); // 09:00–11:00 (5) e 13:00–17:00 (9), de 30 em 30
  const domingo = await (await publico("GET", `/agenda/studio-bela/horarios?servico=${corte}&data=2026-11-29`)).json();
  assert.deepEqual(domingo.horarios, []);
  const passado = await (await publico("GET", `/agenda/studio-bela/horarios?servico=${corte}&data=2026-11-20`)).json();
  assert.deepEqual(passado.horarios, []);
  const longe = await (await publico("GET", `/agenda/studio-bela/horarios?servico=${corte}&data=2027-03-01`)).json();
  assert.deepEqual(longe.horarios, []);
});

test("agenda: o cliente marca, ninguém marca por cima, e o horário some da lista", async () => {
  const env = mk();
  const { publico, corte, barba } = await salao(env);
  const pedido = { servico: corte, data: "2026-11-24", ini: 600, cliente: "Maria Souza", telefone: "(51) 99999-8888" };
  const r1 = await publico("POST", "/agenda/studio-bela/reservar", pedido);
  assert.equal(r1.status, 201);
  const ok = await r1.json();
  assert.match(ok.codigo, /^[a-f0-9]{12}$/);
  assert.equal(ok.quando, "ter, 24/11 às 10:00");
  // mesmo horário de novo → ocupado
  const r2 = await publico("POST", "/agenda/studio-bela/reservar", { ...pedido, cliente: "Outra", telefone: "51988887777" });
  assert.equal(r2.status, 409);
  // um serviço curto que invadiria (10:30 dentro do corte das 10h) também é barrado
  const r3 = await publico("POST", "/agenda/studio-bela/reservar", { ...pedido, servico: barba, ini: 630, cliente: "Outra", telefone: "51988887777" });
  assert.equal(r3.status, 409);
  const lista = await (await publico("GET", `/agenda/studio-bela/horarios?servico=${corte}&data=2026-11-24`)).json();
  assert.ok(!lista.horarios.some((h) => ["09:30", "10:00", "10:30"].includes(h.hora)));
  assert.ok(lista.horarios.some((h) => h.hora === "11:00"));
});

test("agenda: o banco barra o choque mesmo se duas pessoas passarem na conferência ao mesmo tempo", async () => {
  const env = mk();
  const { dono, ana, corte } = await salao(env);
  const a = await dono("POST", "/loja/agenda/reservas", { profissional: ana, servico: corte, data: "2026-11-24", ini: "10:00", cliente: "Balcão 1" });
  assert.equal(a.status, 201);
  const b = await dono("POST", "/loja/agenda/reservas", { profissional: ana, servico: corte, data: "2026-11-24", ini: "10:30", cliente: "Balcão 2" });
  assert.equal(b.status, 409);
  const c = await dono("POST", "/loja/agenda/reservas", { profissional: ana, servico: corte, data: "2026-11-24", ini: "11:00", cliente: "Balcão 3" });
  assert.equal(c.status, 201); // encostado, sem sobrepor
});

test("agenda: validações do cliente (nome, WhatsApp, honeypot, limite de 3)", async () => {
  const env = mk();
  const { publico, corte } = await salao(env);
  const base = { servico: corte, data: "2026-11-24", ini: 540, cliente: "João", telefone: "51999990000" };
  assert.equal((await publico("POST", "/agenda/studio-bela/reservar", { ...base, cliente: "" })).status, 400);
  assert.equal((await publico("POST", "/agenda/studio-bela/reservar", { ...base, telefone: "123" })).status, 400);
  assert.equal((await publico("POST", "/agenda/studio-bela/reservar", { ...base, site: "http://spam" })).status, 400);
  assert.equal((await publico("POST", "/agenda/studio-bela/reservar", { ...base, servico: "naoexiste" })).status, 404);
  for (const ini of [540, 600, 660]) assert.equal((await publico("POST", "/agenda/studio-bela/reservar", { ...base, ini })).status, 201);
  const quarta = await publico("POST", "/agenda/studio-bela/reservar", { ...base, ini: 780 });
  assert.equal(quarta.status, 429);
});

test("agenda: página da marcação, .ics e cancelamento pelo cliente com prazo", async () => {
  const env = mk();
  const { publico, corte } = await salao(env);
  const ok = await (await publico("POST", "/agenda/studio-bela/reservar", { servico: corte, data: "2026-11-24", ini: 900, cliente: "Maria", telefone: "51999990000" })).json();
  const pagina = await publico("GET", `/agenda/r/${ok.codigo}`);
  assert.equal(pagina.status, 200);
  assert.ok((await pagina.text()).includes("<title>"));
  const cal = await publico("GET", `/agenda/r/${ok.codigo}.ics`);
  assert.equal(cal.headers.get("content-type"), "text/calendar; charset=utf-8");
  const txt = await cal.text();
  assert.ok(txt.includes("DTSTART:20261124T180000Z") && txt.includes("SUMMARY:Corte"));
  assert.ok(!txt.includes("51999990000")); // o telefone do cliente não vai no arquivo dele
  assert.equal((await publico("POST", `/agenda/r/${ok.codigo}/cancelar`)).status, 200);
  assert.equal((await publico("POST", `/agenda/r/${ok.codigo}/cancelar`)).status, 409); // já cancelada
  // horário liberou
  const lista = await (await publico("GET", `/agenda/studio-bela/horarios?servico=${corte}&data=2026-11-24`)).json();
  assert.ok(lista.horarios.some((h) => h.hora === "15:00"));
  assert.equal((await publico("GET", "/agenda/r/000000000000")).status, 404);
});

test("agenda: cancelar em cima da hora é recusado (prazo de 2 h)", async () => {
  const env = mk();
  const { publico, corte, dono } = await salao(env);
  const ok = await (await publico("POST", "/agenda/studio-bela/reservar", { servico: corte, data: "2026-11-23", ini: 13 * 60, cliente: "Maria", telefone: "51999990000" })).json();
  const agoraPerto = Date.parse("2026-11-23T11:30:00-03:00"); // 1h30 antes
  const q = new Request(`https://venus.test/agenda/r/${ok.codigo}/cancelar`, { method: "POST" });
  const r = await tratarAgenda(q, env, {}, new URL(q.url), new URL(q.url).pathname, agoraPerto);
  assert.equal(r.status, 409);
  assert.ok((await r.json()).error.includes("2 h"));
  await dono("PUT", "/loja/agenda/config", { cancelamento_horas: 1 });
  const r2 = await tratarAgenda(new Request(q.url, { method: "POST" }), env, {}, new URL(q.url), new URL(q.url).pathname, agoraPerto);
  assert.equal(r2.status, 200);
});

test("agenda: o link do profissional mostra só a agenda dele e deixa dar baixa; recepção vê todos", async () => {
  const env = mk();
  const { dono, publico, corte, ana } = await salao(env);
  const bia = (await dono("POST", "/loja/agenda/equipe", { nome: "Bia" })).corpo.id;
  await dono("POST", "/loja/agenda/reservas", { profissional: ana, servico: corte, data: "2026-11-24", ini: "09:00", cliente: "Cliente da Ana", telefone: "51911112222" });
  const rb = await dono("POST", "/loja/agenda/reservas", { profissional: bia, servico: corte, data: "2026-11-24", ini: "09:00", cliente: "Cliente da Bia" });
  const painel = (await dono("GET", "/loja/agenda")).corpo;
  const linkAna = new URL(painel.equipe.find((p) => p.id === ana).link).pathname;
  const linkRecepcao = new URL(painel.linkRecepcao).pathname;

  assert.equal((await publico("GET", linkAna)).status, 200); // página
  const diaAna = await (await publico("GET", `${linkAna}/dia?data=2026-11-24`)).json();
  assert.equal(diaAna.escopo, "profissional");
  assert.deepEqual(diaAna.reservas.map((r) => r.cliente), ["Cliente da Ana"]);
  assert.ok(!("codigo" in diaAna.reservas[0]));
  const diaTodos = await (await publico("GET", `${linkRecepcao}/dia?data=2026-11-24`)).json();
  assert.equal(diaTodos.escopo, "recepcao");
  assert.deepEqual(diaTodos.reservas.map((r) => r.cliente).sort(), ["Cliente da Ana", "Cliente da Bia"]);

  const idBia = rb.corpo.id;
  assert.equal((await publico("POST", `${linkAna}/reservas/${idBia}`, { status: "concluido" })).status, 404); // não é dela
  const idAna = diaAna.reservas[0].id;
  assert.equal((await publico("POST", `${linkAna}/reservas/${idAna}`, { status: "concluido" })).status, 200);
  assert.equal((await publico("POST", `${linkAna}/reservas/${idAna}`, { status: "xis" })).status, 400);
  assert.equal((await publico("POST", `${linkRecepcao}/reservas/${idBia}`, { status: "faltou" })).status, 200);

  const cal = await (await publico("GET", `${linkAna}.ics`)).text();
  assert.ok(cal.includes("Cliente da Ana") && !cal.includes("Cliente da Bia"));
  assert.equal((await publico("GET", `/agenda/equipe/${"0".repeat(48)}/dia`)).status, 404);
});

test("agenda: gerar novo link invalida o antigo", async () => {
  const env = mk();
  const { dono, publico, ana } = await salao(env);
  const antes = new URL((await dono("GET", "/loja/agenda")).corpo.equipe[0].link).pathname;
  assert.equal((await publico("GET", `${antes}/dia`)).status, 200);
  const novo = (await dono("POST", `/loja/agenda/equipe/${ana}/link`)).corpo.link;
  assert.equal((await publico("GET", `${antes}/dia`)).status, 404);
  assert.equal((await publico("GET", `${new URL(novo).pathname}/dia`)).status, 200);
  const rec = new URL((await dono("GET", "/loja/agenda")).corpo.linkRecepcao).pathname;
  await dono("POST", "/loja/agenda/recepcao/link");
  assert.equal((await publico("GET", `${rec}/dia`)).status, 404);
});

test("agenda: folga bloqueia o dia; serviço que o profissional não faz não aparece para ele", async () => {
  const env = mk();
  const { dono, publico, corte, barba, ana } = await salao(env);
  assert.equal((await dono("POST", "/loja/agenda/bloqueios", { data: "2026-11-24" })).status, 201);
  const l = await (await publico("GET", `/agenda/studio-bela/horarios?servico=${corte}&data=2026-11-24`)).json();
  assert.deepEqual(l.horarios, []);
  assert.equal((await publico("POST", "/agenda/studio-bela/reservar", { servico: corte, data: "2026-11-24", ini: 540, cliente: "Zé", telefone: "51999990000" })).status, 409);
  // Ana só faz barba: o corte não tem ninguém para atender
  await dono("POST", "/loja/agenda/equipe", { id: ana, nome: "Ana", servicos: [barba] });
  const sem = await (await publico("GET", `/agenda/studio-bela/horarios?servico=${corte}&data=2026-11-25`)).json();
  assert.deepEqual(sem.horarios, []);
  const com = await (await publico("GET", `/agenda/studio-bela/horarios?servico=${barba}&data=2026-11-25`)).json();
  assert.ok(com.horarios.length > 0);
});

test("agenda: tanto faz o profissional junta a equipe; o escolhido filtra", async () => {
  const env = mk();
  const { dono, publico, corte, ana } = await salao(env);
  const bia = (await dono("POST", "/loja/agenda/equipe", { nome: "Bia", horarios: [{ dia: 2, ini: "14:00", fim: "16:00" }] })).corpo.id;
  const todos = await (await publico("GET", `/agenda/studio-bela/horarios?servico=${corte}&data=2026-11-24`)).json();
  assert.ok(todos.horarios.length >= 14);
  const soBia = await (await publico("GET", `/agenda/studio-bela/horarios?servico=${corte}&data=2026-11-24&prof=${bia}`)).json();
  assert.deepEqual(soBia.horarios.map((h) => h.hora), ["14:00", "14:30", "15:00"]);
  // com a Ana ocupada às 14h, "tanto faz" ainda oferece 14h (com a Bia)
  await dono("POST", "/loja/agenda/reservas", { profissional: ana, servico: corte, data: "2026-11-24", ini: "14:00", cliente: "Xavier" });
  const depois = await (await publico("GET", `/agenda/studio-bela/horarios?servico=${corte}&data=2026-11-24`)).json();
  assert.equal(depois.horarios.find((h) => h.hora === "14:00").profissional, bia);
});

test("agenda: dono vê o período, marca no balcão, cancela, reabre e recebe os avisos das marcações novas", async () => {
  const env = mk();
  const { dono, publico, corte, ana } = await salao(env);
  const base = (await dono("GET", "/loja/agenda/novos")).corpo;
  assert.deepEqual(base.reservas, []);
  assert.equal(base.ultimo, 0);
  const ok = await (await publico("POST", "/agenda/studio-bela/reservar", { servico: corte, data: "2026-11-24", ini: 540, cliente: "Maria", telefone: "51999990000" })).json();
  await dono("POST", "/loja/agenda/reservas", { profissional: ana, servico: corte, data: "2026-11-24", ini: "15:00", cliente: "Balcão" });
  const novos = (await dono("GET", `/loja/agenda/novos?desde=${base.ultimo}`)).corpo;
  assert.equal(novos.reservas.length, 1); // só as feitas pelo cliente (a do balcão o dono já sabe)
  assert.equal(novos.reservas[0].cliente, "Maria");
  assert.equal(novos.reservas[0].servico_nome, "Corte");
  assert.equal(novos.ultimo, 2);
  assert.deepEqual((await dono("GET", `/loja/agenda/novos?desde=${novos.ultimo}`)).corpo.reservas, []);
  const sem = (await dono("GET", "/loja/agenda/reservas?de=2026-11-23&ate=2026-11-29")).corpo.reservas;
  assert.equal(sem.length, 2);
  assert.equal(sem[0].profissional_nome, "Ana");
  const id = sem[0].id;
  assert.equal((await dono("POST", `/loja/agenda/reservas/${id}`, { status: "cancelado" })).status, 200);
  // outro cliente pega o horário, então reabrir a cancelada dá choque
  assert.equal((await publico("POST", "/agenda/studio-bela/reservar", { servico: corte, data: "2026-11-24", ini: 540, cliente: "Outro", telefone: "51988887777" })).status, 201);
  assert.equal((await dono("POST", `/loja/agenda/reservas/${id}`, { status: "marcado" })).status, 409);
  assert.equal((await dono("DELETE", `/loja/agenda/reservas/${id}`)).status, 200);
  assert.equal((await dono("GET", "/loja/agenda/reservas?de=2026-11-01&ate=2026-12-31")).status, 200);
  assert.equal((await dono("GET", "/loja/agenda/reservas?de=2026-01-01&ate=2026-12-31")).status, 400); // período grande demais
  assert.ok(ok.codigo);
});

test("agenda: pausar a agenda online barra novas marcações; loja fora do ar não abre", async () => {
  const env = mk();
  const { dono, publico, corte, reg } = await salao(env);
  await dono("PUT", "/loja/agenda/config", { ativa: false });
  assert.equal((await publico("POST", "/agenda/studio-bela/reservar", { servico: corte, data: "2026-11-24", ini: 540, cliente: "Zé", telefone: "51999990000" })).status, 403);
  await dono("PUT", "/loja/agenda/config", { ativa: true, passo_min: 7, janela_dias: 9999 }); // valores fora do permitido são ignorados
  const cfg = (await dono("GET", "/loja/agenda")).corpo.config;
  assert.equal(cfg.passo_min, 30);
  assert.equal(cfg.janela_dias, 30);
  assert.equal((await publico("GET", "/agenda/studio-bela")).status, 200);
  assert.equal((await publico("GET", "/agenda/nao-existe")).status, 404);
  await env.DB.prepare("UPDATE lojas SET trial_fim = 1, ativo_ate = 0 WHERE id = ?").bind(reg.id).run();
  assert.equal((await publico("GET", "/agenda/studio-bela")).status, 404);
});

test("agenda: o painel público não vaza telefone nem tokens", async () => {
  const env = mk();
  const { publico, dono, corte } = await salao(env);
  await publico("POST", "/agenda/studio-bela/reservar", { servico: corte, data: "2026-11-24", ini: 540, cliente: "Maria", telefone: "51999990000" });
  const info = await (await publico("GET", "/agenda/studio-bela/info")).text();
  assert.ok(!info.includes("51999990000") && !/[a-f0-9]{48}/.test(info));
  const j = JSON.parse(info);
  assert.equal(j.servicos.length, 2);
  assert.equal(j.profissionais.length, 1);
  assert.equal(j.hoje, "2026-11-23");
  void dono;
});

test("agenda: o caminho completo pelo servidor da loja (token da loja)", async () => {
  const env = mk();
  const reg = await registrarLoja(env, { nome: "Barbearia Rei", slug: "barbearia-rei" });
  const chamar = async (metodo, caminho, corpo) => {
    const q = new Request(`https://venus.test${caminho}`, { method: metodo, headers: { authorization: `Bearer ${reg.token}` }, body: corpo ? JSON.stringify(corpo) : undefined });
    const u = new URL(q.url);
    return tratarLoja(q, env, {}, u, u.pathname);
  };
  const r = await chamar("POST", "/loja/agenda/servicos", { nome: "Corte", duracao_min: 30 });
  assert.equal(r.status, 201);
  const painel = await (await chamar("GET", "/loja/agenda")).json();
  assert.equal(painel.servicos[0].nome, "Corte");
  assert.equal((await chamar("GET", "/loja/agenda/inexistente")).status, 404);
  assert.equal((await tratarLoja(new Request("https://venus.test/loja/agenda"), env, {}, new URL("https://venus.test/loja/agenda"), "/loja/agenda")).status, 401);
});

test("agenda: serviço inválido e remoção", async () => {
  const env = mk();
  const { dono, corte } = await salao(env);
  assert.equal((await dono("POST", "/loja/agenda/servicos", { nome: "", duracao_min: 30 })).status, 400);
  assert.equal((await dono("POST", "/loja/agenda/servicos", { nome: "X", duracao_min: 0 })).status, 400);
  assert.equal((await dono("POST", "/loja/agenda/servicos", { id: corte, nome: "Corte social", duracao_min: 45, preco_centavos: null })).status, 201);
  const l = (await dono("GET", "/loja/agenda")).corpo.servicos.find((s) => s.id === corte);
  assert.equal(l.nome, "Corte social");
  assert.equal(l.duracao_min, 45);
  assert.equal(l.preco_centavos, null);
  assert.equal((await dono("DELETE", `/loja/agenda/servicos/${corte}`)).status, 200);
  assert.equal((await dono("GET", "/loja/agenda")).corpo.servicos.length, 1);
});
