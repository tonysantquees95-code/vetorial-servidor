// Painel do Vexperyon (GET /vexperyon): login de administrador e histórico das rodadas.
// A página não tem segredo nem dado: tudo vem das rotas /dev/*, depois do login.
// A prévia (repositório vexperyon, painel/montar.mjs) usa estas mesmas partes com dados de demonstração.
export const CSS = String.raw`
*{box-sizing:border-box;margin:0;padding:0}
:root{color-scheme:dark;--f:#000;--p:#0a0d14;--p2:#0e121b;--b:#22304d;--t:#eef3fb;--s:#9fb0cc;--c:#22d3ee;--v:#8b5cf6;--ok:#34d399;--av:#fbbf24;--er:#f87171}
body{background:#05070f;color:var(--t);font-family:Inter,system-ui,sans-serif}
button{font:inherit;color:inherit;cursor:pointer}
:focus-visible{outline:2px solid var(--c);outline-offset:2px}
#app{flex:1;min-height:0;container-type:size;display:flex}
.casca{flex:1;display:flex;flex-direction:column;min-width:0;min-height:0}
header{display:flex;gap:10px;align-items:center;padding:10px 14px;border-bottom:1px solid var(--b)}
header b{font-size:17px;display:block}header small{color:var(--s);font-size:12px}
.demo{margin-left:auto;border:1px solid var(--av);color:var(--av);border-radius:99px;padding:3px 9px;font-size:11px}
main{flex:1;overflow-y:auto;padding:14px;min-height:0}
nav{display:flex;gap:8px;padding:8px;border-top:1px solid var(--b);background:var(--p)}
nav button{flex:1;background:none;border:1px solid transparent;border-radius:12px;padding:6px;font-size:12px;color:var(--s);display:flex;flex-direction:column;align-items:center;gap:3px}
nav button[aria-current=page]{color:var(--t);border-color:var(--c);background:#0b2830;font-weight:700}
nav svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.cartao{background:linear-gradient(180deg,#ffffff0d,#ffffff04);border:1px solid var(--b);border-radius:16px;padding:14px;margin-bottom:12px}
h2{font-size:16px;margin-bottom:6px}p{color:var(--s);font-size:13px;line-height:1.45}
.opcoes{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0}
.chip[aria-pressed=true]{border:2px solid var(--c);background:#0b2830;font-weight:700}
.chip[aria-pressed=true]::before{content:"✓ "}.chip:disabled{opacity:.5;cursor:default}
.principal{width:100%;border:0;border-radius:14px;padding:13px;font-weight:800;color:#03121a;background:linear-gradient(90deg,var(--c),#60a5fa,#a78bfa)}
.principal:disabled{opacity:.55;cursor:default}
.segundo{width:100%;border:1px solid var(--b);background:var(--p2);border-radius:14px;padding:11px;margin-top:8px}
.passo{display:flex;gap:10px;align-items:center;width:100%;text-align:left;background:var(--p2);border:1px solid var(--b);border-radius:12px;padding:10px;margin-bottom:8px;font-size:13px}
.passo[aria-pressed=true]{border:2px solid var(--c)}
.passo span{flex:1}.passo em{font-style:normal;font-size:11px;font-weight:700;white-space:nowrap}
.passou{color:var(--ok)}.falhou{color:var(--er)}.andando{color:var(--av)}.nao{color:var(--s)}
.captura img{display:block;margin:0 auto;max-width:100%;max-height:62cqh;border-radius:12px;border:1px solid var(--b)}
.captura p{text-align:center;margin-top:6px}
.numeros{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:10px 0}
.numeros div{border:1px solid var(--b);border-radius:12px;padding:8px;text-align:center;font-size:11px;color:var(--s)}.numeros strong{display:block;font-size:22px;color:var(--t)}
textarea{width:100%;height:150px;margin-top:8px;background:var(--p2);color:var(--t);border:1px solid var(--b);border-radius:12px;padding:10px;font:12px ui-monospace,monospace}
.duas{display:grid;gap:12px;align-content:start}
.ponte{width:44px;height:44px;flex:none}
.dado{opacity:0}.rodando .dado{opacity:1;animation:vai 1.4s linear infinite}.dado+.dado{animation-delay:.7s!important}
@keyframes vai{0%{offset-distance:0%}100%{offset-distance:100%}}
.dado{offset-path:path("M104 172 C130 66 270 66 296 172")}
@media(prefers-reduced-motion:reduce){.rodando .dado{animation:none;opacity:0}}
@container (min-width:640px){
 .duas{grid-template-columns:1fr 1fr;align-items:start}
 .captura{position:sticky;top:0}
}
@container (min-width:900px){
 .casca{display:grid;grid-template-columns:200px 1fr;grid-template-rows:auto 1fr}
 header{grid-column:1/3}
 nav{flex-direction:column;justify-content:flex-start;border-top:0;border-right:1px solid var(--b)}
 nav button{flex:none;flex-direction:row;gap:10px;font-size:14px;padding:10px 12px}
 main{padding:20px}.duas{max-width:1000px}
}
@container (max-height:430px){header{padding:5px 12px}.ponte{width:30px;height:30px}nav button{flex-direction:row;justify-content:center}.captura img{max-height:80cqh}}
@container (max-width:899px){nav{order:2}main{order:1}}
[hidden]{display:none!important}
.entrar{max-width:400px;width:100%;margin:0 auto}
.entrar label{display:block;font-size:12px;color:var(--s);margin-top:10px}
.entrar input{width:100%;margin-top:4px;padding:12px;border-radius:12px;border:1px solid var(--b);background:var(--p2);color:var(--t);font:inherit}
.entrar .principal{margin-top:14px}
.erro{color:var(--er);margin-top:8px}
.sair{margin-left:auto;background:var(--p2);border:1px solid var(--b);border-radius:12px;padding:7px 12px;font-size:12px}
.demo+.sair{margin-left:0}
.rodada{margin-bottom:8px}
@container (min-width:900px){.casca.fora main{grid-column:1/3}}`;

