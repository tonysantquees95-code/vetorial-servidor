// Orbe de partículas com constelações: esfera girando, linhas entre pontos próximos e brilho que acompanha o ponteiro.
(() => {
  const c = document.getElementById("orbe");
  if (!c) return;
  const ctx = c.getContext("2d");
  const reduz = false; // a orbe sempre se move (o "reduzir animações" do Windows a deixava parada)
  const N = innerWidth < 600 ? 150 : 240;
  const pts = Array.from({ length: N }, (_, i) => {
    const y = 1 - (i / (N - 1)) * 2, r = Math.sqrt(1 - y * y), t = i * 2.399963;
    return { x: Math.cos(t) * r, y, z: Math.sin(t) * r, h: Math.random() };
  });
  let w = 0, ang = 0, mx = 0, my = 0, alvoX = 0, alvoY = 0;
  function medir() {
    const d = Math.min(devicePixelRatio || 1, 2);
    w = c.clientWidth;
    c.width = c.height = Math.round(w * d);
    ctx.setTransform(d, 0, 0, d, 0, 0);
  }
  addEventListener("resize", medir);
  addEventListener("pointermove", (e) => {
    const b = c.getBoundingClientRect();
    alvoX = ((e.clientX - b.left) / b.width - 0.5) * 0.9;
    alvoY = ((e.clientY - b.top) / b.height - 0.5) * 0.9;
  });
  medir();
  function quadro(t) {
    mx += (alvoX - mx) * 0.05; my += (alvoY - my) * 0.05;
    ang += reduz ? 0 : 0.0035;
    ctx.clearRect(0, 0, w, w);
    const R = w * 0.36, cx = w / 2, cy = w / 2;
    const g = ctx.createRadialGradient(cx, cy, R * 0.1, cx, cy, R * 1.5);
    g.addColorStop(0, "rgba(236,111,214,.28)"); g.addColorStop(.5, "rgba(122,162,255,.10)"); g.addColorStop(1, "rgba(7,9,20,0)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, w);
    const ca = Math.cos(ang + mx), sa = Math.sin(ang + mx), cb = Math.cos(my * .8 + .25), sb = Math.sin(my * .8 + .25);
    const p = pts.map((q) => {
      const x1 = q.x * ca + q.z * sa, z1 = -q.x * sa + q.z * ca;
      const y2 = q.y * cb - z1 * sb, z2 = q.y * sb + z1 * cb;
      const pulso = reduz ? 1 : 1 + Math.sin(t / 900 + q.h * 9) * 0.03;
      return { x: cx + x1 * R * pulso, y: cy + y2 * R * pulso, z: z2, h: q.h };
    });
    ctx.lineWidth = 0.7;
    for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
      const dx = p[i].x - p[j].x, dy = p[i].y - p[j].y, d2 = dx * dx + dy * dy, lim = (R * 0.2) ** 2;
      if (d2 < lim && p[i].z + p[j].z > -0.4) {
        const a = (1 - d2 / lim) * 0.35 * ((p[i].z + p[j].z + 2) / 4);
        ctx.strokeStyle = `rgba(160,170,255,${a})`;
        ctx.beginPath(); ctx.moveTo(p[i].x, p[i].y); ctx.lineTo(p[j].x, p[j].y); ctx.stroke();
      }
    }
    for (const q of p.sort((a, b) => a.z - b.z)) {
      const f = (q.z + 1) / 2;
      ctx.fillStyle = q.h > 0.5 ? `rgba(236,111,214,${0.25 + f * 0.75})` : `rgba(122,162,255,${0.25 + f * 0.75})`;
      ctx.beginPath(); ctx.arc(q.x, q.y, 0.9 + f * 2.1, 0, 6.2832); ctx.fill();
    }
    if (!reduz) requestAnimationFrame(quadro);
  }
  requestAnimationFrame(quadro);
})();
// Entrada suave das seções
(() => {
  const els = document.querySelectorAll(".rev");
  if (!("IntersectionObserver" in window)) { els.forEach((e) => e.classList.add("v")); return; }
  const o = new IntersectionObserver((l) => l.forEach((x) => { if (x.isIntersecting) { x.target.classList.add("v"); o.unobserve(x.target); } }), { threshold: 0.12 });
  els.forEach((e) => o.observe(e));
})();
