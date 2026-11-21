// Peças comuns das páginas da agenda (visual e ajudantes). O código das páginas é JavaScript simples, sem template literal,
// para ser embutido como texto; nada é montado com innerHTML (tudo por createElement/textContent).

/** Variáveis de cor: o painel e a equipe usam o escuro da Vênus; a página do cliente usa o tema do site da loja. */
export const TEMA_ESCURO = { fundo: "#070a1c", painel: "#0e1330", texto: "#f3f4ff", suave: "#8b95c0", borda: "#ffffff1f", cor: "#E36BD0", sobre: "#06081a", titulo: "system-ui,-apple-system,'Segoe UI',Roboto,sans-serif", peso: 800, estilo: "normal", escuro: true };

export const cssBase = (t) => `:root{--fundo:${t.fundo};--painel:${t.painel};--texto:${t.texto};--suave:${t.suave};--borda:${t.borda};--cor:${t.cor};--sobre:${t.sobre};--titulo:${t.titulo};--ok:#2ECC8F;--ruim:#E5384F;--aviso:#F5B93A;color-scheme:${t.escuro ? "dark" : "light"}}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}body{margin:0;background:var(--fundo);color:var(--texto);font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;line-height:1.45;min-height:100vh}
button,input,select,textarea{font:inherit;color:inherit}
h1,h2,h3{font-family:var(--titulo);font-weight:${t.peso};font-style:${t.estilo};margin:0}
.tela{max-width:760px;margin:0 auto;padding:16px 16px 120px}
.mudo{color:var(--suave)}.peq{font-size:13px}.ok{color:var(--ok)}.ruim{color:var(--ruim)}
.bt{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:48px;padding:12px 22px;border-radius:28px;border:0;background:var(--cor);color:var(--sobre);font-weight:700;cursor:pointer;text-decoration:none;font-size:16px}
.bt.sec{background:transparent;color:var(--texto);border:1.5px solid var(--borda)}.bt.peq{min-height:40px;padding:8px 16px;font-size:14px}.bt.perigo{background:transparent;color:var(--ruim);border:1.5px solid var(--ruim)}
.bt[disabled]{opacity:.45;cursor:default}.bt.cheio{width:100%}
.cartao{background:var(--painel);border:1px solid var(--borda);border-radius:18px;padding:14px 16px}
.lista{display:grid;gap:10px}
.opcao{display:flex;align-items:center;gap:12px;width:100%;text-align:left;background:var(--painel);border:2px solid var(--borda);border-radius:16px;padding:14px 16px;cursor:pointer;min-height:56px}
.opcao .marca{flex:none;width:24px;height:24px;border-radius:50%;border:2px solid var(--borda);display:flex;align-items:center;justify-content:center;font-size:14px;line-height:1;color:transparent}
.opcao.sel{border-color:var(--cor);background:color-mix(in srgb,var(--cor) 14%,var(--painel))}
.opcao.sel .marca{background:var(--cor);border-color:var(--cor);color:var(--sobre)}
.opcao .corpo{flex:1;min-width:0}.opcao .nome{font-weight:700}.opcao .preco{font-weight:800;color:var(--cor);white-space:nowrap}
.fichas{display:flex;flex-wrap:wrap;gap:10px}
.ficha{min-height:44px;padding:9px 16px;border-radius:24px;border:2px solid var(--borda);background:var(--painel);cursor:pointer;font-weight:600}
.ficha.sel{border-color:var(--cor);background:var(--cor);color:var(--sobre)}
.ficha.sel::before{content:"✓ "}
.campo{display:grid;gap:6px;margin-bottom:14px}.campo label,.campo .rot{font-size:13px;color:var(--suave);font-weight:600}
input[type=text],input[type=tel],input[type=date],input[type=time],input[type=number],input[type=search],select,textarea{width:100%;min-height:48px;padding:12px 14px;border-radius:14px;border:1.5px solid var(--borda);background:var(--painel);outline:0}
input:focus,select:focus,textarea:focus{border-color:var(--cor)}
textarea{min-height:84px;resize:vertical}input[type=time],input[type=date]{min-width:0;max-width:100%}input[type=time]{padding-left:8px;padding-right:6px}
.aviso{padding:12px 14px;border-radius:14px;background:color-mix(in srgb,var(--aviso) 16%,transparent);border:1px solid color-mix(in srgb,var(--aviso) 45%,transparent)}
.erro{padding:12px 14px;border-radius:14px;background:color-mix(in srgb,var(--ruim) 16%,transparent);border:1px solid color-mix(in srgb,var(--ruim) 50%,transparent)}
.sucesso{padding:12px 14px;border-radius:14px;background:color-mix(in srgb,var(--ok) 16%,transparent);border:1px solid color-mix(in srgb,var(--ok) 50%,transparent)}
.rodape{text-align:center;color:var(--suave);font-size:12px;padding:26px 0}.rodape b{letter-spacing:.12em}
.sumir{display:none!important}
.folha-fundo{position:fixed;inset:0;background:#000a;display:flex;align-items:flex-end;justify-content:center;z-index:50}
.folha{background:var(--fundo);border:1px solid var(--borda);border-radius:24px 24px 0 0;width:100%;max-width:560px;max-height:92vh;overflow:auto;padding:18px 18px 28px}
@media(min-width:700px){.folha-fundo{align-items:center}.folha{border-radius:24px}}
.folha h2{font-size:20px;margin-bottom:14px}.folha .acoes{display:flex;gap:10px;flex-wrap:wrap;margin-top:8px}
.aviso-flutuante{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:var(--painel);border:1px solid var(--borda);border-radius:24px;padding:12px 20px;z-index:60;max-width:90vw;box-shadow:0 8px 30px #0006}
.pilula{display:inline-block;padding:3px 10px;border-radius:20px;font-size:12px;font-weight:700;border:1px solid var(--borda)}
.pilula.marcado{color:var(--cor);border-color:var(--cor)}.pilula.concluido{color:var(--ok);border-color:var(--ok)}.pilula.faltou{color:var(--aviso);border-color:var(--aviso)}.pilula.cancelado{color:var(--ruim);border-color:var(--ruim)}`;