export const CORPO = (selo = "") => `<div class="casca">
<header><svg class="ponte" viewBox="70 50 260 300" aria-hidden="true"><defs><linearGradient id="g" gradientUnits="userSpaceOnUse" x1="80" y1="80" x2="320" y2="320"><stop offset="0" stop-color="#35e0d0"/><stop offset=".5" stop-color="#3d8bff"/><stop offset="1" stop-color="#a66bff"/></linearGradient></defs>
<path d="M104 172 L200 316 L296 172" stroke="url(#g)" fill="none" stroke-width="40" stroke-linecap="round" stroke-linejoin="round"/><path d="M104 172 C130 66 270 66 296 172" stroke="url(#g)" fill="none" stroke-width="12"/><circle cx="104" cy="172" r="25" fill="#35e0d0"/><circle cx="296" cy="172" r="25" fill="#a66bff"/><path d="M200,140 Q203,173 236,176 Q203,179 200,212 Q197,179 164,176 Q197,173 200,140Z" fill="#fff"/><circle class="dado" r="13" fill="#fff"/><circle class="dado" r="13" fill="#fff"/></svg>
<div><b>Vexperyon</b><small>Seu app testado na nuvem</small></div>${selo}<button class="sair" id="sair" hidden>Sair</button></header>
<nav id="menu" aria-label="Seções" hidden></nav><main id="tela" aria-live="polite"></main>
</div>`;

