// Editor do "Meu site": logo (várias opções, personalização, PNG), conteúdo do site, fotos, prévia e publicação.
// Página única, no mesmo visual escuro da Vênus; nada é montado com innerHTML (o logo entra como imagem data:).
import { cssBase, JS_COMUM, TEMA_ESCURO } from "../agenda/ui-comum.js";

const CSS = `.abas{position:sticky;top:0;z-index:20;background:var(--fundo);display:flex;gap:6px;padding:10px;border-bottom:1px solid var(--borda)}
.aba{flex:1 1 0;min-width:max-content;min-height:44px;padding:8px 10px;font-size:14px;border-radius:24px;border:2px solid var(--borda);background:var(--painel);cursor:pointer;font-weight:700;white-space:nowrap}
.aba.sel{border-color:var(--cor);background:color-mix(in srgb,var(--cor) 18%,var(--painel));color:var(--cor)}
.logos{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:14px}
.logo{position:relative;padding:10px;border:2px solid var(--borda);border-radius:16px;background:var(--painel);cursor:pointer;display:block;width:100%}
.logo img{display:block;width:100%;height:auto;border-radius:10px}
.logo.sel{border-color:var(--cor);box-shadow:0 0 0 3px color-mix(in srgb,var(--cor) 35%,transparent)}
.logo .tique{position:absolute;top:-8px;right:-8px;width:28px;height:28px;border-radius:50%;background:var(--cor);color:var(--sobre);display:none;align-items:center;justify-content:center;font-weight:800}
.logo.sel .tique{display:flex}
.grande-logo{padding:14px;background:var(--painel);border:1px solid var(--borda);border-radius:18px}.grande-logo img{display:block;width:100%;max-width:420px;margin:0 auto;border-radius:12px}
.cores{display:flex;flex-wrap:wrap;gap:12px}
.cor{width:48px;height:48px;border-radius:50%;border:3px solid transparent;cursor:pointer;padding:0;position:relative;box-shadow:inset 0 0 0 2px #0003}
.cor.sel{border-color:var(--texto)}.cor.sel::after{content:"✓";position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:20px;color:#fff;text-shadow:0 0 3px #000}
.paleta{display:flex;align-items:center;gap:10px;min-height:48px;padding:8px 14px;border-radius:24px;border:2px solid var(--borda);background:var(--painel);cursor:pointer;font-weight:600}
.paleta i{display:inline-block;width:16px;height:16px;border-radius:50%;margin-right:-4px;box-shadow:0 0 0 1px #0004}.paleta.sel{border-color:var(--cor);background:color-mix(in srgb,var(--cor) 16%,var(--painel))}.paleta.sel::after{content:"✓";font-weight:800;color:var(--cor)}
.fotos{display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:10px}.foto{position:relative;aspect-ratio:1;border-radius:12px;overflow:hidden;background:var(--painel);border:1px solid var(--borda)}.foto img{width:100%;height:100%;object-fit:cover;display:block}
.foto button{position:absolute;top:4px;right:4px;width:36px;height:36px;border-radius:50%;border:0;background:#000b;color:#fff;font-size:18px;cursor:pointer}
.vazio{display:flex;align-items:center;justify-content:center;aspect-ratio:1;border-radius:12px;border:2px dashed var(--borda);background:transparent;color:var(--suave);cursor:pointer;font-size:28px}
.previa{width:100%;height:70vh;min-height:420px;border:1px solid var(--borda);border-radius:18px;background:#fff}
.dica-topo{margin:0 0 14px}.grupo{margin-bottom:24px}.grupo>h3{font-size:17px;margin-bottom:10px}
.barra-fixa{position:fixed;left:0;right:0;bottom:0;display:flex;gap:10px;padding:10px 14px calc(10px + env(safe-area-inset-bottom));background:var(--fundo);border-top:1px solid var(--borda);z-index:25}.barra-fixa .bt{flex:1}`;