/** Ajudantes de JavaScript para as páginas (sem dependências). Variável global `A`. */
export const JS_COMUM = String.raw`
var A={};
A.$=function(s,r){return (r||document).querySelector(s)};
A.h=function(tag,props,kids){var e=document.createElement(tag);var p=props||{};for(var k in p){var v=p[k];if(v==null||v===false)continue;if(k==="class")e.className=v;else if(k==="text")e.textContent=v;else if(k==="value")e.value=v;else if(k.slice(0,2)==="on")e.addEventListener(k.slice(2),v);else if(k==="style")e.style.cssText=v;else e.setAttribute(k,v===true?"":v)}
(kids||[]).forEach(function(c){if(c==null||c===false)return;e.appendChild(typeof c==="string"?document.createTextNode(c):c)});return e};
A.limpa=function(n){while(n.firstChild)n.removeChild(n.firstChild);return n};
A.pad=function(n){return (n<10?"0":"")+n};
A.hhmm=function(m){return A.pad(Math.floor(m/60))+":"+A.pad(m%60)};
A.lerHHMM=function(t){var m=/^(\d{1,2}):(\d{2})$/.exec(String(t||"").trim());if(!m)return null;var v=+m[1]*60+ +m[2];return +m[2]<60&&v>=0&&v<=1440?v:null};
A.reais=function(c){return (c/100).toLocaleString("pt-BR",{style:"currency",currency:"BRL"})};
A.dur=function(m){return m<60?m+" min":Math.floor(m/60)+" h"+(m%60?" "+(m%60)+" min":"")};
A.DIAS=["dom","seg","ter","qua","qui","sex","sáb"];
A.DIAS_LONGOS=["domingo","segunda-feira","terça-feira","quarta-feira","quinta-feira","sexta-feira","sábado"];
A.utc=function(d){return new Date(d+"T00:00:00Z")};
A.somar=function(d,n){var x=A.utc(d);x.setUTCDate(x.getUTCDate()+n);return x.toISOString().slice(0,10)};
A.dow=function(d){return A.utc(d).getUTCDay()};
A.dm=function(d){return d.slice(8,10)+"/"+d.slice(5,7)};
A.dataBr=function(d){return A.DIAS[A.dow(d)]+", "+A.dm(d)};
A.zap=function(tel,msg){var n=String(tel||"").replace(/\D/g,"");if(n.length<10)return null;if(n.length<=11)n="55"+n;return "https://wa.me/"+n+"?text="+encodeURIComponent(msg)};
A.mascaraTel=function(v){var n=String(v).replace(/\D/g,"").slice(0,11);if(n.length>10)return "("+n.slice(0,2)+") "+n.slice(2,7)+"-"+n.slice(7);if(n.length>6)return "("+n.slice(0,2)+") "+n.slice(2,6)+"-"+n.slice(6);if(n.length>2)return "("+n.slice(0,2)+") "+n.slice(2);return n};
A.req=function(metodo,url,corpo,cab){var o={method:metodo,headers:cab||{}};if(corpo!==undefined&&corpo!==null){o.headers["content-type"]="application/json";o.body=JSON.stringify(corpo)}
return fetch(url,o).then(function(r){return r.json().catch(function(){return {}}).then(function(j){if(!r.ok){var e=new Error(j.error||("Erro "+r.status));e.status=r.status;throw e}return j})})};
A.aviso=function(txt,erro){var e=A.h("div",{class:"aviso-flutuante",role:"status",text:txt,style:erro?"border-color:var(--ruim)":""});document.body.appendChild(e);setTimeout(function(){if(e.parentNode)e.parentNode.removeChild(e)},3200)};
A.copiar=function(txt,ok){var fim=function(){A.aviso(ok||"Link copiado")};if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(txt).then(fim,function(){A.copiarVelho(txt,fim)})}else A.copiarVelho(txt,fim)};
A.copiarVelho=function(txt,fim){var t=A.h("textarea",{style:"position:fixed;opacity:0"});t.value=txt;document.body.appendChild(t);t.select();try{document.execCommand("copy")}catch(e){}document.body.removeChild(t);fim()};
/* folha de baixo (cadastro/edição): devolve {corpo, fechar}; Esc e toque no fundo fecham */
A.folha=function(titulo){var fundo=A.h("div",{class:"folha-fundo"});var corpo=A.h("div",{class:"folha",role:"dialog","aria-modal":"true","aria-label":titulo});
var fechar=function(){if(fundo.parentNode)fundo.parentNode.removeChild(fundo);document.removeEventListener("keydown",tecla)};
var tecla=function(e){if(e.key==="Escape")fechar()};document.addEventListener("keydown",tecla);
fundo.addEventListener("click",function(e){if(e.target===fundo)fechar()});corpo.appendChild(A.h("h2",{text:titulo}));fundo.appendChild(corpo);document.body.appendChild(fundo);return {corpo:corpo,fechar:fechar}};
A.campo=function(rotulo,entrada,dica){var id="c"+Math.random().toString(36).slice(2,8);entrada.id=id;return A.h("div",{class:"campo"},[A.h("label",{for:id,text:rotulo}),entrada,dica?A.h("div",{class:"mudo peq",text:dica}):null])};
A.ficha=function(texto,sel,aoTocar){return A.h("button",{type:"button",class:"ficha"+(sel?" sel":""),"aria-pressed":sel?"true":"false",text:texto,onclick:aoTocar})};
A.status={marcado:"Marcado",concluido:"Concluído",faltou:"Faltou",cancelado:"Cancelado"};
A.pilula=function(s){return A.h("span",{class:"pilula "+s,text:A.status[s]||s})};
`;
