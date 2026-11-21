/* TattLabStudios — live "lab" backdrop
   Drifting molecules with bonds and orbiting electrons, floating chemical
   equations and rising bubbles. Reactions look like real chemistry: two atoms
   pull together, bond, and release a slow cloud of coloured ink that diffuses
   like a drop in water, with a fizz of bubbles and the product formula.

   - On load (homepage): particles converge and "synthesise" the logo emblem.
   - On scroll: the lab heats up (molecules agitate, more fizz and reactions)
     and the emblem's benzene ring turns with the page.
   - Tap / click: drops a bead of ink that catalyses nearby atoms.

   Usage: data-lab-fx="full" (homepage hero) or "lite" (inner page headers). */
(function () {
  const hosts = document.querySelectorAll('[data-lab-fx]');
  if (!hosts.length) return;

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const COLORS = ['#a78bfa', '#e879f9', '#22d3ee', '#8b5cf6', '#c084fc'];
  const ELEMENTS = ['C', 'C', 'C', 'H', 'H', 'O', 'O', 'N', 'Na', 'Cl', 'Fe', 'S'];
  const EQUATIONS = [
    '2H₂ + O₂ → 2H₂O',
    'NaHCO₃ + CH₃COOH → CO₂↑',
    'C₆H₁₂O₆ + 6O₂ → 6CO₂ + 6H₂O',
    '2H₂O₂ → 2H₂O + O₂↑',
    'Fe₂O₃ + 2Al → Al₂O₃ + 2Fe',
    'CH₄ + 2O₂ → CO₂ + 2H₂O',
    'N₂ + 3H₂ ⇌ 2NH₃',
    '2Na + Cl₂ → 2NaCl',
    'PV = nRT',
    'ΔG = ΔH − TΔS',
    'pH = −log[H⁺]',
    'TiO₂ · Fe₃O₄ · C',
    'Zn + 2HCl → ZnCl₂ + H₂↑',
    'CaCO₃ → CaO + CO₂↑',
  ];
  const PRODUCTS = ['H₂O', 'CO₂', 'O₂', 'NaCl', 'NH₃', 'C₆H₆', 'Fe₂O₃', 'TiO₂', 'CH₄', 'H₂O₂'];

  const R = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  /* Pre-rendered sprites (cheaper than shadowBlur): a bright atom glow and a soft ink cloud */
  const sprites = {};
  function sprite(color, soft) {
    const key = color + (soft ? 's' : 'g');
    if (sprites[key]) return sprites[key];
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    if (soft) {
      grd.addColorStop(0, color + '70');
      grd.addColorStop(0.45, color + '30');
      grd.addColorStop(1, color + '00');
    } else {
      grd.addColorStop(0, color);
      grd.addColorStop(0.22, color + 'aa');
      grd.addColorStop(1, color + '00');
    }
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
    return (sprites[key] = c);
  }

  function Lab(host) {
    const full = host.dataset.labFx !== 'lite';
    const emblem = host.querySelector('.lab-emblem');
    const canvas = document.createElement('canvas');
    canvas.className = 'lab-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    host.prepend(canvas);
    const ctx = canvas.getContext('2d');

    let W = 0, H = 0, mobile = false, D = 120;
    const atoms = [], eqs = [], bubbles = [], clouds = [], ripples = [], labels = [], links = [], seeds = [];
    const pointer = { x: -9999, y: -9999, on: false, lastTrail: 0 };
    let raf = 0, last = 0, now = 0, nextReaction = 3200, nextBubble = 0, inView = true, energy = 0;

    /* ── factories ── */
    const makeAtom = () => ({
      x: R(0, W), y: R(0, H),
      vx: R(-0.25, 0.25), vy: R(-0.25, 0.25),
      r: R(3, full ? 9.5 : 7.5),
      el: pick(ELEMENTS), c: pick(COLORS),
      spin: R(-1, 1), tilt: R(0, Math.PI), busy: false,
    });

    function makeEq(initial) {
      const size = R(11, 15) * (mobile ? 0.9 : 1);
      ctx.font = `${size}px "Space Mono", monospace`;
      const text = pick(EQUATIONS);
      const w = ctx.measureText(text).width;
      return {
        text, size,
        x: R(8, Math.max(9, W - w - 8)),
        y: initial ? R(H * 0.1, H) : H + 20,
        vy: -R(0.12, 0.28),
        life: initial ? R(0, 4000) : 0,
        max: R(9000, 16000),
        c: pick(COLORS),
      };
    }

    /* ── chemistry ── */
    // a slow cloud of ink diffusing outwards, like a drop in water
    function bloom(x, y, c1, c2, power) {
      power = power || 1;
      for (let i = 0; i < 4; i++) {
        clouds.push({
          x: x + R(-10, 10) * power, y: y + R(-10, 10) * power,
          vx: R(-0.12, 0.12), vy: R(-0.22, 0.02),
          r0: 6, r1: R(60, 110) * power,
          life: 0, max: R(2600, 3800),
          c: i % 2 ? c1 : c2,
        });
      }
      ripples.push({ x, y, max: 55 * power, life: 0, dur: 1400 });
      start();
    }

    // effervescence: a burst of small bubbles rising from a point
    function fizz(x, y, n) {
      for (let i = 0; i < n; i++) {
        bubbles.push({
          x: x + R(-12, 12), y: y + R(-6, 6), r: R(1.2, 3.4),
          vy: -R(0.5, 1.5), wob: R(0, 6.28), popAt: y - R(30, 140), c: pick(COLORS),
        });
      }
    }

    function label(x, y, text, c) {
      labels.push({ x, y, text, c, life: 0, max: 2200 });
    }

    // two atoms attract, bond, then react
    function react(a, b) {
      if (a.busy || b.busy) return;
      a.busy = b.busy = true;
      links.push({ a, b, life: 0, max: 900 });
      start();
    }
    function finishReaction(lk) {
      const { a, b } = lk;
      a.busy = b.busy = false;
      const x = (a.x + b.x) / 2, y = (a.y + b.y) / 2;
      bloom(x, y, a.c, b.c, 1);
      fizz(x, y, mobile ? 6 : 9);
      label(x, y, pick(PRODUCTS), pick(COLORS));
      // products drift apart, recoloured
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
      a.vx -= (dx / d) * 0.8; a.vy -= (dy / d) * 0.8;
      b.vx += (dx / d) * 0.8; b.vy += (dy / d) * 0.8;
      a.el = pick(ELEMENTS); b.el = pick(ELEMENTS);
      const nc = pick(COLORS); a.c = nc; b.c = nc;
    }

    function ambientReaction() {
      let best = null, bestD = Infinity;
      for (let i = 0; i < atoms.length; i++) {
        const a = atoms[i];
        if (a.busy) continue;
        for (let j = i + 1; j < atoms.length; j++) {
          const b = atoms[j];
          if (b.busy) continue;
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d < D * 0.9 && d < bestD && Math.random() < 0.5) { best = [a, b]; bestD = d; }
        }
      }
      if (best) react(best[0], best[1]);
    }

    // tap: drop a bead of ink that catalyses nearby atoms
    function catalyse(x, y) {
      bloom(x, y, pick(COLORS), pick(COLORS), 1.4);
      fizz(x, y, mobile ? 10 : 14);
      label(x, y, pick(PRODUCTS), '#22d3ee');
      const near = atoms
        .filter((a) => !a.busy && Math.hypot(a.x - x, a.y - y) < 170)
        .sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y));
      for (let i = 0; i + 1 < near.length && i < 4; i += 2) react(near[i], near[i + 1]);
    }

    // page load: particles converge and "synthesise" the emblem
    function synthesise() {
      if (!emblem) return;
      const er = emblem.getBoundingClientRect(), cr = canvas.getBoundingClientRect();
      const tx = er.left - cr.left + er.width / 2, ty = er.top - cr.top + er.height / 2;
      const rad = er.width * 0.42;
      const n = mobile ? 46 : 70;
      for (let i = 0; i < n; i++) {
        const ang = R(0, Math.PI * 2), dist = R(Math.max(W, H) * 0.35, Math.max(W, H) * 0.75);
        const sx = tx + Math.cos(ang) * dist, sy = ty + Math.sin(ang) * dist;
        const ta = R(0, Math.PI * 2), tr = R(0, rad);
        seeds.push({
          sx, sy,
          cx: (sx + tx) / 2 + R(-160, 160), cy: (sy + ty) / 2 + R(-160, 160),
          tx: tx + Math.cos(ta) * tr, ty: ty + Math.sin(ta) * tr,
          life: -R(0, 500), max: R(1100, 1500), c: pick(COLORS),
        });
      }
      setTimeout(() => {
        bloom(tx, ty, '#a78bfa', '#e879f9', 1.8);
        fizz(tx, ty + er.height * 0.3, 16);
        emblem.classList.add('is-formed');
      }, 1650);
      start();
    }

    /* ── sizing ── */
    function resize() {
      const r = canvas.getBoundingClientRect();
      if (!r.width || !r.height) return;
      W = r.width; H = r.height; mobile = W < 700;
      D = mobile ? 95 : 125;
      const dpr = Math.min(window.devicePixelRatio || 1, mobile ? 1.75 : 2);
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const nAtoms = full ? (mobile ? 26 : 46) : (mobile ? 12 : 22);
      if (atoms.length > nAtoms && !atoms.some((a) => a.busy)) atoms.length = nAtoms;
      while (atoms.length < nAtoms) atoms.push(makeAtom());
      atoms.forEach((a) => { if (a.x > W) a.x = R(0, W); if (a.y > H) a.y = R(0, H); });

      const nEqs = full ? (mobile ? 4 : 7) : (mobile ? 2 : 4);
      while (eqs.length < nEqs) eqs.push(makeEq(true));
      eqs.length = nEqs;

      if (!raf) draw();
    }

    /* ── simulation ── */
    function update(dt) {
      const k = dt / 16.67;
      energy *= Math.pow(0.95, k);
      const heat = Math.min(energy, 3);

      atoms.forEach((a) => {
        if (pointer.on) {
          const dx = a.x - pointer.x, dy = a.y - pointer.y, d = Math.hypot(dx, dy) || 1;
          if (d < 120) { const f = (1 - d / 120) * 0.3 * k; a.vx += (dx / d) * f; a.vy += (dy / d) * f; }
        }
        if (heat > 0.05) { a.vx += R(-1, 1) * heat * 0.1 * k; a.vy += R(-1, 1) * heat * 0.1 * k; }  // heated by scrolling
        const sp = Math.hypot(a.vx, a.vy);
        if (sp > 0.35) { const damp = Math.pow(0.965, k); a.vx *= damp; a.vy *= damp; }
        a.x += a.vx * k; a.y += a.vy * k;
        const m = 20;
        if (a.x < -m) a.x = W + m; else if (a.x > W + m) a.x = -m;
        if (a.y < -m) a.y = H + m; else if (a.y > H + m) a.y = -m;
      });

      for (let i = links.length - 1; i >= 0; i--) {
        const lk = links[i];
        lk.life += dt;
        const dx = lk.b.x - lk.a.x, dy = lk.b.y - lk.a.y, d = Math.hypot(dx, dy) || 1;
        if (d > 14) {
          const f = 0.09 * k;
          lk.a.vx += (dx / d) * f; lk.a.vy += (dy / d) * f;
          lk.b.vx -= (dx / d) * f; lk.b.vy -= (dy / d) * f;
        }
        if (lk.life > lk.max || d < 14) { links.splice(i, 1); finishReaction(lk); }
      }

      for (let i = 0; i < eqs.length; i++) {
        const e = eqs[i];
        e.y += e.vy * k * (1 + heat); e.life += dt;
        if (e.life > e.max || e.y < -30) eqs[i] = makeEq(false);
      }

      if (now > nextBubble) {
        bubbles.push({ x: R(0, W), y: H + 10, r: R(2, 6), vy: -R(0.4, 1.2), wob: R(0, 6.28), popAt: R(0.05, 0.75) * H, c: pick(COLORS) });
        nextBubble = now + (full ? R(220, 480) : R(600, 1200)) / (1 + heat * 3);
      }
      for (let i = bubbles.length - 1; i >= 0; i--) {
        const b = bubbles[i];
        b.y += b.vy * k * (1 + heat * 0.5);
        b.x += Math.sin(now / 500 + b.wob) * 0.35 * k;
        if (b.y < b.popAt) {
          ripples.push({ x: b.x, y: b.y, max: b.r * 3 + 6, life: 0, dur: 420 });
          bubbles.splice(i, 1);
        }
      }
      if (bubbles.length > 220) bubbles.splice(0, bubbles.length - 220);

      clouds.forEach((c) => { c.x += c.vx * k; c.y += c.vy * k; });
      seeds.forEach((s) => { s.life += dt; });
      for (let i = seeds.length - 1; i >= 0; i--) if (seeds[i].life > seeds[i].max) seeds.splice(i, 1);
      [clouds, ripples, labels].forEach((list) => {
        for (let i = list.length - 1; i >= 0; i--) {
          list[i].life += dt;
          if (list[i].life > (list[i].dur || list[i].max)) list.splice(i, 1);
        }
      });

      nextReaction -= dt * heat * 1.5;                         // scrolling speeds reactions up
      if (now > nextReaction) {
        ambientReaction();
        nextReaction = now + (full ? R(1800, 3600) : R(3500, 7000));
      }
    }

    /* ── drawing ── */
    function draw() {
      ctx.clearRect(0, 0, W, H);
      const bondAlpha = full ? 0.5 : 0.32;

      // ink clouds sit underneath everything
      ctx.globalCompositeOperation = 'lighter';
      clouds.forEach((c) => {
        const p = c.life / c.max;
        const s = c.r0 + (c.r1 - c.r0) * easeOut(p);
        ctx.globalAlpha = Math.min(1, p / 0.08) * Math.pow(1 - p, 1.3) * (full ? 0.9 : 0.6);
        ctx.drawImage(sprite(c.c, true), c.x - s, c.y - s, s * 2, s * 2);
      });
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';

      // bonds
      ctx.lineWidth = 1;
      for (let i = 0; i < atoms.length; i++) {
        const a = atoms[i];
        for (let j = i + 1; j < atoms.length; j++) {
          const b = atoms[j];
          const dx = b.x - a.x, dy = b.y - a.y;
          if (Math.abs(dx) > D || Math.abs(dy) > D) continue;
          const d = Math.hypot(dx, dy);
          if (d > D) continue;
          const al = (1 - d / D) * bondAlpha;
          ctx.strokeStyle = `rgba(167,139,250,${al.toFixed(3)})`;
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
          if (d < D * 0.42 && (i + j) % 3 === 0) {
            const ox = (-dy / d) * 3, oy = (dx / d) * 3;
            ctx.beginPath(); ctx.moveTo(a.x + ox, a.y + oy); ctx.lineTo(b.x + ox, b.y + oy); ctx.stroke();
          }
        }
        if (pointer.on) {
          const d = Math.hypot(a.x - pointer.x, a.y - pointer.y);
          if (d < 160) {
            ctx.strokeStyle = `rgba(34,211,238,${((1 - d / 160) * 0.6).toFixed(3)})`;
            ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(pointer.x, pointer.y); ctx.stroke();
          }
        }
      }

      // bonds that are forming right now: bright, pulsing
      links.forEach((lk) => {
        const p = lk.life / lk.max;
        ctx.strokeStyle = '#f5d0fe';
        ctx.globalAlpha = 0.35 + 0.5 * Math.abs(Math.sin(p * Math.PI * 3));
        ctx.lineWidth = 1.6;
        ctx.setLineDash([4, 4]);
        ctx.lineDashOffset = -now / 30;
        ctx.beginPath(); ctx.moveTo(lk.a.x, lk.a.y); ctx.lineTo(lk.b.x, lk.b.y); ctx.stroke();
        ctx.setLineDash([]);
      });
      ctx.globalAlpha = 1;

      // equations
      eqs.forEach((e) => {
        const p = e.life / e.max;
        const fade = Math.min(1, p / 0.15, (1 - p) / 0.15);
        ctx.globalAlpha = Math.max(0, fade) * (full ? 0.42 : 0.3);
        ctx.font = `${e.size}px "Space Mono", monospace`;
        ctx.fillStyle = e.c;
        ctx.fillText(e.text, e.x, e.y);
      });
      ctx.globalAlpha = 1;

      // bubbles
      bubbles.forEach((b) => {
        ctx.strokeStyle = b.c + '99';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.beginPath(); ctx.arc(b.x - b.r * 0.35, b.y - b.r * 0.35, b.r * 0.22, 0, Math.PI * 2); ctx.fill();
      });

      // ripples (popped bubbles, reaction points): thin, quiet rings
      ripples.forEach((r) => {
        const p = Math.min(1, r.life / r.dur);
        ctx.globalAlpha = (1 - p) * 0.6;
        ctx.strokeStyle = '#c4b5fd';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(r.x, r.y, r.max * easeOut(p), 0, Math.PI * 2); ctx.stroke();
      });
      ctx.globalAlpha = 1;

      ctx.globalCompositeOperation = 'lighter';

      // atoms (+ electron orbits on the bigger ones)
      atoms.forEach((a) => {
        const s = a.r * 6;
        ctx.globalAlpha = (full ? 0.85 : 0.6) * (a.busy ? 1.3 : 1);
        ctx.drawImage(sprite(a.c), a.x - s / 2, a.y - s / 2, s, s);
        ctx.globalAlpha = 1;
        ctx.fillStyle = a.c;
        ctx.beginPath(); ctx.arc(a.x, a.y, a.r * 0.55, 0, Math.PI * 2); ctx.fill();
        if (a.r > 7.2) {
          const rot = a.tilt + now * 0.0004 * a.spin;
          ctx.strokeStyle = a.c + '66';
          ctx.lineWidth = 0.8;
          ctx.beginPath(); ctx.ellipse(a.x, a.y, a.r * 2.4, a.r * 0.9, rot, 0, Math.PI * 2); ctx.stroke();
          const t = now * 0.003 * (a.spin > 0 ? 1 : -1);
          const ex = Math.cos(t) * a.r * 2.4, ey = Math.sin(t) * a.r * 0.9;
          const cr = Math.cos(rot), sr = Math.sin(rot);
          ctx.fillStyle = '#fff';
          ctx.beginPath(); ctx.arc(a.x + ex * cr - ey * sr, a.y + ex * sr + ey * cr, 1.4, 0, Math.PI * 2); ctx.fill();
        }
      });

      // converging particles that build the emblem
      seeds.forEach((s) => {
        if (s.life < 0) return;
        const p = easeInOut(Math.min(1, s.life / s.max));
        const u = 1 - p;
        const x = u * u * s.sx + 2 * u * p * s.cx + p * p * s.tx;
        const y = u * u * s.sy + 2 * u * p * s.cy + p * p * s.ty;
        ctx.globalAlpha = Math.min(1, s.life / 200) * (p > 0.85 ? (1 - p) / 0.15 : 1);
        ctx.drawImage(sprite(s.c), x - 7, y - 7, 14, 14);
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(x, y, 1.3, 0, Math.PI * 2); ctx.fill();
      });
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';

      // product formulas rising out of each reaction
      labels.forEach((l) => {
        const p = l.life / l.max;
        ctx.globalAlpha = Math.max(0, p < 0.15 ? p / 0.15 : 1 - (p - 0.15) / 0.85) * 0.9;
        ctx.font = `600 ${mobile ? 14 : 16}px "Space Mono", monospace`;
        ctx.fillStyle = l.c;
        ctx.textAlign = 'center';
        ctx.fillText(l.text, l.x, l.y - 16 - p * 40);
        ctx.textAlign = 'start';
      });
      ctx.globalAlpha = 1;
    }

    /* ── loop control: only animate while visible ── */
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

    /* ── interaction ── */
    function setPointer(e) {
      const r = canvas.getBoundingClientRect();
      pointer.x = e.clientX - r.left;
      pointer.y = e.clientY - r.top;
      pointer.on = true;
    }
    host.addEventListener('pointermove', (e) => {
      setPointer(e);
      if (!reduce && now - pointer.lastTrail > 90) {            // a trail of tiny bubbles
        pointer.lastTrail = now;
        fizz(pointer.x, pointer.y, 1);
      }
    }, { passive: true });
    host.addEventListener('pointerleave', () => { pointer.on = false; });
    host.addEventListener('pointerup', (e) => { if (e.pointerType !== 'mouse') pointer.on = false; });
    host.addEventListener('pointerdown', (e) => {
      if (reduce || e.target.closest('a, button, input, textarea, select, label, summary, iframe')) return;
      setPointer(e);
      catalyse(pointer.x, pointer.y);
    });

    /* scrolling heats the lab, and turns the emblem */
    let lastY = window.scrollY, scrollTick = false;
    function onScroll() {
      const y = window.scrollY;
      energy = Math.min(4, energy + Math.abs(y - lastY) / 70);
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