const JS = String.raw`
var T=null,LJ="";
(function(){var hl=location.hash.match(/l=([a-f0-9]{6,16})/);if(hl)LJ=hl[1];var h=location.hash.match(/t=((?:vl_[a-f0-9]{48})|(?:eyJ[\w-]+\.[\w-]+\.[\w-]+))/);if(h){T=h[1];try{sessionStorage.setItem("st_tk",T);sessionStorage.setItem("st_lj",LJ)}catch(e){}history.replaceState(null,"",location.pathname)}else{try{T=sessionStorage.getItem("st_tk");if(!hl)LJ=sessionStorage.getItem("st_lj")||""}catch(e){}}})();
function api(m,p,b){var hd={authorization:"Bearer "+T};if(LJ)hd["x-loja"]=LJ;return A.req(m,"/loja/site"+p,b,hd)}
var E={aba:"logo",s:null,logos:[],variacao:0,esc:null,carregandoLogos:false,sujo:false,previa:null},corpo=A.$("#corpo");
var ABAS=[["logo","Logo"],["site","Site"],["publicar","Publicar"]];
function falha(e){if(e.status===401||!T){A.limpa(corpo);corpo.appendChild(A.h("div",{class:"aviso",text:"Abra o editor de dentro da Vênus (Minha loja › Meu site e logo) para entrar."}));return}A.aviso(e.message||"Erro",true)}
function img(svg){return "data:image/svg+xml;charset=utf-8,"+encodeURIComponent(svg)}
function abas(){var n=A.limpa(A.$("#abas"));n.setAttribute("role","tablist");ABAS.forEach(function(a){n.appendChild(A.h("button",{type:"button",class:"aba"+(E.aba===a[0]?" sel":""),role:"tab","aria-selected":E.aba===a[0]?"true":"false",text:a[1],onclick:function(){E.aba=a[0];desenhar()}}))})}
function desenhar(){abas();A.limpa(corpo);({logo:telaLogo,site:telaSite,publicar:telaPublicar})[E.aba]();corpo.appendChild(A.h("div",{class:"rodape"},["Site feito com a Vênus · ",A.h("b",{text:"VETORIAL TECH"})]));barra()}
function barra(){var b=A.$("#barra");A.limpa(b);b.classList.toggle("sumir",!E.sujo);if(!E.sujo)return;
b.appendChild(A.h("button",{type:"button",class:"bt",text:"Salvar alterações",onclick:salvar}))}
function salvar(){var s=E.s,c=s.config;var corpoPut={nicho:c.nicho,tema:c.tema,fonte:c.fonte,cor:c.cor,slogan:c.slogan,sobre:c.sobre,endereco:c.endereco,horario:c.horario,instagram:c.instagram,secoes:c.secoes,depoimentos:c.depoimentos,logo:c.logo,publicado:c.publicado,nome:s.nome,whatsapp:s.whatsapp};
return api("PUT","",corpoPut).then(function(r){E.s=r;E.sujo=false;E.previa=null;A.aviso("Salvo");desenhar()}).catch(function(e){A.aviso(e.message||"Erro",true)})}
function mudou(){E.sujo=true;barra()}
function fichasDe(lista,atual,aoEscolher,rotulo){var f=A.h("div",{class:"fichas",role:"group","aria-label":rotulo||""});lista.forEach(function(o){f.appendChild(A.ficha(o.nome,atual===o.id,function(){aoEscolher(o.id)}))});return f}
function grupo(t,filhos,dica){return A.h("div",{class:"grupo"},[A.h("h3",{text:t}),dica?A.h("p",{class:"mudo peq",style:"margin:-4px 0 10px",text:dica}):null].concat(filhos))}

/* ---------------- logo ---------------- */
function espAtual(){return E.esc||E.s.config.logo}
function pedirLogos(zerar){if(zerar)E.variacao=0;var e=espAtual()||{};E.carregandoLogos=true;
return api("POST","/logos",{nome:(E.nomeLogo!=null?E.nomeLogo:(e.nome||E.s.nome)),subtitulo:E.subLogo!=null?E.subLogo:(e.subtitulo||""),nicho:E.s.config.nicho,paleta:E.fixaPaleta||undefined,simbolo:E.fixaSimbolo||undefined,quantidade:12,variacao:E.variacao}).then(function(r){E.logos=r.opcoes;E.carregandoLogos=false;if(E.aba==="logo")desenhar()}).catch(function(er){E.carregandoLogos=false;falha(er)})}
function escolherLogo(espec){E.esc=espec;api("POST","/logo",{espec:espec}).then(function(r){E.esc=r.espec;E.svgEsc=r.svg;if(E.aba==="logo")desenhar()}).catch(falha)}
function usarLogo(){var e=E.esc;if(!e)return;E.s.config.logo=e;E.s.logoSvg=E.svgEsc||E.s.logoSvg;mudou();A.aviso("Logo escolhido. Toque em Salvar alterações.");desenhar()}
function baixarPng(svg,nome){var im=new Image();im.onload=function(){var w=1200,h=Math.round(w*(im.naturalHeight||300)/(im.naturalWidth||1200));var c=document.createElement("canvas");c.width=w;c.height=h;c.getContext("2d").drawImage(im,0,0,w,h);c.toBlob(function(b){var a=A.h("a",{href:URL.createObjectURL(b),download:nome+".png"});document.body.appendChild(a);a.click();setTimeout(function(){document.body.removeChild(a)},500)},"image/png")};im.onerror=function(){A.aviso("Não consegui gerar a imagem",true)};im.src=img(svg)}
function baixarSvg(svg,nome){var b=new Blob([svg],{type:"image/svg+xml"});var a=A.h("a",{href:URL.createObjectURL(b),download:nome+".svg"});document.body.appendChild(a);a.click();setTimeout(function(){document.body.removeChild(a)},500)}
function telaLogo(){var s=E.s,o=s.opcoes,at=espAtual();
corpo.appendChild(A.h("p",{class:"mudo dica-topo",text:"Escolha um logo, personalize e baixe a imagem para usar no Instagram, na fachada e nas embalagens. Ele também aparece no seu site."}));
var nome=A.h("input",{type:"text",maxlength:"32",value:E.nomeLogo!=null?E.nomeLogo:(at?at.nome:s.nome),oninput:function(){E.nomeLogo=nome.value}});
var sub=A.h("input",{type:"text",maxlength:"34",placeholder:"Ex.: Cabelo & Estética",value:E.subLogo!=null?E.subLogo:(at?at.subtitulo:""),oninput:function(){E.subLogo=sub.value}});
corpo.appendChild(grupo("Seu negócio",[A.campo("Nome no logo",nome),A.campo("Frase abaixo do nome (opcional)",sub),A.h("div",{class:"campo"},[A.h("div",{class:"rot",text:"Ramo"}),fichasDe(o.nichos,s.config.nicho,function(id){s.config.nicho=id;E.fixaSimbolo=null;E.fixaPaleta=null;mudou();pedirLogos(true).then(function(){})},"Ramo")])]));
/* personalizar o escolhido */
if(at){var atual=A.h("div",{class:"grupo"},[A.h("h3",{text:"Logo escolhido"}),A.h("div",{class:"grande-logo"},[A.h("img",{src:img(E.svgEsc&&E.esc?E.svgEsc:s.logoSvg),alt:"Logo escolhido"})])]);corpo.appendChild(atual);
var pers=function(campo,lista){return function(id){var n=JSON.parse(JSON.stringify(espAtual()));n[campo]=id;if(campo==="paleta")delete n.cores;n.nome=nome.value||n.nome;n.subtitulo=sub.value;escolherLogo(n)}};
corpo.appendChild(grupo("Personalizar",[A.h("div",{class:"campo"},[A.h("div",{class:"rot",text:"Símbolo"}),fichasDe(o.simbolos,at.simbolo,pers("simbolo"),"Símbolo")]),A.h("div",{class:"campo"},[A.h("div",{class:"rot",text:"Formato"}),fichasDe(o.layouts,at.layout,pers("layout"),"Formato")]),A.h("div",{class:"campo"},[A.h("div",{class:"rot",text:"Letra"}),fichasDe(o.fontes,at.fonte,pers("fonte"),"Letra")]),A.h("div",{class:"campo"},[A.h("div",{class:"rot",text:"Cores"}),paletas(at.paleta,pers("paleta"))])]));
var svg=E.svgEsc&&E.esc?E.svgEsc:s.logoSvg;var ac=A.h("div",{style:"display:flex;gap:10px;flex-wrap:wrap;margin-bottom:26px"},[A.h("button",{type:"button",class:"bt",text:"Usar no meu site",onclick:usarLogo,disabled:!E.esc||(s.config.logo&&JSON.stringify(E.esc)===JSON.stringify(s.config.logo))}),A.h("button",{type:"button",class:"bt sec",text:"Baixar imagem (PNG)",onclick:function(){baixarPng(svg,"logo-"+s.slug)}}),A.h("button",{type:"button",class:"bt sec",text:"Baixar SVG",onclick:function(){baixarSvg(svg,"logo-"+s.slug)}})]);corpo.appendChild(ac)}
/* opções */
var g=A.h("div",{class:"grupo"},[A.h("h3",{text:at?"Outras ideias":"Escolha um logo"})]);
if(E.carregandoLogos)g.appendChild(A.h("p",{class:"mudo",text:"Criando logos…"}));
var gr=A.h("div",{class:"logos",role:"listbox","aria-label":"Opções de logo"});E.logos.forEach(function(l,i){var sel=at&&JSON.stringify(l.espec)===JSON.stringify(at);gr.appendChild(A.h("button",{type:"button",class:"logo"+(sel?" sel":""),role:"option","aria-selected":sel?"true":"false","aria-label":"Logo "+(i+1),onclick:function(){E.svgEsc=l.svg;escolherLogo(l.espec)}},[A.h("img",{src:img(l.svg),alt:""}),A.h("span",{class:"tique",text:"✓"})]))});g.appendChild(gr);
g.appendChild(A.h("div",{style:"display:flex;gap:10px;flex-wrap:wrap;margin-top:16px"},[A.h("button",{type:"button",class:"bt sec",text:"Gerar mais ideias",onclick:function(){E.variacao++;pedirLogos(false)}}),A.h("button",{type:"button",class:"bt sec",text:"Recomeçar com este nome",onclick:function(){E.fixaPaleta=null;E.fixaSimbolo=null;pedirLogos(true)}})]));corpo.appendChild(g)}
function paletas(atual,aoEscolher){var d=A.h("div",{class:"fichas",role:"group","aria-label":"Cores"});E.s.opcoes.paletas.forEach(function(p){d.appendChild(A.h("button",{type:"button",class:"paleta"+(p.id===atual?" sel":""),"aria-pressed":p.id===atual?"true":"false",onclick:function(){aoEscolher(p.id)}},[A.h("i",{style:"background:"+p.fundo}),A.h("i",{style:"background:"+p.principal}),A.h("i",{style:"background:"+p.apoio}),A.h("span",{text:p.nome})]))});return d}

/* ---------------- site ---------------- */
var CORES_SITE=["#C2185B","#E36BD0","#6D4AFF","#2F6FED","#18B7C4","#3E6B4F","#D4AF37","#F28B50","#E5384F","#1B1B1B"];
function campoTxt(rot,chave,max,dica,multi){var c=E.s.config;var e=multi?A.h("textarea",{maxlength:String(max),oninput:function(){c[chave]=e.value;mudou()}}):A.h("input",{type:"text",maxlength:String(max),oninput:function(){c[chave]=e.value;mudou()}});e.value=c[chave]||"";return A.campo(rot,e,dica)}
function telaSite(){var s=E.s,c=s.config,o=s.opcoes;
corpo.appendChild(grupo("Sobre o negócio",[
(function(){var n=A.h("input",{type:"text",maxlength:"80",oninput:function(){s.nome=n.value;mudou()}});n.value=s.nome||"";return A.campo("Nome do negócio",n)})(),
(function(){var t=A.h("input",{type:"tel",inputmode:"tel",placeholder:"(51) 99999-0000",oninput:function(){t.value=A.mascaraTel(t.value);s.whatsapp=t.value.replace(/\D/g,"");mudou()}});t.value=A.mascaraTel(s.whatsapp||"");return A.campo("WhatsApp",t,"O botão “Chamar no WhatsApp” do site usa este número.")})(),
A.h("div",{class:"campo"},[A.h("div",{class:"rot",text:"Ramo"}),fichasDe(o.nichos,c.nicho,function(id){c.nicho=id;mudou();desenhar()},"Ramo")])]));
var botIA=A.h("button",{type:"button",class:"bt sec peq",text:"Escrever para mim",onclick:function(){botIA.disabled=true;botIA.textContent="Escrevendo…";api("POST","/textos",{nicho:c.nicho,nome:s.nome,cidade:E.cidade||""}).then(function(r){c.slogan=r.slogan;c.sobre=r.sobre;mudou();A.aviso(r.origem==="ia"?"Textos prontos. Ajuste como quiser.":"Texto-modelo colocado. Ajuste como quiser.");desenhar()}).catch(function(e){botIA.disabled=false;botIA.textContent="Escrever para mim";A.aviso(e.message,true)})}});
var cid=A.h("input",{type:"text",maxlength:"60",placeholder:"Ex.: Porto Alegre",oninput:function(){E.cidade=cid.value}});cid.value=E.cidade||"";
corpo.appendChild(grupo("Textos",[campoTxt("Frase de destaque","slogan",90,"Aparece no topo do site."),campoTxt("Sobre nós","sobre",700,"Conte em poucas linhas como é o seu atendimento.",true),A.campo("Cidade (ajuda a escrever o texto)",cid),botIA,campoTxt("Endereço","endereco",160),campoTxt("Horário de funcionamento","horario",160,"Ex.: Seg a sáb, 9h às 19h"),campoTxt("Instagram","instagram",60,"Só o nome, como @studiobela.")]));
/* visual */
var ft=A.h("div",{class:"fichas"});o.temas.forEach(function(t){ft.appendChild(A.h("button",{type:"button",class:"paleta"+(c.tema===t.id?" sel":""),"aria-pressed":c.tema===t.id?"true":"false",onclick:function(){c.tema=t.id;mudou();desenhar()}},[A.h("i",{style:"background:"+t.fundo}),A.h("i",{style:"background:"+t.texto}),A.h("span",{text:t.nome})]))});
var fc=A.h("div",{class:"cores",role:"group","aria-label":"Cor de destaque"});CORES_SITE.forEach(function(x){fc.appendChild(A.h("button",{type:"button",class:"cor"+(c.cor.toUpperCase()===x?" sel":""),"aria-label":"Cor "+x,"aria-pressed":c.cor.toUpperCase()===x?"true":"false",style:"background:"+x,onclick:function(){c.cor=x;mudou();desenhar()}}))});
corpo.appendChild(grupo("Visual",[A.h("div",{class:"campo"},[A.h("div",{class:"rot",text:"Tema"}),ft]),A.h("div",{class:"campo"},[A.h("div",{class:"rot",text:"Cor de destaque"}),fc]),A.h("div",{class:"campo"},[A.h("div",{class:"rot",text:"Letra dos títulos"}),fichasDe(o.fontes,c.fonte,function(id){c.fonte=id;mudou();desenhar()},"Letra")])]));
/* seções */
var fs=A.h("div",{class:"fichas"});c.secoes.forEach(function(x){var nome=(o.secoes.filter(function(y){return y.id===x.id})[0]||{}).nome||x.id;fs.appendChild(A.ficha(nome,x.ativa,function(){x.ativa=!x.ativa;mudou();desenhar()}))});
corpo.appendChild(grupo("O que mostrar no site",[fs],"Serviços, equipe e produtos vêm do que você já cadastrou na agenda e na loja."));
/* depoimentos */
var dp=A.h("div",{class:"lista"});c.depoimentos.forEach(function(d,i){var n=A.h("input",{type:"text",maxlength:"40",placeholder:"Nome",value:d.nome,oninput:function(){d.nome=n.value;mudou()}});var t=A.h("textarea",{maxlength:"240",placeholder:"O que a cliente disse",oninput:function(){d.texto=t.value;mudou()}});t.value=d.texto;dp.appendChild(A.h("div",{class:"cartao"},[n,A.h("div",{style:"height:8px"}),t,A.h("button",{type:"button",class:"bt peq perigo",style:"margin-top:8px",text:"Remover",onclick:function(){c.depoimentos.splice(i,1);mudou();desenhar()}})]))});
if(c.depoimentos.length<6)dp.appendChild(A.h("button",{type:"button",class:"bt sec",text:"+ Adicionar depoimento",onclick:function(){c.depoimentos.push({nome:"",texto:""});mudou();desenhar()}}));
corpo.appendChild(grupo("Depoimentos",[dp],"Só coloque o que clientes realmente disseram e autorizaram."));
/* fotos */
var gf=A.h("div",{class:"fotos"});for(var n=1;n<=s.max_fotos;n++){(function(n){if(s.fotos.indexOf(n)>=0){gf.appendChild(A.h("div",{class:"foto"},[A.h("img",{src:"/s/"+s.slug+"/foto/"+n+"?v="+(E.fv||0),alt:"Foto "+n,loading:"lazy"}),A.h("button",{type:"button","aria-label":"Remover foto "+n,text:"✕",onclick:function(){api("DELETE","/foto/"+n).then(function(r){s.fotos=r.fotos;E.fv=Date.now();E.previa=null;desenhar()}).catch(falha)}})]))}})(n)}
var livre=null;for(var k=1;k<=s.max_fotos;k++){if(s.fotos.indexOf(k)<0){livre=k;break}}
var arq=A.h("input",{type:"file",accept:"image/*",multiple:"multiple",class:"sumir",onchange:function(){enviarFotos(arq.files)}});
if(livre)gf.appendChild(A.h("button",{type:"button",class:"vazio","aria-label":"Adicionar foto",text:"+",onclick:function(){arq.click()}}));
corpo.appendChild(grupo("Fotos do trabalho ("+s.fotos.length+"/"+s.max_fotos+")",[gf,arq],"As fotos são reduzidas automaticamente. Use trabalhos seus e com autorização de quem aparece."));
corpo.appendChild(A.h("button",{type:"button",class:"bt cheio",text:"Ver prévia do site",onclick:function(){E.aba="publicar";E.previa=null;desenhar()}}))}
function reduzir(arquivo){return new Promise(function(ok,nok){var im=new Image();var url=URL.createObjectURL(arquivo);im.onload=function(){var lado=1100;for(var tent=0;tent<5;tent++){var esc=Math.min(1,lado/Math.max(im.naturalWidth,im.naturalHeight));var c=document.createElement("canvas");c.width=Math.round(im.naturalWidth*esc);c.height=Math.round(im.naturalHeight*esc);c.getContext("2d").drawImage(im,0,0,c.width,c.height);
var q=0.82;var d;for(var j=0;j<5;j++){d=c.toDataURL("image/jpeg",q).split(",")[1];if(d.length<=330000)break;q-=0.12}if(d.length<=330000){URL.revokeObjectURL(url);return ok(d)}lado=Math.round(lado*0.75)}URL.revokeObjectURL(url);nok(new Error("Foto grande demais"))};im.onerror=function(){URL.revokeObjectURL(url);nok(new Error("Não consegui abrir essa foto"))};im.src=url})}
function enviarFotos(lista){var arr=Array.prototype.slice.call(lista||[]);var s=E.s;
(function proxima(){var f=arr.shift();if(!f){E.previa=null;desenhar();return}var livre=null;for(var k=1;k<=s.max_fotos;k++){if(s.fotos.indexOf(k)<0){livre=k;break}}if(!livre){A.aviso("Limite de fotos atingido",true);return desenhar()}
A.aviso("Enviando foto…");reduzir(f).then(function(d){return api("PUT","/foto/"+livre,{dados:d})}).then(function(r){s.fotos=r.fotos;E.fv=Date.now();proxima()}).catch(function(e){A.aviso(e.message||"Erro",true);desenhar()})})()}

/* ---------------- publicar ---------------- */
function telaPublicar(){var s=E.s,c=s.config;
corpo.appendChild(grupo("Seu site",[
A.h("div",{class:"cartao"},[A.h("div",{style:"display:flex;gap:10px;align-items:center;margin-bottom:10px"},[A.h("span",{class:"pilula "+(c.publicado?"concluido":"faltou"),text:c.publicado?"No ar":"Fora do ar"})]),A.h("input",{type:"text",readonly:"readonly",value:s.url,onfocus:function(ev){ev.target.select()},"aria-label":"Endereço do site"}),
A.h("div",{style:"display:flex;gap:8px;flex-wrap:wrap;margin-top:10px"},[A.h("button",{type:"button",class:"bt peq",text:"Copiar link",onclick:function(){A.copiar(s.url)}}),A.h("a",{class:"bt peq sec",href:"https://wa.me/?text="+encodeURIComponent(s.nome+": "+s.url),target:"_blank",rel:"noopener",text:"Enviar por WhatsApp"}),c.publicado?A.h("a",{class:"bt peq sec",href:s.url,target:"_blank",rel:"noopener",text:"Abrir"}):null])])]));
var ok=A.h("button",{type:"button",class:"bt cheio",text:c.publicado?"Tirar do ar":"Publicar meu site",onclick:function(){c.publicado=!c.publicado;mudou();salvar()}});if(c.publicado)ok.className="bt cheio sec";
corpo.appendChild(A.h("div",{style:"margin-bottom:24px"},[ok]));
var ag=s.agenda;corpo.appendChild(grupo("Agenda de serviços",[A.h("div",{class:"cartao"},[A.h("p",{style:"margin:0",class:"peq",text:ag.ativa?"O botão “Agendar horário” aparece no site e os serviços vão com ele.":"O botão de agendar só aparece quando a agenda está ligada, com pelo menos um serviço e um profissional com horário. Faça isso em Minha loja › Agenda de serviços."})])]));
var gp=A.h("div",{class:"grupo"},[A.h("h3",{text:"Prévia"})]);
if(E.previa===null){gp.appendChild(A.h("p",{class:"mudo",text:"Montando a prévia…"}));var cfg=s.config;api("POST","/previa",{nicho:cfg.nicho,tema:cfg.tema,fonte:cfg.fonte,cor:cfg.cor,slogan:cfg.slogan,sobre:cfg.sobre,endereco:cfg.endereco,horario:cfg.horario,instagram:cfg.instagram,secoes:cfg.secoes,depoimentos:cfg.depoimentos,logo:cfg.logo,nome:s.nome,whatsapp:s.whatsapp}).then(function(r){E.previa=r.html;if(E.aba==="publicar")desenhar()}).catch(function(e){E.previa="";falha(e)})}
else if(E.previa){var fr=A.h("iframe",{class:"previa",title:"Prévia do site",sandbox:""});fr.srcdoc=E.previa;gp.appendChild(fr)}
corpo.appendChild(gp)}

if(!T){falha({status:401})}else{api("GET","").then(function(r){E.s=r;if(r.config.logo&&!E.logos.length){E.esc=null}
if(r.novo){E.aba="logo"}desenhar();return pedirLogos(true)}).catch(falha)}
`;

export const EDITOR_DO_SITE = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex"><link rel="icon" href="data:,"><title>Meu site e logo</title><style>${cssBase(TEMA_ESCURO)}${CSS}</style></head><body><nav class="abas" id="abas" aria-label="Seções"></nav><main class="tela" id="corpo"><p class="mudo">Carregando…</p></main><div class="barra-fixa sumir" id="barra"></div><script>${JS_COMUM}\n${JS}</script></body></html>`;
