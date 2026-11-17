/* Logos animados dos apps (mesmo desenho dos apps): Velox e Voxix com a luz correndo em volta das letras. */
(function () {
  var V = "M0 0 L64 0 L110 124 L156 0 L220 0 L142 190 L78 190 Z", X1 = "M190 0 L254 0 L400 190 L336 190 Z", X2 = "M336 0 L400 0 L254 190 L190 190 Z";
  var VL = "M-6 -8 L28 26 L60 88 L92 26 L126 -8 L60 128 Z";
  var n = 0;
  function xlogo() {
    var L = 29, M = 5, C = [60, 41], P = [[L, -M], [M, -M], [M, -L], [-M, -L], [-M, -M], [-L, -M], [-L, M], [-M, M], [-M, L], [M, L], [M, M], [L, M]];
    return "M" + P.map(function (p) { return (C[0] + (p[0] + p[1]) / Math.SQRT2).toFixed(1) + " " + (C[1] + (p[0] - p[1]) / Math.SQRT2).toFixed(1); }).join(" L") + " Z";
  }
  function velox() {
    var id = "av" + (++n), ps = [X1, X2, V];
    var poly = function (a) { return ps.map(function (d) { return '<path d="' + d + '" ' + a + "/>"; }).join(""); };
    return '<svg viewBox="-14 -14 428 218" role="img" aria-label="VX"><defs><linearGradient id="' + id + 'c" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a1f26"/><stop offset=".55" stop-color="#1a0d12"/><stop offset="1" stop-color="#0a0508"/></linearGradient>' +
      '<clipPath id="' + id + 'k">' + poly("") + '</clipPath><filter id="' + id + 'g" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="2.2" result="m"/><feMerge><feMergeNode in="m"/><feMergeNode in="SourceGraphic"/></feMerge></filter>' +
      '<filter id="' + id + 'b" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="12"/></filter></defs>' +
      '<g filter="url(#' + id + 'b)" opacity=".62" fill="#ff2a48">' + poly("") + "</g>" +
      '<g transform="translate(-8 8)" fill="#ff6b81" stroke="#ff6b81" stroke-width="4" opacity=".95">' + poly("") + "</g>" +
      '<g fill="#03050c" stroke="#03050c" stroke-width="16" stroke-linejoin="miter">' + poly("") + "</g>" +
      '<g fill="url(#' + id + 'c)">' + poly("") + "</g>" +
      '<g clip-path="url(#' + id + 'k)" fill="none"><g stroke="#ff2a48" stroke-width="9">' + poly("") + '</g><g stroke="#fff" stroke-opacity=".4" stroke-width="3">' + poly("") + "</g></g>" +
      '<g filter="url(#' + id + 'g)">' + ps.map(function (d, j) { return '<path class="corre a" pathLength="100" d="' + d + '" style="animation-delay:-' + (j * 0.9).toFixed(1) + 's"/><path class="corre b" pathLength="100" d="' + d + '" style="animation-delay:-' + (1.6 + j * 0.9).toFixed(1) + 's"/>'; }).join("") + "</g></svg>";
  }
  function voxix() {
    var id = "ax" + (++n), x = xlogo(), ps = [VL, x];
    var fill = function (d, f) { return '<path d="' + d + '" fill="' + f + '" stroke="#ff2a48" stroke-width="2.6" stroke-linejoin="miter" filter="url(#' + id + 'b)"/>'; };
    var luzes = ps.map(function (d, k) {
      return [0, 1, 2].map(function (b) {
        var at = "-" + ((k * 0.8 + b * 1.2)).toFixed(1) + "s";
        return '<path class="corre fino c' + b + '" pathLength="100" d="' + d + '" style="animation-delay:' + at + '"/><path class="corre grosso c' + b + '" pathLength="100" d="' + d + '" style="animation-delay:' + at + '"/>';
      }).join("");
    }).join("");
    return '<svg viewBox="-16 -14 148 154" role="img" aria-label="Voxix"><defs><filter id="' + id + 'b" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="0" stdDeviation="2.6" flood-color="#ff2a48" flood-opacity=".85"/></filter></defs>' +
      fill(VL, "#2a0710") + fill(x, "#150409") + luzes + "</svg>";
  }
  document.querySelectorAll(".anim-velox").forEach(function (e) { e.innerHTML = velox(); });
  document.querySelectorAll(".anim-voxix").forEach(function (e) { e.innerHTML = voxix(); });
})();
