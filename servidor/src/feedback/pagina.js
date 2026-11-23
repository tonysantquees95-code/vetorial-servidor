// Página única de feedback para todos os apps: reportar erro, dar ideia/elogio e responder a pesquisa rápida.
import { cssBase, JS_COMUM, TEMA_ESCURO } from "../agenda/ui-comum.js";
import { corSobre } from "../meusite/site.js";
import { AJUDA, APPS, CHAMOU, COMO_CONHECEU, INDICARIA, PLATAFORMAS } from "./dados.js";

const dadosJs = (o) => JSON.stringify(o).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
const CORES = { venus: "#E36BD0", vindex: "#36D6FF", vortex: "#8E6CEF", voxix: "#6D7CFF", drive: "#36D6FF", vyntem: "#2ECC8F", vynx: "#2dd4bf", vspace: "#8E6CEF", velox: "#F5B93A", vetogoshi: "#F28B50", painel: "#36D6FF", site: "#E36BD0" };

const CSS = `.tela{padding-bottom:40px}.topo{margin:6px 0 16px}.topo h1{font-size:24px}.beta{display:inline-block;margin-top:8px;padding:4px 12px;border-radius:20px;border:1px solid var(--cor);color:var(--cor);font-size:12px;font-weight:700;letter-spacing:.06em}
.abas{display:flex;gap:8px;margin:0 0 20px;flex-wrap:wrap}.aba{flex:1 1 0;min-width:max-content;min-height:48px;padding:8px 12px;border-radius:24px;border:2px solid var(--borda);background:var(--painel);cursor:pointer;font-weight:700;font-size:14px}
.aba.sel{border-color:var(--cor);background:color-mix(in srgb,var(--cor) 18%,var(--painel));color:var(--cor)}
.pergunta{margin-bottom:26px}.pergunta>h3{font-size:16px;margin-bottom:10px}.pergunta .opcao{min-height:48px;padding:10px 14px}
.estrelas{display:flex;gap:10px}.estrela{flex:1;min-height:56px;border-radius:16px;border:2px solid var(--borda);background:var(--painel);cursor:pointer;font-size:24px;color:var(--suave)}.estrela.sel{border-color:var(--cor);background:var(--cor);color:var(--sobre)}
.hp{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}.obrigado{text-align:center;padding:30px 0}.obrigado .ico{width:72px;height:72px;border-radius:50%;background:var(--cor);color:var(--sobre);display:flex;align-items:center;justify-content:center;font-size:38px;margin:0 auto 16px}`;

