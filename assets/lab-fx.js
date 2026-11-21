/* TattLabStudios — live "lab" backdrop (refined)
   Faint skeletal molecules drawn like a chemistry textbook (glycerin, a
   graphite fragment of carbon black, titanium dioxide, water…) slowly drift
   and turn, fine dust hangs in the air, faint formulas rise, and every so
   often a slow wisp of ink diffuses through the scene.

   - On load (homepage): fine particles converge and the logo emblem forms.
   - On scroll: the molecules turn faster and the ink stirs.
   - Tap / click: a drop of ink spreads from your finger.

   Usage: data-lab-fx="full" (homepage hero) or "lite" (inner page headers). */
(function () {
  const hosts = document.querySelectorAll('[data-lab-fx]');
  if (!hosts.length) return;

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const TINTS = ['167,139,250', '196,181,253', '34,211,238', '232,121,249'];
  const INKS = ['#8b5cf6', '#a855f7', '#e879f9', '#6366f1'];
  // the chemistry of tattoo ink: pigments suspended in a carrier
  const EQUATIONS = [
    'C + C₃H₈O₃ + H₂O → INK',
    'Fe₃O₄',
    'TiO₂',
    'C₃₂H₁₆CuN₈',
    'C₃H₈O₃',
    'Fe₂O₃',
    'pigment + carrier → INK',
    'FeO(OH)',
  ];

  /* Skeletal formulas. Points are in bond-length units; bonds are [a, b, order]. */
  const S3 = Math.sqrt(3) / 2;
  const hex = (cx, cy) => [0, 1, 2, 3, 4, 5].map((i) => [cx + Math.cos((Math.PI / 3) * i - Math.PI / 6), cy + Math.sin((Math.PI / 3) * i - Math.PI / 6)]);
  const MOLECULES = [
    { // benzene ring
      pts: hex(0, 0),
      bonds: [[0, 1, 2], [1, 2, 1], [2, 3, 2], [3, 4, 1], [4, 5, 2], [5, 0, 1]],
    },
    { // carbon black: two fused graphite rings (naphthalene-like fragment)
      pts: [...hex(0, 0), [2 * S3, -1], [3 * S3, -0.5], [3 * S3, 0.5], [2 * S3, 1]],
      bonds: [[0, 1, 1], [1, 2, 2], [2, 3, 1], [3, 4, 2], [4, 5, 1], [5, 0, 2], [0, 6, 1], [6, 7, 2], [7, 8, 1], [8, 9, 2], [9, 1, 1]],
    },
    { // glycerin C3H8O3 — the carrier
      pts: [[0, 0], [S3, -0.5], [2 * S3, 0], [0, 1], [2 * S3, 1], [S3, -1.5]],
      bonds: [[0, 1, 1], [1, 2, 1], [0, 3, 1], [2, 4, 1], [1, 5, 1]],
      labels: { 3: 'OH', 4: 'OH', 5: 'OH' },
    },
    { // titanium dioxide O=Ti=O — white pigment
      pts: [[0, 0], [1, 0], [2, 0]],
      bonds: [[0, 1, 2], [1, 2, 2]],
      labels: { 0: 'O', 1: 'Ti', 2: 'O' },
    },
    { // water
      pts: [[0, 0], [0.8, 0.6], [-0.8, 0.6]],
      bonds: [[0, 1, 1], [0, 2, 1]],
      labels: { 0: 'O', 1: 'H', 2: 'H' },
    },
    { // ethanol chain
      pts: [[0, 0], [S3, -0.5], [2 * S3, 0]],
      bonds: [[0, 1, 1], [1, 2, 1]],
      labels: { 2: 'OH' },
    },
  ];

  const R = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  /* soft ink sprite (cheaper than blur filters) */
  const sprites = {};
  function ink(color) {
    if (sprites[color]) return sprites[color];
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, color + '55');
    grd.addColorStop(0.5, color + '22');
    grd.addColorStop(1, color + '00');
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
    return (sprites[color] = c);
  }

  function Lab(host) {
    const full = host.dataset.labFx !== 'lite';
    const emblem = host.querySelector('.lab-emblem');
    const canvas = document.createElement('canvas');
    canvas.className = 'lab-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    host.prepend(canvas);
    const ctx = canvas.getContext('2d');

    let W = 0, H = 0, mobile = false;
    const mols = [], dust = [], eqs = [], clouds = [], seeds = [];
    const pointer = { x: -9999, y: -9999, on: false };
    let raf = 0, last = 0, now = 0, nextCloud = 2500, inView = true, energy = 0;

    const makeMol = (anywhere) => ({
      tpl: pick(MOLECULES),
      x: R(0, W), y: anywhere ? R(0, H) : H + 60,
      s: R(13, full ? 24 : 18) * (mobile ? 0.85 : 1),
      rot: R(0, Math.PI * 2), vr: (Math.random() < 0.5 ? -1 : 1) * R(0.0004, 0.0012),
      vx: R(-0.06, 0.06), vy: -R(0.04, 0.14),
      tint: pick(TINTS), glow: 0,
    });
    const makeDust = () => ({ x: R(0, W), y: R(0, H), r: R(0.4, 1.3), vy: -R(0.03, 0.15), vx: R(-0.04, 0.04), a: R(0.12, 0.45), tw: R(0, 6.28) });
    function makeEq(anywhere) {
      const size = R(10, 13);
      ctx.font = `${size}px "Space Mono", monospace`;
      const text = pick(EQUATIONS);
      const w = ctx.measureText(text).width;
      return { text, size, x: R(8, Math.max(9, W - w - 8)), y: anywhere ? R(H * 0.1, H) : H + 20, vy: -R(0.08, 0.18), life: anywhere ? R(0, 5000) : 0, max: R(12000, 20000) };
    }

    // a slow wisp of ink diffusing outwards
    function inkDrop(x, y, size, slow) {
      for (let i = 0; i < 3; i++) {
        clouds.push({
          x: x + R(-12, 12), y: y + R(-12, 12),
          vx: R(-0.08, 0.08), vy: R(-0.12, 0.02),
          r0: 4, r1: R(0.7, 1.15) * size,
          life: 0, max: slow ? R(6500, 9000) : R(3500, 5000),
          c: pick(INKS),
        });
      }
      start();
    }

    function synthesise() {
      if (!emblem) return;
      const er = emblem.getBoundingClientRect(), cr = canvas.getBoundingClientRect();
      const tx = er.left - cr.left + er.width / 2, ty = er.top - cr.top + er.height / 2;
      const rad = er.width * 0.38;
      const n = mobile ? 70 : 110;
      for (let i = 0; i < n; i++) {
        const ang = R(0, Math.PI * 2), dist = R(Math.max(W, H) * 0.3, Math.max(W, H) * 0.7);
        const sx = tx + Math.cos(ang) * dist, sy = ty + Math.sin(ang) * dist;
        const ta = R(0, Math.PI * 2), tr = R(0, rad);
        seeds.push({
          sx, sy, cx: (sx + tx) / 2 + R(-120, 120), cy: (sy + ty) / 2 + R(-120, 120),
          tx: tx + Math.cos(ta) * tr, ty: ty + Math.sin(ta) * tr,
          life: -R(0, 450), max: R(1100, 1500), tint: pick(TINTS),
        });
      }
      setTimeout(() => {
        inkDrop(tx, ty, er.width * 0.9, false);
        emblem.classList.add('is-formed');
      }, 1600);
      start();
    }

    function resize() {
      const r = canvas.getBoundingClientRect();
      if (!r.width || !r.height) return;
      W = r.width; H = r.height; mobile = W < 700;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const nMol = full ? (mobile ? 9 : 15) : (mobile ? 4 : 7);
      while (mols.length < nMol) mols.push(makeMol(true));
      mols.length = nMol;
      const nDust = full ? (mobile ? 45 : 80) : (mobile ? 20 : 40);
      while (dust.length < nDust) dust.push(makeDust());
      dust.length = nDust;
      const nEq = full ? (mobile ? 3 : 5) : 2;
      while (eqs.length < nEq) eqs.push(makeEq(true));
      eqs.length = nEq;
      if (!raf) draw();
    }

    function update(dt) {
      const k = dt / 16.67;
      energy *= Math.pow(0.95, k);
      const heat = Math.min(energy, 3);

      mols.forEach((m, i) => {
        m.rot += m.vr * k * (1 + heat * 5);                    // scrolling spins the molecules
        m.x += m.vx * k; m.y += m.vy * k * (1 + heat);
        const target = pointer.on ? Math.max(0, 1 - Math.hypot(m.x - pointer.x, m.y - pointer.y) / 140) : 0;
        m.glow += (target - m.glow) * Math.min(1, 0.08 * k);  // light up near your finger
        if (m.y < -80 || m.x < -120 || m.x > W + 120) mols[i] = makeMol(false);
      });
      dust.forEach((p) => {
        p.x += p.vx * k; p.y += p.vy * k * (1 + heat * 2);
        if (p.y < -5) { p.y = H + 5; p.x = R(0, W); }
      });
      for (let i = 0; i < eqs.length; i++) {
        const e = eqs[i];
        e.y += e.vy * k; e.life += dt;
        if (e.life > e.max || e.y < -20) eqs[i] = makeEq(false);
      }
      clouds.forEach((c) => { c.x += c.vx * k * (1 + heat); c.y += c.vy * k * (1 + heat); c.life += dt; });
      for (let i = clouds.length - 1; i >= 0; i--) if (clouds[i].life > clouds[i].max) clouds.splice(i, 1);
      seeds.forEach((s) => { s.life += dt; });
      for (let i = seeds.length - 1; i >= 0; i--) if (seeds[i].life > seeds[i].max) seeds.splice(i, 1);

      nextCloud -= dt * heat;                                   // scrolling stirs the ink
      if (now > nextCloud) {
        const x = mobile ? R(0.1, 0.9) * W : R(0.45, 0.95) * W;
        inkDrop(x, R(0.15, 0.85) * H, R(140, 240) * (full ? 1 : 0.7), true);
        nextCloud = now + (full ? R(4500, 8000) : R(8000, 14000));
      }
    }

    function drawMol(m) {
      const { pts, bonds, labels } = m.tpl;
      const cos = Math.cos(m.rot), sin = Math.sin(m.rot);
      let cx = 0, cy = 0;
      pts.forEach((p) => { cx += p[0]; cy += p[1]; });
      cx /= pts.length; cy /= pts.length;
      const P = pts.map(([x, y]) => {
        const dx = (x - cx) * m.s, dy = (y - cy) * m.s;
        return [m.x + dx * cos - dy * sin, m.y + dx * sin + dy * cos];
      });
      const alpha = (full ? 0.2 : 0.13) + m.glow * 0.5;
      ctx.strokeStyle = `rgba(${m.tint},${alpha.toFixed(3)})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      bonds.forEach(([a, b, order]) => {
        let [x1, y1] = P[a], [x2, y2] = P[b];
        const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
        const ux = dx / len, uy = dy / len;
        const gap = 7;                                          // leave room for atom labels
        if (labels && labels[a]) { x1 += ux * gap; y1 += uy * gap; }
        if (labels && labels[b]) { x2 -= ux * gap; y2 -= uy * gap; }
        ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
        if (order === 2) {                                      // second line of a double bond
          const ox = -uy * 3.2, oy = ux * 3.2, sh = 0.15;
          ctx.moveTo(x1 + ox + (x2 - x1) * sh, y1 + oy + (y2 - y1) * sh);
          ctx.lineTo(x2 + ox - (x2 - x1) * sh, y2 + oy - (y2 - y1) * sh);
        }
      });
      ctx.stroke();
      if (labels) {
        ctx.fillStyle = `rgba(${m.tint},${Math.min(1, alpha + 0.08).toFixed(3)})`;
        ctx.font = '10px "Space Mono", monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        Object.keys(labels).forEach((i) => ctx.fillText(labels[i], P[i][0], P[i][1]));
        ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
      }
    }

    function draw() {
      ctx.clearRect(0, 0, W, H);

      // ink wisps underneath
      ctx.globalCompositeOperation = 'lighter';
      clouds.forEach((c) => {
        const p = c.life / c.max;
        const s = c.r0 + (c.r1 - c.r0) * easeOut(p);
        ctx.globalAlpha = Math.min(1, p / 0.12) * Math.pow(1 - p, 1.4) * (full ? 0.9 : 0.6);
        ctx.drawImage(ink(c.c), c.x - s, c.y - s, s * 2, s * 2);
      });
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';

      // dust
      dust.forEach((p) => {
        const tw = 0.6 + 0.4 * Math.sin(now / 900 + p.tw);
        ctx.fillStyle = `rgba(221,214,254,${(p.a * tw).toFixed(3)})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
      });

      mols.forEach(drawMol);

      // faint formulas
      eqs.forEach((e) => {
        const p = e.life / e.max;
        const fade = Math.max(0, Math.min(1, p / 0.15, (1 - p) / 0.15));
        ctx.globalAlpha = fade * (full ? 0.22 : 0.15);
        ctx.font = `${e.size}px "Space Mono", monospace`;
        ctx.fillStyle = '#c4b5fd';
        ctx.fillText(e.text, e.x, e.y);
      });
      ctx.globalAlpha = 1;

      // fine particles converging into the emblem
      seeds.forEach((s) => {
        if (s.life < 0) return;
        const p = easeInOut(Math.min(1, s.life / s.max)), u = 1 - p;
        const x = u * u * s.sx + 2 * u * p * s.cx + p * p * s.tx;
        const y = u * u * s.sy + 2 * u * p * s.cy + p * p * s.ty;
        const a = Math.min(1, s.life / 200) * (p > 0.85 ? (1 - p) / 0.15 : 1);
        ctx.fillStyle = `rgba(${s.tint},${(a * 0.9).toFixed(3)})`;
        ctx.beginPath(); ctx.arc(x, y, 1.2, 0, Math.PI * 2); ctx.fill();
      });
    }

    function frame(t) {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(48, last ? t - last : 16.67);
      last = t; now = t;
      update(dt);
      draw();
    }
    function start() {
      if (reduce || raf || !inView || document.hidden) return;
      last = 0;
      raf = requestAnimationFrame(frame);
    }
    function stop() {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    }

    function setPointer(e) {
      const r = canvas.getBoundingClientRect();
      pointer.x = e.clientX - r.left;
      pointer.y = e.clientY - r.top;
      pointer.on = true;
    }
    host.addEventListener('pointermove', setPointer, { passive: true });
    host.addEventListener('pointerleave', () => { pointer.on = false; });
    host.addEventListener('pointerup', (e) => { if (e.pointerType !== 'mouse') pointer.on = false; });
    host.addEventListener('pointerdown', (e) => {
      if (reduce || e.target.closest('a, button, input, textarea, select, label, summary, iframe')) return;
      setPointer(e);
      inkDrop(pointer.x, pointer.y, full ? 170 : 130, false);
    });

    let lastY = window.scrollY, scrollTick = false;
    function onScroll() {
      const y = window.scrollY;
      energy = Math.min(4, energy + Math.abs(y - lastY) / 80);
      lastY = y;
      if (!scrollTick) {
        scrollTick = true;
        requestAnimationFrame(() => {
          scrollTick = false;
          if (!emblem) return;
          const r = host.getBoundingClientRect();
          const sp = Math.max(0, Math.min(1, -r.top / (r.height * 0.6)));
          host.style.setProperty('--sp', sp.toFixed(3));
          document.body.classList.toggle('emblem-away', sp > 0.35);
        });
      }
      start();
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    if (emblem) document.body.classList.add('has-emblem');

    if ('ResizeObserver' in window) new ResizeObserver(resize).observe(canvas);
    else window.addEventListener('resize', resize);
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(([entry]) => {
        inView = entry.isIntersecting;
        inView ? start() : stop();
      }).observe(host);
    }
    document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));

    resize();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (!raf) draw(); });
    start();
    onScroll();

    if (reduce) { if (emblem) emblem.classList.add('is-formed'); }
    else if (full) setTimeout(synthesise, 200);
  }

  hosts.forEach((h) => Lab(h));
})();
