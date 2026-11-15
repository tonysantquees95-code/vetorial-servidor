// Endereços usados pelo site. O servidor é o mesmo da Vênus.
window.VENUS = {
  api: "https://venus-servidor.tonysantquees95.workers.dev",
  precoMensal: "49,90",
  diasGratis: 7,
};
window.VENUS.entrar = (destino) => `${window.VENUS.api}/id?voltar=${encodeURIComponent(new URL(destino || "conta.html", location.href).href)}`;
window.VENUS.baixarAndroid = `${window.VENUS.api}/atualizacao?app=venus&baixar=1`;
window.VENUS.baixarWindows = `${window.VENUS.api}/atualizacao?app=windows&baixar=1`;
