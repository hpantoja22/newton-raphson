'use strict';
(function () {
  const $ = (id) => document.getElementById(id);
  const NS = 'http://www.w3.org/2000/svg';
  // Geometría del área de dibujo (coincide con el clipPath del HTML)
  const W = 640, PL = 48, PT = 14, PW = 578, PH = 356;
  const SUBS = '₀₁₂₃₄₅₆₇₈₉';
  const sub = (n) => String(n).split('').map((d) => SUBS[+d]).join('');
  const MAXIT = 12;
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const FUNCS = [
    { label: 'f(x) = x² − 2', f: (x) => x * x - 2, df: (x) => 2 * x,
      view: { xmin: -1, xmax: 4, ymin: -3, ymax: 8 }, x0: 3,
      nota: 'Raíz positiva: √2. Con x₀ = 0 la derivada vale 0 y el método no puede avanzar.' },
    { label: 'f(x) = x³ − x − 2', f: (x) => x * x * x - x - 2, df: (x) => 3 * x * x - 1,
      view: { xmin: -3, xmax: 4, ymin: -6, ymax: 10 }, x0: 2,
      nota: 'Tiene una sola raíz real, cerca de 1.52.' },
    { label: 'f(x) = cos(x) − x', f: (x) => Math.cos(x) - x, df: (x) => -Math.sin(x) - 1,
      view: { xmin: -2, xmax: 4, ymin: -4, ymax: 2 }, x0: 0.5,
      nota: 'Ecuación cos(x) = x, que no se puede resolver con álgebra simple.' },
    { label: 'f(x) = eˣ − 3', f: (x) => Math.exp(x) - 3, df: (x) => Math.exp(x),
      view: { xmin: -2, xmax: 3, ymin: -4, ymax: 12 }, x0: 2,
      nota: 'La raíz es ln(3). Si x₀ es muy negativo, la tangente es casi horizontal y el primer salto es enorme.' },
    { label: 'f(x) = x³ − 2x + 2', f: (x) => x * x * x - 2 * x + 2, df: (x) => 3 * x * x - 2,
      view: { xmin: -3, xmax: 3, ymin: -6, ymax: 8 }, x0: 0,
      nota: 'Caso especial: con x₀ = 0 la sucesión oscila entre 0 y 1 y nunca converge.' }
  ];

  // ---------- Cálculo ----------
  function newton(fd, x0, maxIter) {
    const rows = [];
    let x = x0, status = 'max';
    for (let n = 0; n < maxIter; n++) {
      const fx = fd.f(x), d = fd.df(x);
      if (Math.abs(d) < 1e-12) { status = 'derivada'; break; }
      const xn = x - fx / d;
      const dx = Math.abs(xn - x);
      rows.push({ n, x, fx, d, xn, dx });
      x = xn;
      if (!isFinite(xn) || Math.abs(xn) > 1e6) { status = 'diverge'; break; }
      if (Math.abs(fd.f(xn)) < 1e-13 || dx < 1e-13) { status = 'converge'; break; }
    }
    return { rows, status, last: x };
  }
  const fmt = (v) => {
    if (!isFinite(v)) return '∞';
    if (v !== 0 && Math.abs(v) < 1e-4) return v.toExponential(3);
    return v.toFixed(6);
  };
  const fmtE = (v) => (v === 0 ? '0' : v.toExponential(2));
  const fmtn = (v) => String(Number(v.toFixed(6)));

  // ---------- Elementos ----------
  const svg = $('lienzo'), est = $('capaEst'), dyn = $('capaDin');
  const selF = $('funcion'), sl = $('x0'), slVal = $('x0Val');
  const vel = $('vel'), velVal = $('velVal');
  const btnPlay = $('btnPlay'), btnPaso = $('btnPaso'), btnReset = $('btnReset');
  const estado = $('estado'), desc = $('svgD'), tbody = document.querySelector('#tabla tbody');

  function S(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function H(tag, text, parent, cls) {
    const e = document.createElement(tag);
    if (text != null) e.textContent = text;
    if (cls) e.className = cls;
    if (parent) parent.appendChild(e);
    return e;
  }

  // ---------- Estado ----------
  let fd = FUNCS[0], v = fd.view, x0 = fd.x0;
  let sim, root = null;
  let p = 0, target = 0, playing = false, shown = -1;
  let raf = 0, last = 0, acc = 0, speed = 0.6;

  const clampPx = (z) => Math.max(-5000, Math.min(5000, z));
  const X = (x) => clampPx(PL + ((x - v.xmin) / (v.xmax - v.xmin)) * PW);
  const Y = (y) => clampPx(PT + ((v.ymax - y) / (v.ymax - v.ymin)) * PH);

  function ticks(min, max) {
    const r = max - min, s = r <= 8 ? 1 : r <= 16 ? 2 : 5, a = [];
    for (let t = Math.ceil(min / s) * s; t <= max + 1e-9; t += s) a.push(Math.round(t * 100) / 100);
    return a;
  }

  function drawStatic() {
    est.replaceChildren();
    v = fd.view;
    ticks(v.xmin, v.xmax).forEach((t) => {
      S('line', { x1: X(t), y1: PT, x2: X(t), y2: PT + PH, class: 'grid' }, est);
      S('text', { x: X(t), y: PT + PH + 17, 'text-anchor': 'middle', class: 'tick' }, est).textContent = t;
    });
    ticks(v.ymin, v.ymax).forEach((t) => {
      S('line', { x1: PL, y1: Y(t), x2: PL + PW, y2: Y(t), class: 'grid' }, est);
      S('text', { x: PL - 6, y: Y(t) + 4, 'text-anchor': 'end', class: 'tick' }, est).textContent = t;
    });
    S('rect', { x: PL, y: PT, width: PW, height: PH, class: 'marco' }, est);
    if (v.xmin < 0 && v.xmax > 0) S('line', { x1: X(0), y1: PT, x2: X(0), y2: PT + PH, class: 'eje' }, est);
    if (v.ymin < 0 && v.ymax > 0) S('line', { x1: PL, y1: Y(0), x2: PL + PW, y2: Y(0), class: 'eje' }, est);
    S('text', { x: PL + PW - 12, y: Y(0) - 6, class: 'nombre' }, est).textContent = 'x';
    S('text', { x: X(0) + 8, y: PT + 14, class: 'nombre' }, est).textContent = 'y';
    const g = S('g', { 'clip-path': 'url(#clipPlot)' }, est);
    let d = '', pen = false;
    for (let i = 0; i <= 500; i++) {
      const x = v.xmin + ((v.xmax - v.xmin) * i) / 500, y = fd.f(x);
      if (!isFinite(y)) { pen = false; continue; }
      d += (pen ? 'L' : 'M') + X(x).toFixed(1) + ' ' + Y(y).toFixed(1);
      pen = true;
    }
    S('path', { d, class: 'curva' }, g);
  }

  function draw() {
    dyn.replaceChildren();
    const rows = sim.rows, total = rows.length, y0 = Y(0);
    const i = Math.min(Math.floor(p + 1e-9), total);
    const fr = i < total ? Math.max(0, p - i) : 0;
    const line = (x1, y1, x2, y2, c) => S('line', { x1, y1, x2, y2, class: c }, dyn);
    const dot = (x, y, c, r) => S('circle', { cx: X(x), cy: Y(y), r: r || 5.5, class: c }, dyn);
    const xs = [x0].concat(rows.map((r) => r.xn));

    for (let j = 0; j < i; j++) {
      const r = rows[j];
      line(X(r.x), Y(r.fx), X(r.xn), y0, 'pasada');
      line(X(r.xn), y0, X(r.xn), Y(fd.f(r.xn)), 'guia');
    }
    for (let k = 0; k <= i; k++) {
      dot(xs[k], 0, 'pt-eje', 4.5);
      if (k <= 3 || k === i) {
        S('text', { x: X(xs[k]), y: y0 + 18, 'text-anchor': 'middle', class: 'etq' }, dyn).textContent = 'x' + sub(k);
      }
    }
    if (i < total) {
      const r = rows[i];
      const s = Math.min(fr / 0.6, 1);
      const xe = r.x + (r.xn - r.x) * s, ye = r.fx + r.d * (xe - r.x);
      line(X(r.x), Y(r.fx), X(xe), Y(ye), 'tan');
      if (fr > 0.6) {
        const t = (fr - 0.6) / 0.4;
        line(X(r.xn), y0, X(r.xn), Y(fd.f(r.xn) * t), 'guia');
      }
      if (fr >= 0.6) dot(r.xn, 0, 'pt-sig', 5);
      dot(r.x, r.fx, 'pt-curva');
    } else {
      const xl = xs[total];
      if (sim.status === 'derivada') line(PL, Y(fd.f(xl)), PL + PW, Y(fd.f(xl)), 'tan');
      dot(xl, fd.f(xl), 'pt-curva');
    }
  }

  function renderRows(body, rows, c, r) {
    body.replaceChildren();
    rows.slice(0, c).forEach((row, idx) => {
      const tr = H('tr', null, body, idx === c - 1 && body === tbody ? 'ult' : '');
      H('th', row.n, tr).setAttribute('scope', 'row');
      [fmt(row.x), fmt(row.fx), fmt(row.d), fmt(row.xn), fmtE(row.dx),
        r == null ? '—' : fmtE(Math.abs(row.xn - r))].forEach((t) => H('td', t, tr));
    });
  }

  function finalMsg() {
    switch (sim.status) {
      case 'converge': return ' La sucesión converge a r ≈ ' + fmt(root) + '.';
      case 'derivada': return ' Aquí f′(x) = 0: la tangente es horizontal y no corta el eje x, el método se detiene.';
      case 'diverge': return ' La sucesión se aleja sin control: x₀ no es buena para esta función.';
      default: return ' Tras ' + MAXIT + ' iteraciones no converge: puede estar oscilando en un ciclo.';
    }
  }
  function describe(c) {
    const total = sim.rows.length;
    let t;
    if (c === 0) {
      t = 'Inicio: x₀ = ' + fmt(x0) + ', f(x₀) = ' + fmt(fd.f(x0)) + '.';
      t += total === 0 ? finalMsg() : ' Pulsa «Paso» o «Reproducir».';
      return t;
    }
    const r = sim.rows[c - 1], a = sub(r.n), b = sub(r.n + 1);
    t = 'Iteración ' + c + ': x' + a + ' = ' + fmt(r.x) + ', f(x' + a + ') = ' + fmt(r.fx) +
      ', f′(x' + a + ') = ' + fmt(r.d) + '. La tangente corta el eje x en x' + b + ' = ' + fmt(r.xn) + '.';
    if (c === total) t += finalMsg();
    return t;
  }

  function refresh() {
    draw();
    const c = Math.min(sim.rows.length, Math.floor(p + 1e-9));
    if (c !== shown) {
      shown = c;
      if (c === 0) {
        tbody.replaceChildren();
        const tr = H('tr', null, tbody);
        const td = H('td', 'Aún no hay iteraciones calculadas.', tr, 'vacio');
        td.setAttribute('colspan', '7');
      } else renderRows(tbody, sim.rows, c, root);
      const t = describe(c);
      estado.textContent = t;
      desc.textContent = t;
    }
    btnPlay.textContent = playing ? '⏸ Pausar' : '▶ Reproducir';
  }

  function setup() {
    sim = newton(fd, x0, MAXIT);
    const ref = newton(fd, x0, 100);
    root = ref.status === 'converge' ? ref.last : null;
    p = 0; target = 0; playing = false; shown = -1;
    slVal.textContent = x0.toFixed(1);
    refresh();
  }

  // ---------- Animación ----------
  function tick(ts) {
    const dt = Math.min(0.1, (ts - last) / 1000);
    last = ts;
    if (p < target - 1e-9) {
      if (reduce) {
        acc += dt * speed;
        if (acc >= 1) { acc = 0; p = Math.min(target, Math.floor(p + 1e-9) + 1); }
      } else p = Math.min(target, p + dt * speed);
      if (p >= target - 1e-9) { p = target; playing = false; }
      refresh();
    }
    if (p < target - 1e-9) raf = requestAnimationFrame(tick);
    else { raf = 0; playing = false; refresh(); }
  }
  function kick() {
    if (!raf) { last = performance.now(); raf = requestAnimationFrame(tick); }
  }
  function play() {
    const total = sim.rows.length;
    if (playing) { playing = false; target = p; refresh(); return; }
    if (total === 0) { refresh(); return; }
    if (p >= total - 1e-9) { p = 0; shown = -1; }
    target = total; playing = true; acc = 0;
    refresh(); kick();
  }
  function step() {
    const total = sim.rows.length;
    playing = false;
    if (total === 0 || p >= total - 1e-9) { refresh(); return; }
    target = Math.min(total, Math.floor(p + 1e-9) + 1);
    acc = 0; refresh(); kick();
  }

  // ---------- Eventos ----------
  FUNCS.forEach((f, i) => {
    const o = H('option', f.label, selF); o.value = i;
  });
  function loadFunc(i, xInit) {
    fd = FUNCS[i]; v = fd.view;
    selF.value = i;
    sl.min = v.xmin; sl.max = v.xmax;
    x0 = xInit != null ? xInit : fd.x0;
    sl.value = x0;
    $('nota').textContent = fd.nota;
    drawStatic();
    setup();
  }
  selF.addEventListener('change', () => loadFunc(+selF.value));
  sl.addEventListener('input', () => { x0 = Math.round(Number(sl.value) * 10) / 10; setup(); });
  vel.addEventListener('input', () => { speed = Number(vel.value); velVal.textContent = speed.toFixed(1) + ' it/s'; });
  btnPlay.addEventListener('click', play);
  btnPaso.addEventListener('click', step);
  btnReset.addEventListener('click', () => {
    playing = false; p = 0; target = 0; shown = -1; refresh();
  });
  svg.addEventListener('click', (e) => {
    const rc = svg.getBoundingClientRect();
    const px = ((e.clientX - rc.left) / rc.width) * W;
    let x = v.xmin + ((px - PL) / PW) * (v.xmax - v.xmin);
    x = Math.max(v.xmin, Math.min(v.xmax, Math.round(x * 10) / 10));
    x0 = x; sl.value = x; setup();
  });

  // ---------- Ejemplo resuelto ----------
  function buildExample() {
    const box = $('ejemplo');
    const f0 = FUNCS[0], s = newton(f0, 1, 4);
    H('p', 'Calculemos √2 resolviendo f(x) = x² − 2 = 0 con x₀ = 1. La derivada es f′(x) = 2x, así que la fórmula queda xₙ₊₁ = xₙ − (xₙ² − 2) / (2xₙ).', box);
    const ol = H('ol', null, box);
    s.rows.slice(0, 3).forEach((r) => {
      H('li', 'x' + sub(r.n + 1) + ' = ' + fmtn(r.x) + ' − (' + fmtn(r.fx) + ') / ' + fmtn(r.d) + ' = ' + fmtn(r.xn), ol);
    });
    H('p', 'Comparamos con el valor de referencia √2 ≈ ' + Math.SQRT2.toFixed(10) + ' (calculado con Math.SQRT2). El error absoluto cae muy rápido: casi se duplican las cifras correctas en cada paso.', box);
    const wrap = H('div', null, box, 'tabla-wrap');
    wrap.tabIndex = 0;
    wrap.setAttribute('role', 'region');
    wrap.setAttribute('aria-label', 'Tabla del ejemplo resuelto');
    const t = H('table', null, wrap);
    H('caption', 'Ejemplo: f(x) = x² − 2, x₀ = 1', t);
    const hr = H('tr', null, H('thead', null, t));
    ['n', 'xₙ', 'f(xₙ)', "f′(xₙ)", 'xₙ₊₁', '|xₙ₊₁ − xₙ|', 'Error |xₙ₊₁ − √2|'].forEach((h) => {
      H('th', h, hr).setAttribute('scope', 'col');
    });
    renderRows(H('tbody', null, t), s.rows, s.rows.length, Math.SQRT2);
    const b = H('button', 'Probar este ejemplo en la animación', box, 'sec');
    b.type = 'button';
    b.addEventListener('click', () => {
      loadFunc(0, 1);
      $('lienzo').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
    });
  }

  // ---------- Verificación ----------
  const QS = [
    { fi: 0, xs: [1, 2, 3] }, { fi: 1, xs: [1, 2, 3] },
    { fi: 2, xs: [0, 0.5, 1] }, { fi: 3, xs: [0, 1, 2] }
  ];
  let q = null;
  function newQuestion() {
    const c = QS[Math.floor(Math.random() * QS.length)];
    const x = c.xs[Math.floor(Math.random() * c.xs.length)];
    const r = newton(FUNCS[c.fi], x, 1).rows[0];
    q = { fi: c.fi, x0: x, row: r };
    $('enunciado').textContent = 'Para ' + FUNCS[c.fi].label + ' con x₀ = ' + x +
      ', calcula x₁ con el método de Newton-Raphson (redondea a 3 decimales).';
    $('resp').value = '';
    const fb = $('fbNum'); fb.textContent = ''; fb.className = 'fb';
  }
  function feedback(el, ok, msg) { el.textContent = msg; el.className = 'fb ' + (ok ? 'ok' : 'mal'); }

  $('formNum').addEventListener('submit', (e) => {
    e.preventDefault();
    const fb = $('fbNum'), raw = $('resp').value.trim().replace(',', '.');
    const val = raw === '' ? NaN : Number(raw);
    if (!isFinite(val)) { feedback(fb, false, 'Escribe un número válido (por ejemplo 1.5).'); return; }
    if (Math.abs(val - q.row.xn) <= 0.0015) {
      feedback(fb, true, '¡Correcto! x₁ ≈ ' + q.row.xn.toFixed(3) + '. Puedes verificarlo en la animación.');
    } else {
      feedback(fb, false, 'Aún no. Recuerda x₁ = x₀ − f(x₀)/f′(x₀). Pista: f(x₀) = ' + fmt(q.row.fx) +
        ' y f′(x₀) = ' + fmt(q.row.d) + '.');
    }
  });
  $('btnSol').addEventListener('click', () => {
    const r = q.row;
    feedback($('fbNum'), true, 'Solución: x₁ = ' + fmtn(r.x) + ' − (' + fmtn(r.fx) + ') / ' + fmtn(r.d) +
      ' = ' + r.xn.toFixed(3) + '.');
  });
  $('btnNueva').addEventListener('click', newQuestion);
  $('btnVer').addEventListener('click', () => {
    loadFunc(q.fi, q.x0);
    $('lienzo').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
  });

  $('formCon').addEventListener('submit', (e) => {
    e.preventDefault();
    const sel = document.querySelector('input[name="c"]:checked'), fb = $('fbCon');
    if (!sel) { feedback(fb, false, 'Elige una opción.'); return; }
    if (sel.value === 'a') {
      feedback(fb, true, '¡Correcto! Con f′(xₙ) = 0 habría que dividir entre cero. Pruébalo con f(x) = x² − 2 y x₀ = 0.');
    } else if (sel.value === 'b') {
      feedback(fb, false, 'No: la fórmula divide entre f′(xₙ), y dividir entre 0 no está definido.');
    } else {
      feedback(fb, false, 'No: lo que ocurre es que el método no puede continuar.');
    }
  });

  // ---------- Inicio ----------
  velVal.textContent = speed.toFixed(1) + ' it/s';
  buildExample();
  newQuestion();
  loadFunc(0);
})();
