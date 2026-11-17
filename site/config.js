// Endereços usados pelo site. O servidor é o mesmo da Vênus.
window.VENUS = {
  api: "https://venus-servidor.tonysantquees95.workers.dev",
  precoMensal: "49,90",
  diasGratis: 7,
};
window.VENUS.entrar = (destino) => `${window.VENUS.api}/id?voltar=${encodeURIComponent(new URL(destino || "conta.html", location.href).href)}`;
window.VENUS.baixarAndroid = `${window.VENUS.api}/atualizacao?app=venus&baixar=1`;
window.VENUS.baixarWindows = `${window.VENUS.api}/atualizacao?app=windows&baixar=1`;
window.VENUS.baixarMac = `${window.VENUS.api}/atualizacao?app=mac&baixar=1`;
window.VENUS.web = `${window.VENUS.api}/app/`;

// Redes da Vetorial Tech. Preencha o endereço quando o Instagram existir: o link aparece sozinho em todas as páginas.
window.VENUS.instagram = "https://www.instagram.com/vetorial_tech/";