// roda no navegador; a constante DEMO é definida antes (null no painel de verdade)
export const CLIENTE = String.raw`
const NOME={passou:"✓ Passou",falhou:"✕ Falhou","não testado":"Não testado"};
const CLASSE={passou:"passou",falhou:"falhou","não testado":"nao"};
const SITUACAO={success:["✓ Passou","passou"],failure:["✕ Falhou","falhou"],enviando:["● Incompleta ou enviando","andando"]};
const APPS={vindex:"Vindex",venus:"Vênus",vortex:"Vortex",velox:"Velox",vyntem:"Vyntem",voxix:"Voxix",vspace:"V-Space",drive:"Vetorial Drive",vetogoshi:"Vetogoshi"};
const ICON={inicio:["M7 5l12 7-12 7z"],rodada:["M4 4h16v16H4z","M8 12l3 3 5-6"],historico:["M4 12a8 8 0 1 0 16 0a8 8 0 1 0-16 0","M12 8v4l3 2"]};
const $=s=>document.querySelector(s);
function h(tag,props,...filhos){const e=document.createElement(tag);for(const [k,v] of Object.entries(props||{})){if(v===false||v==null)continue;if(k==="class")e.className=v;else if(k==="onclick"||k==="onsubmit")e[k]=v;else e.setAttribute(k,v===true?"":v)}for(const f of filhos.flat())if(f!=null&&f!==false)e.append(f);return e}
function guardar(onde,chave,valor){try{const g=window[onde];if(valor===undefined)return g.getItem(chave);if(valor===null)g.removeItem(chave);else g.setItem(chave,valor)}catch{return null}}
let token=DEMO?null:guardar("sessionStorage","vx.token"), dentro=!!token, aba="inicio", rodadas=[], atual=null, dados=null, sel=0, aviso="", carregando=false, vez=0, geracao=0;
const fotos=new Map();

async function pedir(caminho,opcoes={}){
 let r; try{r=await fetch(caminho,{cache:"no-store",...opcoes,headers:{"content-type":"application/json",...(token?{authorization:"Bearer "+token}:{})}})}catch{throw new Error("Sem conexão com o servidor.")}
 if(r.ok)return r;
 const d=await r.json().catch(()=>({}));
 const e=new Error((typeof d.erro==="object"&&d.erro?d.erro.mensagem:null)||d.mensagem||(typeof d.error==="string"?d.error:null)||"O servidor recusou o pedido ("+r.status+").");
 e.status=r.status;throw e}
function sessaoCaiu(e,tinhaSessao){if(tinhaSessao&&(e.status===401||e.status===403||e.status===409)){sair(false,e.message);return true}return false}
function limparFotos(){for(const p of fotos.values())p.then(u=>{if(u.startsWith("blob:"))URL.revokeObjectURL(u)},()=>{});fotos.clear()}
function arquivo(id,nome){return DEMO?Promise.resolve(DEMO.arquivos[id+"/"+nome]):pedir("/dev/vexperyon/rodadas/"+id+"/"+nome)}
function foto(id,n){const nome=String(n).padStart(2,"0")+".png",chave=id+"/"+nome;
 if(!fotos.has(chave)){const p=arquivo(id,nome).then(async r=>{if(DEMO){if(!r)throw new Error("sem captura");return r}return URL.createObjectURL(await r.blob())});fotos.set(chave,p);p.catch(()=>fotos.delete(chave))}
 return fotos.get(chave)}
async function texto(id,nome){const r=await arquivo(id,nome);if(DEMO){if(r===undefined)throw new Error("sem arquivo");return r}return r.text()}
async function abrir(r){
 const minha=++vez;atual=r;dados=null;sel=0;aviso="";limparFotos();carregando=true;desenhar();
 try{
  const tem=n=>r.arquivos.some(a=>a.nome===n);
  if(!tem("resultado.json"))throw new Error("Esta rodada não tem relatório. Ela pode estar em andamento ou ter parado antes do fim.");
  const d=JSON.parse(await texto(r.id,"resultado.json"));
  if(!Array.isArray(d.passos))throw new Error("O relatório desta rodada está em um formato inesperado.");
  d.versao=tem("versao.txt")?(await texto(r.id,"versao.txt")).trim():"";
  if(minha!==vez)return;dados=d;const i=d.passos.findIndex(p=>p.resultado==="falhou");sel=i<0?0:i;
 }catch(e){if(minha!==vez||sessaoCaiu(e,!DEMO))return;aviso=e.message}
 carregando=false;desenhar()}
async function atualizar(){
 const minha=++geracao;carregando=true;aviso="";desenhar();
 try{const d=DEMO?DEMO.lista:await(await pedir("/dev/vexperyon/rodadas")).json();
  if(minha!==geracao||!dentro)return;rodadas=Array.isArray(d.rodadas)?d.rodadas:[];
  if(rodadas.length)return abrir(rodadas[0]);atual=dados=null;carregando=false;desenhar()}
 catch(e){if(minha!==geracao||sessaoCaiu(e,!DEMO))return;carregando=false;aviso=e.message;desenhar()}}
async function sair(noServidor,motivo){
 if(noServidor&&!DEMO)pedir("/dev/sair",{method:"POST"}).catch(()=>{});
 vez++;geracao++;token=null;dentro=false;guardar("sessionStorage","vx.token",null);limparFotos();rodadas=[];atual=dados=null;aba="inicio";carregando=false;aviso=motivo||"";desenhar()}
function aparelho(){let id=guardar("localStorage","vx.aparelho");if(!id){id="vx-"+[...crypto.getRandomValues(new Uint8Array(16))].map(b=>b.toString(16).padStart(2,"0")).join("");guardar("localStorage","vx.aparelho",id)}return{id,nome:"Painel Vexperyon",plataforma:"web"}}
async function entrar(ev){
 ev.preventDefault();if(DEMO)return;
 const f=ev.target,botao=f.querySelector("button"),erro=f.querySelector(".erro");botao.disabled=true;botao.textContent="Entrando…";erro.textContent="";
 try{const d=await(await pedir("/dev/entrar",{method:"POST",body:JSON.stringify({email:f.email.value.trim(),senha:f.senha.value,dispositivo:aparelho()})})).json();
  f.senha.value="";token=d.token;dentro=true;guardar("sessionStorage","vx.token",token);aba="inicio";atualizar()}
 catch(e){erro.textContent=e.message;botao.disabled=false;botao.textContent="Entrar"}}

const nomeApp=a=>APPS[a]||a;
const quando=ms=>new Date(ms).toLocaleString("pt-BR",{timeZone:"America/Sao_Paulo",day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"});
const situacao=r=>SITUACAO[r.situacao]||SITUACAO.enviando;
function icone(nome){const ns="http://www.w3.org/2000/svg",s=document.createElementNS(ns,"svg");s.setAttribute("viewBox","0 0 24 24");for(const d of ICON[nome]){const p=document.createElementNS(ns,"path");p.setAttribute("d",d);s.append(p)}return s}
function ir(a){aba=a;desenhar();$("#tela").scrollTop=0}
function numeros(){const n=r=>dados.passos.filter(p=>p.resultado===r).length;const c=(v,t,k)=>h("div",null,h("strong",{class:k},String(v)),t);return h("div",{class:"numeros"},c(n("passou"),"passaram","passou"),c(n("falhou"),"falharam",n("falhou")?"falhou":null),c(n("não testado"),"não testados"))}
function relatorio(){return "Vexperyon: relatório da rodada "+atual.id+"\nApp: "+nomeApp(atual.app)+" "+dados.versao+" (Android virtual)\nData: "+quando(atual.criado)+" (Brasília)\nQueda detectada: "+(dados.houve_queda?"sim":"não")+". App aberto no fim: "+(dados.app_aberto_no_fim?"sim":"não")+".\n"+dados.passos.map(p=>p.n+". "+p.passo+": "+p.resultado+(p.motivo?" ("+p.motivo+")":"")).join("\n")+"\nVale só para os passos acima; não testado em aparelho real."}
function copiar(){const onde=$("#copia");const manual=()=>{const t=h("textarea",{readonly:true});t.value=relatorio();onde.replaceChildren(h("p",null,"Toque e segure para copiar:"),t)};
 try{navigator.clipboard.writeText(relatorio()).then(()=>onde.replaceChildren(h("p",{class:"passou"},"Relatório copiado.")),manual)}catch{manual()}}
const cartao=(titulo,...f)=>h("section",{class:"cartao"},h("h2",null,titulo),...f);
const atualizarBotao=()=>h("button",{class:"segundo",onclick:atualizar},"Atualizar resultados");
function telaEntrar(){return h("form",{class:"cartao entrar",onsubmit:entrar},h("h2",null,"Entrar"),h("p",null,DEMO?"Demonstração: não digite sua senha aqui. Toque no botão para ver o painel.":"Só a conta de administrador da Vetorial Tech."),
 h("label",null,"E-mail",h("input",{name:"email",type:"email",autocomplete:"username",required:!DEMO,disabled:!!DEMO,placeholder:DEMO?"desativado na demonstração":null})),
 h("label",null,"Senha",h("input",{name:"senha",type:"password",autocomplete:"current-password",required:!DEMO,disabled:!!DEMO,placeholder:DEMO?"desativada na demonstração":null})),
 h("button",DEMO?{class:"principal",type:"button",onclick:()=>{dentro=true;atualizar()}}:{class:"principal",type:"submit"},DEMO?"Ver demonstração":"Entrar"),h("p",{class:"erro",role:"alert"},aviso))}
function telaInicio(){
 const ultima=atual&&cartao(atual===rodadas[0]?"Última rodada":"Rodada aberta",h("p",null,nomeApp(atual.app)+(dados&&dados.versao?" "+dados.versao:"")+" · "+quando(atual.criado)),h("p",{class:situacao(atual)[1]},situacao(atual)[0]),dados?numeros():h("p",null,carregando?"Carregando…":aviso),dados&&h("button",{class:"segundo",onclick:()=>ir("rodada")},"Ver telas"));
 return h("div",{class:"duas"},cartao("Testes na nuvem",h("p",null,"Aqui aparecem as rodadas guardadas no servidor."),h("button",{class:"principal",disabled:true},"Testar: próxima etapa"),h("p",null,"O painel ainda não inicia testes."),atualizarBotao()),
  ultima||cartao("Resultados",h("p",{class:aviso?"erro":null},carregando?"Carregando…":aviso||"Nenhuma rodada guardada ainda.")))}
function telaRodada(){
 if(!dados)return cartao("Rodada",h("p",null,carregando?"Carregando…":aviso||"Nenhuma rodada aberta."),atualizarBotao());
 const r=atual,i=sel,p=dados.passos[i],legenda=p?"Passo "+(i+1)+": "+p.passo:"Sem passos";
 const quadro=h("p",null,"Carregando a captura…");
 const captura=h("section",{class:"captura cartao"},quadro,h("p",null,legenda+(p&&p.motivo?" · "+p.motivo:"")));
 if(p)foto(r.id,p.n).then(u=>{if(atual===r&&sel===i){const img=h("img",{src:u,alt:"Captura. "+legenda});quadro.replaceWith(img);if(rolar){rolar=false;img.decode().catch(()=>{}).then(()=>mostrar(captura))}}},e=>{if(!sessaoCaiu(e,!DEMO))quadro.textContent="Sem captura para este passo."});
 return h("div",{class:"duas"},h("section",null,h("div",{class:"cartao"},h("h2",null,nomeApp(r.app)+" "+dados.versao),h("p",null,quando(r.criado)+" · "+(dados.houve_queda?"houve queda do app":"nenhuma queda detectada")+" · "+(dados.app_aberto_no_fim?"app aberto no fim":"app fechado no fim")),h("p",null,"Sem erro nestes passos não significa app sem erros.")),
  dados.passos.map((x,j)=>h("button",{class:"passo","aria-pressed":String(sel===j),onclick:()=>escolher(j)},h("span",null,x.n+". "+x.passo),h("em",{class:CLASSE[x.resultado]||"nao"},NOME[x.resultado]||x.resultado))),
  h("button",{class:"principal",onclick:copiar},"Copiar relatório"),h("button",{class:"segundo",disabled:true},"Enviar para o Claude (PDF): próxima etapa"),h("div",{id:"copia"})),captura)}
let rolar=false;
function mostrar(el){const t=$("#tela"),a=t.getBoundingClientRect(),escala=a.height/t.offsetHeight||1;t.scrollTop+=(el.getBoundingClientRect().top-a.top)/escala-8}
function escolher(j){const t=$("#tela"),y=t.scrollTop;sel=j;rolar=$("#app").clientWidth<640;desenhar();$("#tela").scrollTop=y}
function telaHistorico(){
 if(!rodadas.length)return cartao("Histórico",h("p",{class:aviso?"erro":null},carregando?"Carregando…":aviso||"Nenhuma rodada guardada ainda."),atualizarBotao());
 return h("div",{class:"duas"},h("section",null,rodadas.map(r=>h("button",{class:"passo rodada","aria-pressed":String(atual===r),onclick:()=>{aba="rodada";abrir(r);$("#tela").scrollTop=0}},h("span",null,nomeApp(r.app)+" · "+quando(r.criado)),h("em",{class:situacao(r)[1]},situacao(r)[0])))),
  cartao("Rodadas guardadas",h("p",null,"O servidor guarda as 3 rodadas mais recentes de cada app. Toque em uma para ver as telas."),atualizarBotao()))}
function desenhar(){
 $("#menu").hidden=!dentro;$("#sair").hidden=!dentro;
 $("#menu").replaceChildren(...[["inicio","Início"],["rodada","Rodada"],["historico","Histórico"]].map(([i,n])=>h("button",{"aria-current":aba===i?"page":null,onclick:()=>ir(i)},icone(i),n)));
 $(".casca").classList.toggle("rodando",carregando);$(".casca").classList.toggle("fora",!dentro);
 $("#tela").replaceChildren(!dentro?telaEntrar():aba==="inicio"?telaInicio():aba==="rodada"?telaRodada():telaHistorico())}
$("#sair").onclick=()=>sair(true);
desenhar();if(dentro)atualizar();
`;

export function paginaDoPainel(nonce) {
  return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><meta name="theme-color" content="#05070f"><title>Vexperyon Painel</title>
<style nonce="${nonce}">${CSS}
html,body{height:100%}#app{height:100vh;height:100dvh;display:flex;container-type:size}</style></head>
<body><div id="app">${CORPO()}</div>
<script nonce="${nonce}">const DEMO=null;${CLIENTE}</script></body></html>`;
}

export function responderPainel() {
  const nonce = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));
  return new Response(paginaDoPainel(nonce), { headers: {
    "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "referrer-policy": "no-referrer", "x-frame-options": "DENY", "x-content-type-options": "nosniff",
    "content-security-policy": `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; img-src blob:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
  } });
}
