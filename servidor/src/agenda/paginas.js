// Páginas da agenda: do cliente (marcar e ver a marcação), da equipe (link secreto) e o painel do dono.
// O JavaScript das páginas fica em textos String.raw (sem crase nem ${} dentro) e nada é montado com innerHTML.
import { corSobre } from "../meusite/site.js";
import { cssBase, JS_COMUM, TEMA_ESCURO } from "./ui-comum.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const dadosJs = (o) => JSON.stringify(o).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
const corOk = (c) => (/^#[0-9a-fA-F]{6}$/.test(String(c || "")) ? String(c).toUpperCase() : "#C2185B");

const moldura = (titulo, css, corpo, js) =>
  `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex"><link rel="icon" href="data:,"><title>${esc(titulo)}</title><style>${css}</style></head><body>${corpo}<script>${JS_COMUM}\n${js}</script></body></html>`;

const temaDoCliente = (cor) => {
  const c = corOk(cor);
  return { fundo: "#FBF7F4", painel: "#FFFFFF", texto: "#2A2024", suave: "#7B6C72", borda: "#2A20242b", cor: c, sobre: corSobre(c), titulo: "Georgia,'Times New Roman',serif", peso: 700, estilo: "normal", escuro: false };
};

const CSS_PROPRIO = `.topo{display:flex;align-items:center;gap:12px;margin:6px 0 18px}.topo img{width:48px;height:48px;border-radius:12px;object-fit:contain;background:#fff}.topo h1{font-size:22px}
.passo{margin-bottom:26px}.passo>h2{font-size:17px;margin-bottom:10px}.passo>h2 small{font-weight:400;color:var(--suave);font-family:system-ui,sans-serif}
.dias{display:flex;gap:8px;overflow-x:auto;padding:2px 2px 8px;scroll-snap-type:x proximity}.dia{flex:none;min-width:62px;text-align:center;padding:8px 6px;border-radius:14px;border:2px solid var(--borda);background:var(--painel);cursor:pointer;scroll-snap-align:start}
.dia b{display:block;font-size:18px}.dia span{font-size:12px;color:var(--suave)}.dia.sel{border-color:var(--cor);background:var(--cor);color:var(--sobre)}.dia.sel span{color:inherit}
.horas{display:grid;grid-template-columns:repeat(auto-fill,minmax(84px,1fr));gap:10px}.horas .ficha{text-align:center;padding-left:8px;padding-right:8px}
.barra{position:fixed;left:0;right:0;bottom:0;padding:12px 16px calc(12px + env(safe-area-inset-bottom));background:var(--fundo);border-top:1px solid var(--borda)}.barra .bt{max-width:728px;margin:0 auto;display:flex}
.resumo{display:grid;gap:4px}.resumo b{font-size:18px}.hp{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}
.grande{text-align:center;padding:12px 0 4px}.grande .ico{width:64px;height:64px;border-radius:50%;background:var(--cor);color:var(--sobre);display:flex;align-items:center;justify-content:center;font-size:34px;margin:0 auto 12px}
.acoes-v{display:grid;gap:10px;margin-top:16px}`;

// ======================================================================================================== cliente: marcar
const JS_MARCAR = String.raw`
var L=__LOJA__,ATIVA=__ATIVA__,base="/agenda/"+L.slug;
var S={info:null,servico:null,prof:"",data:null,hora:null,horarios:null,carregando:false,fim:null};
var raiz=A.$("#app");
function pegarPre(){var m=/[?&]s=([a-f0-9]{12})/.exec(location.search);return m?m[1]:null}
function profsDoServico(){var i=S.info;if(!S.servico)return[];return i.profissionais.filter(function(p){return p.servicos.indexOf(S.servico.id)>=0})}
function escolherServico(s){S.servico=s;S.prof="";S.data=null;S.hora=null;S.horarios=null;desenhar()}
function carregarHorarios(){if(!S.data)return;S.horarios=null;S.hora=null;S.carregando=true;desenhar();
var d=S.data;A.req("GET",base+"/horarios?servico="+S.servico.id+"&prof="+encodeURIComponent(S.prof)+"&data="+d).then(function(r){if(S.data!==d)return;S.horarios=r.horarios;S.carregando=false;desenhar()}).catch(function(e){S.horarios=[];S.carregando=false;desenhar();A.aviso(e.message,true)})}
function desenhar(){var i=S.info;A.limpa(raiz);
raiz.appendChild(A.h("div",{class:"topo"},[L.logo?A.h("img",{src:L.logo,alt:""}):null,A.h("div",{},[A.h("h1",{text:L.nome}),A.h("div",{class:"mudo peq",text:"Marque o seu horário"})])]));
if(!ATIVA||!i.ativa){raiz.appendChild(A.h("div",{class:"aviso",text:"A agenda online está pausada no momento."+(L.whatsapp?" Chame no WhatsApp para marcar.":"")}));rodape();return}
if(i.aviso)raiz.appendChild(A.h("div",{class:"aviso",style:"margin-bottom:18px",text:i.aviso}));
if(!i.servicos.length){raiz.appendChild(A.h("div",{class:"aviso",text:"Ainda não há serviços para marcar online."}));rodape();return}
/* 1. serviço */
var p1=A.h("section",{class:"passo"},[A.h("h2",{text:"1. Qual serviço?"})]);var lista=A.h("div",{class:"lista",role:"radiogroup"});
i.servicos.forEach(function(s){var sel=S.servico&&S.servico.id===s.id;
lista.appendChild(A.h("button",{type:"button",class:"opcao"+(sel?" sel":""),role:"radio","aria-checked":sel?"true":"false",onclick:function(){escolherServico(s)}},[A.h("span",{class:"marca",text:"✓"}),A.h("span",{class:"corpo"},[A.h("div",{class:"nome",text:s.nome}),A.h("div",{class:"mudo peq",text:A.dur(s.duracao)+(s.descricao?" · "+s.descricao:"")})]),s.preco!=null?A.h("span",{class:"preco",text:A.reais(s.preco)}):null]))});
p1.appendChild(lista);raiz.appendChild(p1);
if(!S.servico){rodape();return}
var ps=profsDoServico();
if(!ps.length){raiz.appendChild(A.h("div",{class:"aviso",text:"Esse serviço ainda não tem profissional com horário. Chame no WhatsApp."}));rodape();return}
/* 2. profissional */
if(ps.length>1){var p2=A.h("section",{class:"passo"},[A.h("h2",{text:"2. Com quem?"})]);var f=A.h("div",{class:"fichas"});
f.appendChild(A.ficha("Tanto faz",S.prof==="",function(){S.prof="";S.hora=null;carregarHorarios()}));
ps.forEach(function(p){f.appendChild(A.ficha(p.nome,S.prof===p.id,function(){S.prof=p.id;S.hora=null;carregarHorarios()}))});p2.appendChild(f);raiz.appendChild(p2)}
/* 3. data e hora */
var p3=A.h("section",{class:"passo"},[A.h("h2",{text:(ps.length>1?"3":"2")+". Qual dia e horário?"})]);
var dias=A.h("div",{class:"dias",role:"group","aria-label":"Dia"});var n=Math.min(i.janelaDias,14);
for(var k=0;k<n;k++){(function(d){var sel=S.data===d;dias.appendChild(A.h("button",{type:"button",class:"dia"+(sel?" sel":""),"aria-pressed":sel?"true":"false",onclick:function(){S.data=d;carregarHorarios()}},[A.h("span",{text:A.DIAS[A.dow(d)]}),A.h("b",{text:d.slice(8,10)}),A.h("span",{text:d.slice(5,7)+"/"+d.slice(2,4)})]))})(A.somar(i.hoje,k))}
p3.appendChild(dias);
if(i.janelaDias>14){var ou=A.h("input",{type:"date",min:i.hoje,max:A.somar(i.hoje,i.janelaDias),onchange:function(){if(ou.value){S.data=ou.value;carregarHorarios()}}});p3.appendChild(A.campo("Outra data",ou))}
if(S.data){if(S.carregando)p3.appendChild(A.h("p",{class:"mudo",text:"Procurando horários…"}));
else if(S.horarios&&!S.horarios.length)p3.appendChild(A.h("div",{class:"aviso",text:"Sem horários livres nesse dia. Tente outro dia"+(ps.length>1&&S.prof?" ou escolha “Tanto faz”.":".")}));
else if(S.horarios){var hs=A.h("div",{class:"horas",role:"group","aria-label":"Horário"});var vistos={};
S.horarios.forEach(function(h){if(vistos[h.ini])return;vistos[h.ini]=1;var sel=S.hora&&S.hora.ini===h.ini;hs.appendChild(A.ficha(h.hora,sel,function(){S.hora=h;desenhar();var b=A.$("#dados");if(b)b.scrollIntoView({behavior:"smooth",block:"start"})}))});p3.appendChild(hs)}}
raiz.appendChild(p3);
if(!S.hora){rodape();return}
/* 4. dados */
var p4=A.h("section",{class:"passo",id:"dados"},[A.h("h2",{text:(ps.length>1?"4":"3")+". Seus dados"})]);
var res=A.h("div",{class:"cartao resumo",style:"margin-bottom:14px"},[A.h("b",{text:S.servico.nome}),A.h("div",{text:A.DIAS_LONGOS[A.dow(S.data)]+", "+A.dm(S.data)+" às "+S.hora.hora+(S.hora.profissionalNome?" · com "+S.hora.profissionalNome:"")}),A.h("div",{class:"mudo",text:A.dur(S.servico.duracao)+(S.servico.preco!=null?" · "+A.reais(S.servico.preco):"")})]);p4.appendChild(res);
var nome=A.h("input",{type:"text",autocomplete:"name",maxlength:"80",value:S.nome||"",oninput:function(){S.nome=nome.value}});
var tel=A.h("input",{type:"tel",autocomplete:"tel",inputmode:"tel",placeholder:"(51) 99999-0000",value:S.tel||"",oninput:function(){tel.value=A.mascaraTel(tel.value);S.tel=tel.value}});
var obs=A.h("textarea",{maxlength:"200",placeholder:"Opcional",oninput:function(){S.obs=obs.value}});obs.value=S.obs||"";
var hp=A.h("input",{type:"text",name:"site",tabindex:"-1",autocomplete:"off","aria-hidden":"true"});
p4.appendChild(A.campo("Seu nome",nome));p4.appendChild(A.campo("Seu WhatsApp",tel,"Usamos só para confirmar e avisar sobre o horário."));p4.appendChild(A.campo("Recado (opcional)",obs));p4.appendChild(A.h("div",{class:"hp"},[hp]));
var erro=A.h("div",{class:"erro sumir",role:"alert"});p4.appendChild(erro);
var bt=A.h("button",{type:"button",class:"bt cheio",text:"Confirmar horário",onclick:function(){
erro.classList.add("sumir");if((nome.value||"").trim().length<2){return mostrar("Informe o seu nome.")}if(String(tel.value).replace(/\D/g,"").length<10){return mostrar("Informe o WhatsApp com DDD.")}
bt.disabled=true;bt.textContent="Marcando…";
A.req("POST",base+"/reservar",{servico:S.servico.id,profissional:S.hora.profissional,data:S.data,ini:S.hora.ini,cliente:nome.value.trim(),telefone:tel.value,obs:obs.value,site:hp.value}).then(function(r){S.fim=r;try{sessionStorage.setItem("ag_"+L.slug,JSON.stringify({n:nome.value,t:tel.value}))}catch(e){}final()}).catch(function(e){bt.disabled=false;bt.textContent="Confirmar horário";mostrar(e.message);if(e.status===409){carregarHorarios()}})}});
function mostrar(t){erro.textContent=t;erro.classList.remove("sumir")}
p4.appendChild(bt);raiz.appendChild(p4);rodape()}
function rodape(){raiz.appendChild(A.h("div",{class:"rodape"},["Agenda feita com a Vênus · ",A.h("b",{text:"VETORIAL TECH"})]))}
function final(){var r=S.fim;A.limpa(raiz);window.scrollTo(0,0);
var msg="Olá! Acabei de marcar "+r.servico+" para "+r.quando+(r.profissional?" com "+r.profissional:"")+". Meu nome é "+(S.nome||"")+".";var z=A.zap(L.whatsapp,msg);
raiz.appendChild(A.h("div",{class:"grande"},[A.h("div",{class:"ico",text:"✓"}),A.h("h1",{text:"Horário marcado!"}),A.h("p",{class:"mudo",text:"Guarde o link da sua marcação: nele você adiciona à agenda do celular ou cancela, se precisar."})]));
raiz.appendChild(A.h("div",{class:"cartao resumo"},[A.h("b",{text:r.servico}),A.h("div",{text:r.quando+" (termina às "+r.fim+")"}),r.profissional?A.h("div",{class:"mudo",text:"Com "+r.profissional}):null,A.h("div",{class:"mudo",text:L.nome})]));
var ac=A.h("div",{class:"acoes-v"});
ac.appendChild(A.h("a",{class:"bt",href:r.link+".ics",text:"Adicionar à minha agenda"}));
if(z)ac.appendChild(A.h("a",{class:"bt sec",href:z,target:"_blank",rel:"noopener",text:"Avisar no WhatsApp"}));
ac.appendChild(A.h("a",{class:"bt sec",href:r.link,text:"Ver ou cancelar minha marcação"}));
ac.appendChild(A.h("button",{type:"button",class:"bt sec",text:"Copiar link da marcação",onclick:function(){A.copiar(location.origin+r.link,"Link copiado")}}));
raiz.appendChild(ac);rodape()}
A.req("GET",base+"/info").then(function(i){S.info=i;var pre=pegarPre();if(pre){var s=i.servicos.filter(function(x){return x.id===pre})[0];if(s)S.servico=s}
try{var g=JSON.parse(sessionStorage.getItem("ag_"+L.slug)||"null");if(g){S.nome=g.n;S.tel=g.t}}catch(e){}desenhar()}).catch(function(e){A.limpa(raiz);raiz.appendChild(A.h("div",{class:"erro",text:e.message}))});
`;

export const paginaDeAgendamento = ({ loja, ativa }) =>
  moldura(`Agendar · ${loja.nome}`, cssBase(temaDoCliente(loja.cor)) + CSS_PROPRIO, `<main class="tela" id="app"><p class="mudo">Carregando…</p></main>`,
    JS_MARCAR.replace("__LOJA__", dadosJs({ slug: loja.slug, nome: loja.nome, logo: /^https:\/\//.test(loja.logo || "") ? loja.logo : "", whatsapp: String(loja.whatsapp || "").replace(/\D/g, "") })).replace("__ATIVA__", ativa ? "true" : "false"));

// ======================================================================================================== cliente: a marcação
const JS_MARCACAO = String.raw`
var D=__DADOS__,raiz=A.$("#app");
function ver(){A.limpa(raiz);var r=D.reserva;
raiz.appendChild(A.h("div",{class:"topo"},[A.h("div",{},[A.h("h1",{text:D.loja.nome}),A.h("div",{class:"mudo peq",text:"Sua marcação"})])]));
raiz.appendChild(A.h("div",{class:"cartao resumo"},[A.pilula(r.status),A.h("b",{text:r.servico_nome}),A.h("div",{text:D.bonita+" (termina às "+A.hhmm(r.fim)+")"}),r.profissional_nome?A.h("div",{class:"mudo",text:"Com "+r.profissional_nome}):null,r.preco_centavos!=null?A.h("div",{class:"mudo",text:A.reais(r.preco_centavos)}):null,A.h("div",{class:"mudo",text:"Em nome de "+r.cliente})]));
if(D.aviso)raiz.appendChild(A.h("div",{class:"aviso",style:"margin-top:14px",text:D.aviso}));
var ac=A.h("div",{class:"acoes-v"});
if(r.status==="marcado"){ac.appendChild(A.h("a",{class:"bt",href:"/agenda/r/"+r.codigo+".ics",text:"Adicionar à minha agenda"}));
var z=A.zap(D.loja.whatsapp,"Olá! Sobre a minha marcação de "+r.servico_nome+" em "+D.bonita+".");if(z)ac.appendChild(A.h("a",{class:"bt sec",href:z,target:"_blank",rel:"noopener",text:"Falar no WhatsApp"}));
ac.appendChild(A.h("button",{type:"button",class:"bt perigo",text:"Cancelar marcação",onclick:cancelar}))}
ac.appendChild(A.h("a",{class:"bt sec",href:"/agenda/"+D.loja.slug,text:"Marcar outro horário"}));
raiz.appendChild(ac);
raiz.appendChild(A.h("div",{class:"rodape"},["Agenda feita com a Vênus · ",A.h("b",{text:"VETORIAL TECH"})]))}
function cancelar(){var f=A.folha("Cancelar esta marcação?");
f.corpo.appendChild(A.h("p",{class:"mudo",text:"O horário volta a ficar livre para outras pessoas. O prazo para cancelar aqui é de "+D.cancelamentoHoras+" h antes."}));
var erro=A.h("div",{class:"erro sumir"});f.corpo.appendChild(erro);
var sim=A.h("button",{type:"button",class:"bt perigo",text:"Sim, cancelar",onclick:function(){sim.disabled=true;A.req("POST","/agenda/r/"+D.reserva.codigo+"/cancelar",{}).then(function(){D.reserva.status="cancelado";f.fechar();ver();A.aviso("Marcação cancelada")}).catch(function(e){sim.disabled=false;erro.textContent=e.message;erro.classList.remove("sumir")})}});
f.corpo.appendChild(A.h("div",{class:"acoes"},[sim,A.h("button",{type:"button",class:"bt sec",text:"Voltar",onclick:f.fechar})]))}
ver();
`;

export const paginaDaMarcacao = ({ loja, reserva, cancelamentoHoras, aviso, bonita }) =>
  moldura(`Sua marcação · ${loja.nome}`, cssBase(temaDoCliente(loja.cor)) + CSS_PROPRIO, `<main class="tela" id="app"></main>`,
    JS_MARCACAO.replace("__DADOS__", dadosJs({ loja: { nome: loja.nome, slug: loja.slug, whatsapp: String(loja.whatsapp || "").replace(/\D/g, "") }, reserva: { ...reserva, codigo: reserva.codigo }, cancelamentoHoras, aviso: aviso || "", bonita })));

// ======================================================================================================== peças de lista de marcações (equipe e painel)
const JS_LISTA = String.raw`
/* cartão de uma marcação; "acoes" decide o que o botão faz (equipe e dono compartilham o desenho) */
A.cartaoReserva=function(r,o){var passado=false;
var topo=A.h("div",{style:"display:flex;gap:12px;align-items:flex-start"},[
A.h("div",{style:"flex:none;min-width:58px;font-weight:800;font-size:18px;border-left:4px solid "+(r.profissional_cor||"var(--cor)")+";padding-left:8px",text:A.hhmm(r.ini)},[A.h("div",{class:"mudo peq",style:"font-weight:400",text:"até "+A.hhmm(r.fim)})]),
A.h("div",{style:"flex:1;min-width:0"},[A.h("div",{style:"font-weight:700;overflow-wrap:anywhere",text:r.cliente}),A.h("div",{class:"mudo peq",text:r.servico_nome+(o.mostrarProf&&r.profissional_nome?" · "+r.profissional_nome:"")+(r.origem==="balcao"?" · balcão":"")}),r.obs?A.h("div",{class:"peq",style:"margin-top:4px",text:"“"+r.obs+"”"}):null]),
A.pilula(r.status)]);
var bts=A.h("div",{style:"display:flex;gap:8px;flex-wrap:wrap;margin-top:12px"});
var z=A.zap(r.telefone,"Olá, "+r.cliente.split(" ")[0]+"! Passando para lembrar do seu horário de "+r.servico_nome+" em "+A.DIAS[A.dow(r.data)]+", "+A.dm(r.data)+", às "+A.hhmm(r.ini)+(o.lojaNome?" ("+o.lojaNome+")":"")+(r.codigo?". Detalhes ou cancelamento: "+location.origin+"/agenda/r/"+r.codigo:"")+".");
function b(t,cl,fn){bts.appendChild(A.h("button",{type:"button",class:"bt peq "+cl,text:t,onclick:fn}))}
if(r.status==="marcado"){b("Concluir","",function(){o.status(r,"concluido")});b("Faltou","sec",function(){o.status(r,"faltou")});if(z)bts.appendChild(A.h("a",{class:"bt peq sec",href:z,target:"_blank",rel:"noopener",text:"Lembrar cliente"}));b("Cancelar","perigo",function(){o.status(r,"cancelado")})}
else{b("Reabrir","sec",function(){o.status(r,"marcado")});if(r.status==="faltou"&&z)bts.appendChild(A.h("a",{class:"bt peq sec",href:z,target:"_blank",rel:"noopener",text:"Falar com cliente"}))}
return A.h("div",{class:"cartao",style:r.status==="cancelado"?"opacity:.6":""},[topo,bts])};
A.agrupar=function(lista){var g={},ordem=[];lista.forEach(function(r){if(!g[r.data]){g[r.data]=[];ordem.push(r.data)}g[r.data].push(r)});return ordem.map(function(d){return{data:d,itens:g[d]}})};
A.rotuloDia=function(d,hoje){var x=A.DIAS_LONGOS[A.dow(d)];x=x.charAt(0).toUpperCase()+x.slice(1);var t=d===hoje?"Hoje · ":d===A.somar(hoje,1)?"Amanhã · ":"";return t+x.replace("-feira","")+", "+A.dm(d)};
`;

// ======================================================================================================== equipe
const JS_EQUIPE = String.raw`
var token=location.pathname.split("/")[3],base="/agenda/equipe/"+token;
var S={data:null,dias:1,dados:null},raiz=A.$("#app"),temporizador=null;
function carregar(silencioso){var q=base+"/dia?dias="+S.dias+(S.data?"&data="+S.data:"");
return A.req("GET",q).then(function(d){S.dados=d;if(!S.data)S.data=d.data;desenhar()}).catch(function(e){if(!silencioso){A.limpa(raiz);raiz.appendChild(A.h("div",{class:"erro",text:e.message}))}})}
function mudar(r,st){A.req("POST",base+"/reservas/"+r.id,{status:st}).then(function(){A.aviso(st==="concluido"?"Atendimento concluído":st==="cancelado"?"Marcação cancelada":st==="faltou"?"Marcada como falta":"Marcação reaberta");carregar(true)}).catch(function(e){A.aviso(e.message,true)})}
function desenhar(){var d=S.dados;A.limpa(raiz);
raiz.appendChild(A.h("div",{class:"topo"},[A.h("div",{},[A.h("h1",{text:d.escopo==="profissional"?"Agenda de "+d.nome:"Agenda da recepção"}),A.h("div",{class:"mudo peq",text:d.loja.nome})])]));
var nav=A.h("div",{style:"display:flex;gap:8px;align-items:center;margin-bottom:12px;flex-wrap:wrap"});
var passo=S.dias;
nav.appendChild(A.h("button",{type:"button",class:"bt sec peq","aria-label":"Anterior",text:"‹",onclick:function(){S.data=A.somar(S.data,-passo);carregar()}}));
nav.appendChild(A.h("button",{type:"button",class:"bt sec peq",text:"Hoje",onclick:function(){S.data=d.hoje;carregar()}}));
nav.appendChild(A.h("button",{type:"button",class:"bt sec peq","aria-label":"Próximo",text:"›",onclick:function(){S.data=A.somar(S.data,passo);carregar()}}));
nav.appendChild(A.h("strong",{style:"flex:1;text-align:center",text:S.dias===1?A.rotuloDia(S.data,d.hoje):A.dm(S.data)+" a "+A.dm(A.somar(S.data,S.dias-1))}));raiz.appendChild(nav);
var f=A.h("div",{class:"fichas",style:"margin-bottom:16px"});f.appendChild(A.ficha("Dia",S.dias===1,function(){S.dias=1;carregar()}));f.appendChild(A.ficha("Semana",S.dias===7,function(){S.dias=7;carregar()}));raiz.appendChild(f);
var ativos=d.reservas.filter(function(r){return r.status!=="cancelado"});
if(!d.reservas.length)raiz.appendChild(A.h("div",{class:"cartao mudo",text:"Nenhuma marcação neste período."}));
A.agrupar(d.reservas).forEach(function(g){raiz.appendChild(A.h("h3",{style:"margin:18px 0 8px;font-size:16px",text:A.rotuloDia(g.data,d.hoje)}));var l=A.h("div",{class:"lista"});
g.itens.forEach(function(r){l.appendChild(A.cartaoReserva(r,{mostrarProf:d.escopo==="recepcao",lojaNome:d.loja.nome,status:mudar}))});raiz.appendChild(l)});
raiz.appendChild(A.h("div",{class:"cartao",style:"margin-top:24px"},[A.h("b",{text:"Agenda no celular"}),A.h("p",{class:"mudo peq",text:"Assine este calendário no Google Agenda ou no Calendário do iPhone para ver os horários junto com seus compromissos, com lembrete 30 minutos antes."}),A.h("div",{style:"display:flex;gap:8px;flex-wrap:wrap"},[A.h("button",{type:"button",class:"bt peq",text:"Copiar link do calendário",onclick:function(){A.copiar(location.origin+base+".ics","Link do calendário copiado")}}),A.h("a",{class:"bt peq sec",href:base+".ics",text:"Baixar .ics"})])]));
raiz.appendChild(A.h("div",{class:"rodape"},["Agenda feita com a Vênus · ",A.h("b",{text:"VETORIAL TECH"})]))}
carregar();temporizador=setInterval(function(){if(!document.hidden&&!document.querySelector(".folha-fundo"))carregar(true)},60000);
`;

export const paginaDaEquipe = () =>
  moldura("Agenda da equipe", cssBase(TEMA_ESCURO) + CSS_PROPRIO, `<main class="tela" id="app"><p class="mudo">Carregando…</p></main>`, JS_LISTA + JS_EQUIPE);

// ======================================================================================================== painel do dono
const JS_PAINEL = String.raw`
var T=null,LJ="";
(function(){var hl=location.hash.match(/l=([a-f0-9]{6,16})/);if(hl)LJ=hl[1];var h=location.hash.match(/t=((?:vl_[a-f0-9]{48})|(?:eyJ[\w-]+\.[\w-]+\.[\w-]+))/);if(h){T=h[1];try{sessionStorage.setItem("ag_tk",T);sessionStorage.setItem("ag_lj",LJ)}catch(e){}history.replaceState(null,"",location.pathname)}else{try{T=sessionStorage.getItem("ag_tk");if(!hl)LJ=sessionStorage.getItem("ag_lj")||""}catch(e){}}})();
function api(m,p,b){var hd={authorization:"Bearer "+T};if(LJ)hd["x-loja"]=LJ;return A.req(m,"/loja/agenda"+p,b,hd)}
var E={aba:"agenda",e:null,dia:null,dias:1,prof:"",reservas:[]},raiz=A.$("#app"),corpo=A.$("#corpo");
var ABAS=[["agenda","Agenda"],["servicos","Serviços"],["equipe","Equipe"],["ajustes","Ajustes"]];
function tudo(){return api("GET","").then(function(e){E.e=e;if(!E.dia)E.dia=e.hoje;return carregarReservas()})}
function carregarReservas(){var de=E.dia,ate=A.somar(de,E.dias-1);return api("GET","/reservas?de="+de+"&ate="+ate+(E.prof?"&prof="+E.prof:"")).then(function(r){E.reservas=r.reservas})}
function recarregar(){return tudo().then(desenhar).catch(falha)}
function falha(e){if(e.status===401||!T){A.limpa(corpo);corpo.appendChild(A.h("div",{class:"aviso",text:"Abra a agenda de dentro da Vênus (Minha loja › Agenda de serviços) para entrar."}));return}A.aviso(e.message||"Erro",true)}
function abas(){var n=A.limpa(A.$("#abas"));ABAS.forEach(function(a){n.appendChild(A.h("button",{type:"button",class:"aba"+(E.aba===a[0]?" sel":""),role:"tab","aria-selected":E.aba===a[0]?"true":"false",text:a[1],onclick:function(){E.aba=a[0];desenhar()}}))})}
function desenhar(){abas();A.limpa(corpo);({agenda:telaAgenda,servicos:telaServicos,equipe:telaEquipe,ajustes:telaAjustes})[E.aba]();corpo.appendChild(A.h("div",{class:"rodape"},["Agenda feita com a Vênus · ",A.h("b",{text:"VETORIAL TECH"})]))}
function reais2cent(t){var s=String(t||"").replace(/[^\d,.]/g,"").replace(/\./g,"").replace(",",".");if(!s)return null;var v=Math.round(parseFloat(s)*100);return isFinite(v)?v:null}
function centavosTexto(c){return c==null?"":(c/100).toFixed(2).replace(".",",")}
function salvarEm(fn,f,ok){return fn().then(function(){f&&f.fechar();A.aviso(ok||"Salvo");return recarregar()}).catch(function(e){A.aviso(e.message||"Erro",true)})}

/* ---------------- agenda ---------------- */
function telaAgenda(){var e=E.e;
var nav=A.h("div",{style:"display:flex;gap:8px;align-items:center;margin-bottom:12px"});
nav.appendChild(A.h("button",{type:"button",class:"bt sec peq","aria-label":"Anterior",text:"‹",onclick:function(){E.dia=A.somar(E.dia,-E.dias);recarregar()}}));
nav.appendChild(A.h("button",{type:"button",class:"bt sec peq",text:"Hoje",onclick:function(){E.dia=e.hoje;recarregar()}}));
nav.appendChild(A.h("button",{type:"button",class:"bt sec peq","aria-label":"Próximo",text:"›",onclick:function(){E.dia=A.somar(E.dia,E.dias);recarregar()}}));
nav.appendChild(A.h("strong",{style:"flex:1;text-align:center",text:E.dias===1?A.rotuloDia(E.dia,e.hoje):A.dm(E.dia)+" a "+A.dm(A.somar(E.dia,E.dias-1))}));corpo.appendChild(nav);
var f=A.h("div",{class:"fichas",style:"margin-bottom:10px"});f.appendChild(A.ficha("Dia",E.dias===1,function(){E.dias=1;recarregar()}));f.appendChild(A.ficha("Semana",E.dias===7,function(){E.dias=7;recarregar()}));corpo.appendChild(f);
if(e.equipe.length>1){var fp=A.h("div",{class:"fichas",style:"margin-bottom:14px"});fp.appendChild(A.ficha("Todos",E.prof==="",function(){E.prof="";recarregar()}));e.equipe.forEach(function(p){fp.appendChild(A.ficha(p.nome,E.prof===p.id,function(){E.prof=p.id;recarregar()}))});corpo.appendChild(fp)}
var ac=A.h("div",{style:"display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px"},[A.h("button",{type:"button",class:"bt",text:"+ Marcar horário",onclick:novaMarcacao}),A.h("button",{type:"button",class:"bt sec",text:"Bloquear horário",onclick:novoBloqueio})]);corpo.appendChild(ac);
if(!e.servicos.length||!e.equipe.length){corpo.appendChild(A.h("div",{class:"aviso",text:!e.servicos.length?"Comece cadastrando os serviços (aba Serviços) e depois a equipe.":"Agora cadastre quem atende (aba Equipe) para abrir horários."}));return}
if(!E.reservas.length)corpo.appendChild(A.h("div",{class:"cartao mudo",text:"Nenhuma marcação neste período."}));
A.agrupar(E.reservas).forEach(function(g){corpo.appendChild(A.h("h3",{style:"margin:18px 0 8px;font-size:16px",text:A.rotuloDia(g.data,e.hoje)}));var l=A.h("div",{class:"lista"});
g.itens.forEach(function(r){l.appendChild(A.cartaoReserva(r,{mostrarProf:true,lojaNome:e.loja.nome,status:function(x,st){api("POST","/reservas/"+x.id,{status:st}).then(function(){A.aviso("Atualizado");recarregar()}).catch(function(er){A.aviso(er.message,true)})}}))});corpo.appendChild(l)})}
function novaMarcacao(){var e=E.e;if(!e.servicos.length||!e.equipe.length){A.aviso("Cadastre serviços e equipe primeiro",true);return}
var f=A.folha("Marcar horário");var nome=A.h("input",{type:"text",maxlength:"80"}),tel=A.h("input",{type:"tel",inputmode:"tel",placeholder:"(51) 99999-0000",oninput:function(){tel.value=A.mascaraTel(tel.value)}});
var sv=A.h("select",{},e.servicos.filter(function(s){return s.ativo}).map(function(s){return A.h("option",{value:s.id,text:s.nome+" · "+A.dur(s.duracao_min)})}));
var pf=A.h("select",{},e.equipe.filter(function(p){return p.ativo}).map(function(p){return A.h("option",{value:p.id,text:p.nome})}));if(E.prof)pf.value=E.prof;
var dt=A.h("input",{type:"date",value:E.dia}),hr=A.h("input",{type:"time",value:"09:00"});var obs=A.h("textarea",{maxlength:"200"});
[["Nome do cliente",nome],["WhatsApp (opcional)",tel],["Serviço",sv],["Profissional",pf],["Data",dt],["Horário",hr],["Recado (opcional)",obs]].forEach(function(c){f.corpo.appendChild(A.campo(c[0],c[1]))});
var ok=A.h("button",{type:"button",class:"bt",text:"Marcar",onclick:function(){ok.disabled=true;salvarEm(function(){return api("POST","/reservas",{cliente:nome.value,telefone:tel.value,servico:sv.value,profissional:pf.value,data:dt.value,ini:hr.value,obs:obs.value})},f,"Horário marcado").then(function(){ok.disabled=false})}});
f.corpo.appendChild(A.h("div",{class:"acoes"},[ok,A.h("button",{type:"button",class:"bt sec",text:"Voltar",onclick:f.fechar})]))}
function novoBloqueio(){var e=E.e;var f=A.folha("Bloquear horário");var dt=A.h("input",{type:"date",value:E.dia}),pf=A.h("select",{},[A.h("option",{value:"",text:"Todos"})].concat(e.equipe.map(function(p){return A.h("option",{value:p.id,text:p.nome})})));
var tipo="dia";var ini=A.h("input",{type:"time",value:"12:00"}),fim=A.h("input",{type:"time",value:"13:00"}),mot=A.h("input",{type:"text",maxlength:"80",placeholder:"Ex.: folga, consulta, feriado"});
var horas=A.h("div",{class:"sumir"},[A.campo("Das",ini),A.campo("Até",fim)]);var ft=A.h("div",{class:"fichas"});
function fichas(){A.limpa(ft);ft.appendChild(A.ficha("Dia todo",tipo==="dia",function(){tipo="dia";horas.classList.add("sumir");fichas()}));ft.appendChild(A.ficha("Só um período",tipo==="per",function(){tipo="per";horas.classList.remove("sumir");fichas()}))}fichas();
f.corpo.appendChild(A.campo("Data",dt));f.corpo.appendChild(A.campo("Quem",pf));f.corpo.appendChild(A.h("div",{class:"campo"},[A.h("div",{class:"rot",text:"Quanto tempo"}),ft]));f.corpo.appendChild(horas);f.corpo.appendChild(A.campo("Motivo (opcional)",mot));
f.corpo.appendChild(A.h("div",{class:"acoes"},[A.h("button",{type:"button",class:"bt",text:"Bloquear",onclick:function(){var b={data:dt.value,profissional:pf.value||null,motivo:mot.value};if(tipo==="per"){b.ini=ini.value;b.fim=fim.value}salvarEm(function(){return api("POST","/bloqueios",b)},f,"Horário bloqueado")}}),A.h("button",{type:"button",class:"bt sec",text:"Voltar",onclick:f.fechar})]))}

/* ---------------- serviços ---------------- */
function telaServicos(){var e=E.e;corpo.appendChild(A.h("div",{style:"display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;gap:10px"},[A.h("h2",{style:"font-size:20px",text:"Serviços"}),A.h("button",{type:"button",class:"bt peq",text:"+ Novo serviço",onclick:function(){editarServico(null)}})]));
if(!e.servicos.length)corpo.appendChild(A.h("div",{class:"cartao mudo",text:"Cadastre o que você oferece: corte, escova, barba, manicure… com duração e preço."}));
var l=A.h("div",{class:"lista"});e.servicos.forEach(function(s){l.appendChild(A.h("button",{type:"button",class:"opcao",style:s.ativo?"":"opacity:.55",onclick:function(){editarServico(s)}},[A.h("span",{class:"corpo"},[A.h("div",{class:"nome",text:s.nome+(s.ativo?"":" (pausado)")}),A.h("div",{class:"mudo peq",text:A.dur(s.duracao_min)+(s.descricao?" · "+s.descricao:"")})]),s.preco_centavos!=null?A.h("span",{class:"preco",text:A.reais(s.preco_centavos)}):null,A.h("span",{class:"mudo",text:"›"})]))});corpo.appendChild(l)}
function editarServico(s){var f=A.folha(s?"Editar serviço":"Novo serviço");var nome=A.h("input",{type:"text",maxlength:"80",value:s?s.nome:""}),dur=A.h("input",{type:"number",inputmode:"numeric",min:"5",max:"720",step:"5",value:s?s.duracao_min:"60"}),pr=A.h("input",{type:"text",inputmode:"decimal",placeholder:"Ex.: 80,00",value:s?centavosTexto(s.preco_centavos):""}),ds=A.h("input",{type:"text",maxlength:"200",value:s?s.descricao||"":""});var ativo=s?s.ativo:true;var fa=A.h("div",{class:"fichas"});
function fichas(){A.limpa(fa);fa.appendChild(A.ficha("Aparece para marcar",ativo,function(){ativo=true;fichas()}));fa.appendChild(A.ficha("Pausado",!ativo,function(){ativo=false;fichas()}))}fichas();
f.corpo.appendChild(A.campo("Nome",nome));f.corpo.appendChild(A.campo("Duração (minutos)",dur));f.corpo.appendChild(A.campo("Preço (R$) — opcional",pr));f.corpo.appendChild(A.campo("Descrição curta (opcional)",ds));f.corpo.appendChild(A.h("div",{class:"campo"},[A.h("div",{class:"rot",text:"Situação"}),fa]));
var ac=A.h("div",{class:"acoes"},[A.h("button",{type:"button",class:"bt",text:"Salvar",onclick:function(){salvarEm(function(){return api("POST","/servicos",{id:s?s.id:undefined,nome:nome.value,duracao_min:Number(dur.value),preco_centavos:reais2cent(pr.value),descricao:ds.value,ativo:ativo})},f)}}),A.h("button",{type:"button",class:"bt sec",text:"Voltar",onclick:f.fechar})]);
if(s)ac.appendChild(A.h("button",{type:"button",class:"bt perigo",text:"Apagar",onclick:function(){if(confirmar("Apagar "+s.nome+"? As marcações já feitas continuam na agenda."))salvarEm(function(){return api("DELETE","/servicos/"+s.id)},f,"Serviço apagado")}}));f.corpo.appendChild(ac)}
function confirmar(t){return window.confirm(t)}

/* ---------------- equipe ---------------- */
function telaEquipe(){var e=E.e;corpo.appendChild(A.h("div",{style:"display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;gap:10px"},[A.h("h2",{style:"font-size:20px",text:"Equipe"}),A.h("button",{type:"button",class:"bt peq",text:"+ Profissional",onclick:function(){editarProf(null)}})]));
corpo.appendChild(A.h("p",{class:"mudo peq",style:"margin:0 0 14px",text:"Cada profissional tem um link só dele para ver a própria agenda no celular, sem precisar de conta. A recepção tem um link com a agenda de todos."}));
if(!e.equipe.length)corpo.appendChild(A.h("div",{class:"cartao mudo",text:"Cadastre quem atende. Os horários começam de segunda a sexta, das 9h às 18h, e você ajusta depois."}));
var l=A.h("div",{class:"lista"});e.equipe.forEach(function(p){
var c=A.h("div",{class:"cartao"},[A.h("div",{style:"display:flex;gap:10px;align-items:center"},[A.h("span",{style:"width:14px;height:14px;border-radius:50%;background:"+p.cor}),A.h("div",{style:"flex:1;min-width:0"},[A.h("b",{text:p.nome+(p.ativo?"":" (inativo)")}),A.h("div",{class:"mudo peq",text:(p.funcao?p.funcao+" · ":"")+p.servicos.length+" serviço(s)"})]),A.h("button",{type:"button",class:"bt peq sec",text:"Editar",onclick:function(){editarProf(p)}})])]);
var z=A.zap("","");var msg="Olá, "+p.nome.split(" ")[0]+"! Este é o seu link da agenda do "+e.loja.nome+": "+p.link;
c.appendChild(A.h("div",{style:"display:flex;gap:8px;flex-wrap:wrap;margin-top:12px"},[A.h("button",{type:"button",class:"bt peq",text:"Copiar link",onclick:function(){A.copiar(p.link,"Link de "+p.nome+" copiado")}}),A.h("a",{class:"bt peq sec",href:"https://wa.me/?text="+encodeURIComponent(msg),target:"_blank",rel:"noopener",text:"Enviar por WhatsApp"}),A.h("button",{type:"button",class:"bt peq sec",text:"Gerar novo link",onclick:function(){if(confirmar("O link antigo de "+p.nome+" deixa de funcionar. Continuar?"))api("POST","/equipe/"+p.id+"/link",{}).then(function(r){A.copiar(r.link,"Novo link copiado");recarregar()}).catch(function(er){A.aviso(er.message,true)})}})]));l.appendChild(c)});corpo.appendChild(l)}
var CORES=["#E36BD0","#5B8DEF","#2ECC8F","#F5B93A","#E5384F","#8E6CEF","#18B7C4","#F28B50"];
function editarProf(p){var e=E.e,f=A.folha(p?"Editar profissional":"Novo profissional");var nome=A.h("input",{type:"text",maxlength:"60",value:p?p.nome:""}),fn=A.h("input",{type:"text",maxlength:"60",placeholder:"Ex.: Cabeleireira, Barbeiro",value:p?p.funcao||"":""});var cor=p?p.cor:CORES[e.equipe.length%CORES.length];var ativo=p?p.ativo:true;var sel=p?p.servicos.slice():e.servicos.map(function(s){return s.id});
var fc=A.h("div",{class:"fichas"});function pc(){A.limpa(fc);CORES.forEach(function(c){fc.appendChild(A.h("button",{type:"button","aria-label":"Cor "+c,"aria-pressed":cor===c?"true":"false",style:"width:44px;height:44px;border-radius:50%;border:3px solid "+(cor===c?"var(--texto)":"transparent")+";background:"+c+";cursor:pointer;color:#fff;font-size:20px;line-height:1",text:cor===c?"✓":"",onclick:function(){cor=c;pc()}}))})}pc();
var fs=A.h("div",{class:"fichas"});function ps(){A.limpa(fs);e.servicos.forEach(function(s){var on=sel.indexOf(s.id)>=0;fs.appendChild(A.ficha(s.nome,on,function(){if(on)sel.splice(sel.indexOf(s.id),1);else sel.push(s.id);ps()}))});if(!e.servicos.length)fs.appendChild(A.h("span",{class:"mudo peq",text:"Cadastre os serviços primeiro."}))}ps();
var fa=A.h("div",{class:"fichas"});function pa(){A.limpa(fa);fa.appendChild(A.ficha("Atendendo",ativo,function(){ativo=true;pa()}));fa.appendChild(A.ficha("Inativo",!ativo,function(){ativo=false;pa()}))}pa();
f.corpo.appendChild(A.campo("Nome",nome));f.corpo.appendChild(A.campo("Função (opcional)",fn));f.corpo.appendChild(A.h("div",{class:"campo"},[A.h("div",{class:"rot",text:"Cor na agenda"}),fc]));f.corpo.appendChild(A.h("div",{class:"campo"},[A.h("div",{class:"rot",text:"Serviços que faz"}),fs]));f.corpo.appendChild(A.h("div",{class:"campo"},[A.h("div",{class:"rot",text:"Situação"}),fa]));
/* horários da semana: até dois períodos por dia */
var base=p?p.horarios:[1,2,3,4,5].reduce(function(a,d){return a.concat([{dia:d,ini:540,fim:720},{dia:d,ini:780,fim:1080}])},[]);var campos=[];
var grade=A.h("div",{style:"display:grid;gap:8px"});
[1,2,3,4,5,6,0].forEach(function(d){var per=base.filter(function(h){return h.dia===d});var linha=A.h("div",{class:"cartao",style:"padding:10px 12px"},[A.h("div",{style:"font-weight:700;margin-bottom:6px",text:A.DIAS_LONGOS[d].replace("-feira","")})]);var par=A.h("div",{style:"display:grid;grid-template-columns:1fr;gap:8px"});var cs=[];
for(var k=0;k<2;k++){var h=per[k];var a=A.h("input",{type:"time","aria-label":"Início "+(k+1),value:h?A.hhmm(h.ini):""}),b=A.h("input",{type:"time","aria-label":"Fim "+(k+1),value:h?A.hhmm(h.fim):""});a.style.cssText="min-width:0;flex:1";b.style.cssText="min-width:0;flex:1";par.appendChild(A.h("div",{style:"display:flex;gap:8px;align-items:center"},[a,A.h("span",{class:"mudo",text:"–"}),b]));cs.push([a,b])}
linha.appendChild(par);grade.appendChild(linha);campos.push([d,cs])});
f.corpo.appendChild(A.h("div",{class:"campo"},[A.h("div",{class:"rot",text:"Horário de atendimento (deixe vazio no dia de folga)"}),grade]));
var ok=A.h("button",{type:"button",class:"bt",text:"Salvar",onclick:function(){var hs=[];campos.forEach(function(c){c[1].forEach(function(par){var i=A.lerHHMM(par[0].value),fm=A.lerHHMM(par[1].value);if(i!=null&&fm!=null&&fm>i)hs.push({dia:c[0],ini:i,fim:fm})})});salvarEm(function(){return api("POST","/equipe",{id:p?p.id:undefined,nome:nome.value,funcao:fn.value,cor:cor,ativo:ativo,servicos:sel,horarios:hs})},f)}});
var ac=A.h("div",{class:"acoes"},[ok,A.h("button",{type:"button",class:"bt sec",text:"Voltar",onclick:f.fechar})]);
if(p)ac.appendChild(A.h("button",{type:"button",class:"bt perigo",text:"Apagar",onclick:function(){if(confirmar("Apagar "+p.nome+"? O link dele deixa de funcionar."))salvarEm(function(){return api("DELETE","/equipe/"+p.id)},f,"Profissional apagado")}}));f.corpo.appendChild(ac)}

/* ---------------- ajustes e links ---------------- */
function telaAjustes(){var e=E.e,c=e.config;
var bloco=function(t,filhos){return A.h("div",{class:"cartao",style:"margin-bottom:16px"},[A.h("h3",{style:"font-size:17px;margin-bottom:10px",text:t}),].concat(filhos))};
/* links */
var lk=function(rot,url,dica,novo){var cx=A.h("div",{style:"margin-bottom:14px"},[A.h("div",{style:"font-weight:700",text:rot}),A.h("div",{class:"mudo peq",text:dica}),A.h("input",{type:"text",readonly:"readonly",value:url,style:"margin:8px 0",onfocus:function(ev){ev.target.select()}})]);
var b=A.h("div",{style:"display:flex;gap:8px;flex-wrap:wrap"},[A.h("button",{type:"button",class:"bt peq",text:"Copiar",onclick:function(){A.copiar(url)}}),A.h("a",{class:"bt peq sec",href:"https://wa.me/?text="+encodeURIComponent(rot+": "+url),target:"_blank",rel:"noopener",text:"Enviar por WhatsApp"})]);
if(novo)b.appendChild(A.h("button",{type:"button",class:"bt peq sec",text:"Gerar novo link",onclick:function(){if(confirmar("O link antigo deixa de funcionar. Continuar?"))novo()}}));cx.appendChild(b);return cx};
corpo.appendChild(bloco("Links",[lk("Link para os clientes marcarem",e.linkPublico,"Ponha na bio do Instagram, no WhatsApp e no site.",null),lk("Link da recepção",e.linkRecepcao,"Agenda de todos os profissionais. Só para quem trabalha aí.",function(){api("POST","/recepcao/link",{}).then(function(){recarregar();A.aviso("Novo link gerado")}).catch(function(er){A.aviso(er.message,true)})}),lk("Calendário de todos (.ics)",e.calendarioGeral,"Assine no Google Agenda ou no Calendário do iPhone.",null)]));
/* regras */
var st={ativa:c.ativa?1:0,passo:c.passo_min,ant:c.antecedencia_min,jan:c.janela_dias,canc:c.cancelamento_horas,intv:c.intervalo_min};
var aviso=A.h("textarea",{maxlength:"300",placeholder:"Ex.: Tolerância de 10 minutos de atraso."});aviso.value=c.aviso||"";
var ops=function(rot,chave,lista){var d=A.h("div",{class:"campo"},[A.h("div",{class:"rot",text:rot})]);var fc=A.h("div",{class:"fichas"});function p(){A.limpa(fc);lista.forEach(function(o){fc.appendChild(A.ficha(o[1],st[chave]===o[0],function(){st[chave]=o[0];p()}))})}p();d.appendChild(fc);return d};
corpo.appendChild(bloco("Regras da agenda",[ops("Agenda online","ativa",[[1,"Ligada"],[0,"Pausada"]]),ops("Intervalo entre horários","passo",[[15,"15 min"],[30,"30 min"],[45,"45 min"],[60,"1 h"]]),ops("Antecedência mínima","ant",[[0,"Nenhuma"],[60,"1 h"],[120,"2 h"],[240,"4 h"],[1440,"1 dia"]]),ops("Quantos dias à frente","jan",[[7,"7"],[15,"15"],[30,"30"],[60,"60"]]),ops("Cliente pode cancelar até","canc",[[0,"Sempre"],[2,"2 h antes"],[4,"4 h antes"],[24,"1 dia antes"]]),ops("Pausa entre atendimentos","intv",[[0,"Sem pausa"],[5,"5 min"],[10,"10 min"],[15,"15 min"]]),A.campo("Aviso na página de marcar (opcional)",aviso),A.h("button",{type:"button",class:"bt",text:"Salvar regras",onclick:function(){salvarEm(function(){return api("PUT","/config",{ativa:!!st.ativa,passo_min:st.passo,antecedencia_min:st.ant,janela_dias:st.jan,cancelamento_horas:st.canc,intervalo_min:st.intv,aviso:aviso.value})},null,"Regras salvas")}})]));
/* como os avisos funcionam */
corpo.appendChild(bloco("Como você é avisado",[A.h("p",{class:"peq",style:"margin:0 0 8px",text:"• A Vênus avisa no seu celular quando um cliente marca."}),A.h("p",{class:"peq",style:"margin:0 0 8px",text:"• Cada profissional vê o próprio dia no link dele e pode assinar o calendário no celular, com lembrete."}),A.h("p",{class:"peq mudo",style:"margin:0",text:"• Para lembrar o cliente, toque em “Lembrar cliente” na marcação: abre o WhatsApp com a mensagem pronta."})]));
/* bloqueios */
var bl=A.h("div",{class:"lista"});api("GET","/bloqueios").then(function(r){if(!r.bloqueios.length){bl.appendChild(A.h("p",{class:"mudo peq",style:"margin:0",text:"Nenhum bloqueio futuro."}));return}
r.bloqueios.forEach(function(b){var quem=b.profissional?(e.equipe.filter(function(p){return p.id===b.profissional})[0]||{}).nome||"Profissional":"Todos";bl.appendChild(A.h("div",{style:"display:flex;gap:10px;align-items:center"},[A.h("div",{style:"flex:1;min-width:0"},[A.h("b",{text:A.dataBr(b.data)+(b.ini===0&&b.fim===1440?" · dia todo":" · "+A.hhmm(b.ini)+"–"+A.hhmm(b.fim))}),A.h("div",{class:"mudo peq",text:quem+(b.motivo?" · "+b.motivo:"")})]),A.h("button",{type:"button",class:"bt peq perigo",text:"Remover",onclick:function(){api("DELETE","/bloqueios/"+b.id).then(function(){A.aviso("Bloqueio removido");recarregar()}).catch(function(er){A.aviso(er.message,true)})}})]))})}).catch(function(){});
corpo.appendChild(bloco("Folgas e bloqueios",[bl]))}
A.$("#abas").setAttribute("role","tablist");
if(!T){falha({status:401})}else{tudo().then(desenhar).catch(falha)}
setInterval(function(){if(T&&!document.hidden&&!document.querySelector(".folha-fundo")&&E.aba==="agenda"&&E.e)tudo().then(desenhar).catch(function(){})},60000);
`;

const CSS_PAINEL = `.abas{position:sticky;top:0;z-index:20;background:var(--fundo);display:flex;gap:6px;padding:10px 10px;border-bottom:1px solid var(--borda);overflow-x:auto}
.aba{flex:1 1 0;min-width:max-content;min-height:44px;padding:8px 10px;font-size:14px;border-radius:24px;border:2px solid var(--borda);background:var(--painel);cursor:pointer;font-weight:700;white-space:nowrap}
.aba.sel{border-color:var(--cor);background:color-mix(in srgb,var(--cor) 18%,var(--painel));color:var(--cor)}
`;

export const PAINEL_AGENDA = moldura("Agenda de serviços", cssBase(TEMA_ESCURO) + CSS_PROPRIO + CSS_PAINEL, `<nav class="abas" id="abas" aria-label="Seções"></nav><main class="tela" id="corpo"><p class="mudo">Carregando…</p></main>`, JS_LISTA + JS_PAINEL);