const JS = String.raw`
var D=__DADOS__,raiz=A.$("#app"),E={aba:"msg",tipo:"problema",texto:"",contato:"",nota:0,r:{como_conheceu:"",ajuda:"",indicaria:"",chamou:[],falta:"",por_que:""},enviando:false,ok:false,erro:""};
var TIPOS=[["problema","Reportar um erro"],["ideia","Dar uma ideia"],["elogio","Elogiar"]];
function opcoes(mapa,atual,aoEscolher,multi){var l=A.h("div",{class:"lista",role:multi?"group":"radiogroup"});Object.keys(mapa).forEach(function(k){var sel=multi?atual.indexOf(k)>=0:atual===k;l.appendChild(A.h("button",{type:"button",class:"opcao"+(sel?" sel":""),role:multi?"checkbox":"radio","aria-checked":sel?"true":"false",onclick:function(){aoEscolher(k)}},[A.h("span",{class:"marca",text:"✓"}),A.h("span",{class:"corpo",text:mapa[k]})]))});return l}
function desenhar(){A.limpa(raiz);
raiz.appendChild(A.h("div",{class:"topo"},[A.h("h1",{text:"Ajude a melhorar o "+D.nome}),A.h("div",{class:"mudo",style:"margin-top:6px",text:"O "+D.nome+" está em fase de testes (beta). Seu relato nos ajuda a corrigir o que não funciona e a criar o que falta."}),A.h("span",{class:"beta",text:"FASE DE TESTES · BETA"})]));
if(E.ok){raiz.appendChild(A.h("div",{class:"obrigado"},[A.h("div",{class:"ico",text:"✓"}),A.h("h2",{text:"Obrigado!"}),A.h("p",{class:"mudo",text:E.aba==="pesq"?"Suas respostas já chegaram. Com elas a gente sabe o que está dando certo e o que ainda precisa melhorar.":"Recebemos o seu relato. A gente lê todos e resolve o que for preciso."}),A.h("div",{style:"display:grid;gap:10px;margin-top:20px"},[A.h("button",{type:"button",class:"bt",text:"Enviar outro relato",onclick:function(){E.ok=false;E.texto="";E.erro="";desenhar()}}),E.aba==="msg"?A.h("button",{type:"button",class:"bt sec",text:"Responder a pesquisa rápida (1 min)",onclick:function(){E.ok=false;E.aba="pesq";desenhar()}}):null])]));rodape();return}
var ab=A.h("div",{class:"abas",role:"tablist"});[["msg","Relato ou ideia"],["pesq","Pesquisa rápida"]].forEach(function(a){ab.appendChild(A.h("button",{type:"button",class:"aba"+(E.aba===a[0]?" sel":""),role:"tab","aria-selected":E.aba===a[0]?"true":"false",text:a[1],onclick:function(){E.aba=a[0];E.erro="";desenhar()}}))});raiz.appendChild(ab);
if(E.aba==="msg")telaMsg();else telaPesq();
raiz.appendChild(A.h("div",{class:"erro"+(E.erro?"":" sumir"),role:"alert",style:"margin-bottom:14px",text:E.erro}));
raiz.appendChild(A.h("button",{type:"button",class:"bt cheio",disabled:E.enviando,text:E.enviando?"Enviando…":(E.aba==="msg"?"Enviar":"Enviar respostas"),onclick:enviar}));
rodape()}
function rodape(){raiz.appendChild(A.h("div",{class:"rodape"},["Feito com carinho pela ",A.h("b",{text:"VETORIAL TECH"})]))}
function telaMsg(){var ft=A.h("div",{class:"fichas",role:"radiogroup","aria-label":"Tipo"});TIPOS.forEach(function(t){ft.appendChild(A.ficha(t[1],E.tipo===t[0],function(){E.tipo=t[0];desenhar()}))});raiz.appendChild(A.h("div",{class:"campo"},[A.h("div",{class:"rot",text:"O que você quer enviar?"}),ft]));
var dica=E.tipo==="problema"?"Conte o que você estava fazendo e o que aconteceu. Se apareceu alguma mensagem, escreva ela aqui.":E.tipo==="ideia"?"O que o "+D.nome+" poderia fazer que ajudaria você?":"O que você mais gostou?";
var t=A.h("textarea",{maxlength:"2000",style:"min-height:150px",oninput:function(){E.texto=t.value}});t.value=E.texto;raiz.appendChild(A.campo("Sua mensagem",t,dica));
var c=A.h("input",{type:"text",maxlength:"80",placeholder:"WhatsApp ou e-mail (opcional)",oninput:function(){E.contato=c.value}});c.value=E.contato;raiz.appendChild(A.campo("Quer resposta?",c,"Só usamos para falar com você sobre este relato."));
raiz.appendChild(A.h("p",{class:"mudo peq",style:"margin:-4px 0 18px",text:"Junto vão só o app ("+D.nome+(D.versao?" "+D.versao:"")+") e o tipo de aparelho. Não envie senhas."}));
raiz.appendChild(A.h("div",{class:"hp"},[A.h("input",{type:"text",id:"hp",tabindex:"-1",autocomplete:"off","aria-hidden":"true"})]))}
function telaPesq(){var R=E.r;
var q1=A.h("div",{class:"pergunta"},[A.h("h3",{text:"1. Que nota você dá para o "+D.nome+"?"})]);var es=A.h("div",{class:"estrelas",role:"radiogroup"});for(var i=1;i<=5;i++){(function(n){es.appendChild(A.h("button",{type:"button",class:"estrela"+(E.nota===n?" sel":""),role:"radio","aria-checked":E.nota===n?"true":"false","aria-label":n+" de 5",text:String(n),onclick:function(){E.nota=n;desenhar()}}))})(i)}q1.appendChild(es);q1.appendChild(A.h("div",{style:"display:flex;justify-content:space-between",class:"mudo peq"},[A.h("span",{text:"1 = ruim"}),A.h("span",{text:"5 = ótimo"})]));raiz.appendChild(q1);
raiz.appendChild(A.h("div",{class:"pergunta"},[A.h("h3",{text:"2. O app realmente ajuda você?"}),opcoes(D.ajuda,R.ajuda,function(k){R.ajuda=k;desenhar()})]));
raiz.appendChild(A.h("div",{class:"pergunta"},[A.h("h3",{text:"3. O que mais chamou a sua atenção? (pode marcar vários)"}),opcoes(D.chamou,R.chamou,function(k){var p=R.chamou.indexOf(k);if(p>=0)R.chamou.splice(p,1);else R.chamou.push(k);desenhar()},true)]));
raiz.appendChild(A.h("div",{class:"pergunta"},[A.h("h3",{text:"4. Como você conheceu a Vetorial?"}),opcoes(D.como,R.como_conheceu,function(k){R.como_conheceu=k;desenhar()})]));
raiz.appendChild(A.h("div",{class:"pergunta"},[A.h("h3",{text:"5. Você indicaria para um amigo?"}),opcoes(D.indicaria,R.indicaria,function(k){R.indicaria=k;desenhar()})]));
var f=A.h("textarea",{maxlength:"600",oninput:function(){R.falta=f.value}});f.value=R.falta;raiz.appendChild(A.h("div",{class:"pergunta"},[A.campo("6. O que está faltando ou não funcionou bem? (opcional)",f)]));
var p=A.h("textarea",{maxlength:"600",oninput:function(){R.por_que=p.value}});p.value=R.por_que;raiz.appendChild(A.h("div",{class:"pergunta"},[A.campo("7. Por que você quis testar a Vênus? (opcional)",p)]))}
function enviar(){if(E.enviando)return;E.erro="";var corpo={app:D.app,versao:D.versao,plataforma:D.plataforma,site:(A.$("#hp")||{}).value||""};
if(E.aba==="msg"){corpo.tipo=E.tipo;corpo.texto=E.texto;corpo.contato=E.contato;if(E.texto.trim().length<5){E.erro=E.tipo==="problema"?"Conte o que aconteceu, em poucas palavras.":"Escreva um pouquinho mais.";return desenhar()}}
else{corpo.tipo="pesquisa";corpo.nota=E.nota;corpo.respostas=E.r;if(!E.nota&&!E.r.ajuda&&!E.r.como_conheceu&&!E.r.indicaria&&!E.r.chamou.length&&!E.r.falta&&!E.r.por_que){E.erro="Responda pelo menos uma pergunta.";return desenhar()}}
E.enviando=true;desenhar();
A.req("POST","/feedback",corpo).then(function(){E.enviando=false;E.ok=true;E.texto="";E.contato="";E.nota=0;E.r={como_conheceu:"",ajuda:"",indicaria:"",chamou:[],falta:"",por_que:""};desenhar()}).catch(function(e){E.enviando=false;E.erro=e.message||"Não consegui enviar. Tente de novo.";desenhar()})}
desenhar();
`;

export function paginaDeFeedback({ app, versao, plataforma, cor }) {
  const a = Object.prototype.hasOwnProperty.call(APPS, app) ? app : "venus";
  const c = /^[0-9a-fA-F]{6}$/.test(String(cor || "")) ? `#${cor}`.toUpperCase() : CORES[a] || "#E36BD0";
  const tema = { ...TEMA_ESCURO, cor: c, sobre: corSobre(c) };
  const dados = {
    app: a, nome: APPS[a], versao: String(versao || "").replace(/[^\w.\-+ ]/g, "").slice(0, 20), plataforma: PLATAFORMAS.has(plataforma) ? plataforma : "outro",
    ajuda: AJUDA, chamou: CHAMOU, como: COMO_CONHECEU, indicaria: INDICARIA,
  };
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex"><link rel="icon" href="data:,"><title>Feedback · ${APPS[a]}</title><style>${cssBase(tema)}${CSS}</style></head><body><main class="tela" id="app"></main><script>${JS_COMUM}\n${JS.replace("__DADOS__", dadosJs(dados))}</script></body></html>`;
}
