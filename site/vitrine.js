// Partes opcionais do site: só aparecem quando existem.
//  • Vídeo de demonstração: coloque "video-<app>.mp4" na pasta do site (venus, vindex, vortex, velox, voxix).
//  • Instagram: preencha VENUS.instagram em config.js.
(() => {
  document.querySelectorAll("[data-demo]").forEach((sec) => {
    const v = sec.querySelector("video");
    const arq = "video-" + sec.dataset.demo + ".mp4";
    fetch(arq, { method: "HEAD" }).then((r) => {
      if (r.ok && (r.headers.get("content-type") || "").includes("video")) { v.src = arq; sec.hidden = false; }
    }).catch(() => undefined);
  });
  const ig = window.VENUS && window.VENUS.instagram;
  if (ig) document.querySelectorAll("[data-instagram]").forEach((a) => { a.href = ig; a.hidden = false; });
})();
