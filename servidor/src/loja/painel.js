// Painel de BI em tempo real (uma página só). O token da loja vem no #fragmento do endereço (nunca vai para o servidor
// nem para registros) e fica no navegador; os números são atualizados a cada 10 segundos.
export const PAINEL = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Painel · Vênus</title><meta name="robots" content="noindex"><style>
:root{--fundo:#070a1c;--painel:#0e1330;--texto:#f3f4ff;--suave:#8b95c0;--cor:#E36BD0;--taxa:#F5B93A;--ok:#2ECC8F;--ruim:#E5384F}
*{box-sizing:border-box}body{margin:0;background:var(--fundo);color:var(--texto);font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;padding:16px 16px 96px;max-width:980px;margin:auto}
h1{font-size:18px;letter-spacing:.2em;margin:6px 0 14px}h2{font-size:13px;color:var(--suave);letter-spacing:.15em;margin:22px 0 8px}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}.c{background:var(--painel);border:1px solid #ffffff1a;border-radius:16px;padding:14px}
.c{min-width:0}.c small{color:var(--suave);display:block;margin-bottom:4px;overflow-wrap:anywhere;line-height:1.25}.c b{font-size:20px}.ok{color:var(--ok)}.tx{color:var(--taxa)}.ruim{color:var(--ruim)}
svg{width:100%;height:auto;background:var(--painel);border-radius:16px;border:1px solid #ffffff1a}table{width:100%;border-collapse:collapse;display:block;overflow-x:auto}td,th{padding:8px 6px;text-align:left;border-bottom:1px solid #ffffff14;font-size:14px}th{color:var(--suave);font-weight:500}
.leg span{margin-right:14px;font-size:12px;color:var(--suave)}.leg i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:5px}
#estado{color:var(--suave);font-size:12px}#entrar{display:none}input,button{font:inherit;padding:12px;border-radius:12px;border:1px solid #ffffff30;background:var(--painel);color:var(--texto);width:100%;margin:6px 0}button{background:var(--cor);color:#06081a;font-weight:700;border:0}
</style></head><body><h1>VÊNUS · PAINEL</h1><div id="estado">carregando…</div>
<div id="entrar"><p>Cole o token da sua loja (Vênus → Aparência → Painel mostra o botão que já abre aqui).</p><input id="tk" placeholder="vl_…"><button id="ok">Entrar</button></div>
<div id="app" style="display:none">
<h2>FATURAMENTO · ÚLTIMOS <span id="dias">30</span> DIAS</h2><div class="cards" id="totais"></div>
<h2>BRUTO × TAXAS DAS PLATAFORMAS</h2><svg id="grafico" viewBox="0 0 600 220" role="img" aria-label="Faturamento bruto e taxas por dia"></svg>
<div class="leg"><span><i style="background:var(--cor)"></i>Bruto</span><span><i style="background:var(--taxa)"></i>Taxas</span></div>
<h2>POR CANAL</h2><table id="canais"></table>
<h2>AUDITORIA DO CATÁLOGO</h2><div class="cards" id="audit"></div><table id="problemas"></table>
</div><script>
(function(){
var T=null;try{T=localStorage.getItem("venus_token")}catch(e){}
var h=location.hash.match(/t=((?:vl_[a-f0-9]{48})|(?:eyJ[\\w-]+\\.[\\w-]+\\.[\\w-]+))/);if(h){T=h[1];try{localStorage.setItem("venus_token",T)}catch(e){}history.replaceState(null,"",location.pathname)}
var $=function(i){return document.getElementById(i)};
var R=function(c){return (c/100).toLocaleString("pt-BR",{style:"currency",currency:"BRL"})};
function el(t,txt,cls){var e=document.createElement(t);if(txt!==undefined)e.textContent=txt;if(cls)e.className=cls;return e}
function card(pai,rot,val,cls){var c=el("div",null,"c");c.appendChild(el("small",rot));c.appendChild(el("b",val,cls));pai.appendChild(c)}
function limpa(n){while(n.firstChild)n.removeChild(n.firstChild)}
function api(p){return fetch(p,{headers:{authorization:"Bearer "+T}}).then(function(r){if(r.status===401){T=null;try{localStorage.removeItem("venus_token")}catch(e){}throw new Error("token")}return r.json()})}
function grafico(serie){var s=$("grafico");limpa(s);var W=600,H=220,L=8,B=24,max=1;serie.forEach(function(d){max=Math.max(max,d.bruto,d.taxas)});
var n=serie.length,w=(W-L*2)/n;var NS="http://www.w3.org/2000/svg";
serie.forEach(function(d,i){[["bruto","#E36BD0",0],["taxas","#F5B93A",1]].forEach(function(k){var hh=(H-B-10)*d[k[0]]/max;var r=document.createElementNS(NS,"rect");r.setAttribute("x",L+i*w+k[2]*(w/2-1));r.setAttribute("y",H-B-hh);r.setAttribute("width",Math.max(1,w/2-2));r.setAttribute("height",hh);r.setAttribute("rx","2");r.setAttribute("fill",k[1]);var t=document.createElementNS(NS,"title");t.textContent=d.dia+" · "+k[0]+": "+R(d[k[0]]);r.appendChild(t);s.appendChild(r)})});
[0,Math.floor(n/2),n-1].forEach(function(i){var t=document.createElementNS(NS,"text");t.setAttribute("x",L+i*w);t.setAttribute("y",H-6);t.setAttribute("fill","#8b95c0");t.setAttribute("font-size","11");t.textContent=serie[i].dia.slice(5);s.appendChild(t)})}
function tabela(t,cab,linhas){limpa(t);var tr=el("tr");cab.forEach(function(c){tr.appendChild(el("th",c))});t.appendChild(tr);linhas.forEach(function(l){var r=el("tr");l.forEach(function(c){r.appendChild(el("td",c))});t.appendChild(r)})}
function pinta(f,a){$("dias").textContent=f.dias;var t=$("totais");limpa(t);card(t,"Bruto",R(f.totais.bruto));card(t,"Taxas",R(f.totais.taxas),"tx");card(t,"Líquido",R(f.totais.liquido),"ok");card(t,"Pedidos pagos",String(f.totais.pedidos));card(t,"A receber",R(f.totais.pendente));card(t,"Cancelado/devolvido",R(f.totais.perdido),"ruim");
grafico(f.serie);tabela($("canais"),["Canal","Bruto","Taxas","Líquido","Pedidos"],f.canais.map(function(c){return [c.nome||c.plataforma,R(c.bruto),R(c.taxas)+(c.taxas_estimadas?" (est.)":""),R(c.liquido),String(c.pedidos)]}));
var u=$("audit");limpa(u);var r=a.resumo;card(u,"Produtos",String(r.total));card(u,"Ocultos",String(r.ocultos),r.ocultos?"tx":"");card(u,"Sem preço",String(r.sem_preco),r.sem_preco?"ruim":"ok");card(u,"Sem estoque",String(r.sem_estoque));card(u,"Sem foto",String(r.sem_imagem));card(u,"Com preço",String(r.com_preco),"ok");
var linhas=[];a.escondidos_com_estoque.forEach(function(p){linhas.push(["Oculto com estoque",p.nome])});a.sem_preco.forEach(function(p){linhas.push(["Sem preço",p.nome])});tabela($("problemas"),["Atenção","Produto"],linhas.slice(0,40))}
function atualizar(){if(!T){$("app").style.display="none";$("entrar").style.display="block";$("estado").textContent="";return}
Promise.all([api("/bi/financeiro?dias=30"),api("/bi/auditoria")]).then(function(v){$("entrar").style.display="none";$("app").style.display="block";pinta(v[0],v[1]);$("estado").textContent="ao vivo · atualizado "+new Date().toLocaleTimeString("pt-BR")}).catch(function(e){$("estado").textContent=e.message==="token"?"":"sem conexão — tentando de novo…";if(e.message==="token")atualizar()})}
$("ok").onclick=function(){var v=$("tk").value.trim();if(/^(vl_[a-f0-9]{48}|eyJ[\\w-]+\\.[\\w-]+\\.[\\w-]+)$/.test(v)){T=v;try{localStorage.setItem("venus_token",T)}catch(e){}atualizar()}};
atualizar();setInterval(function(){if(!document.hidden)atualizar()},10000);
})();
</script></body></html>`;
