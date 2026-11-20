/* TattLabStudios — live "lab" backdrop
   Drifting molecules with bonds and orbiting electrons, floating chemical
   equations, rising bubbles that pop, and reactions that flash, shockwave and
   throw sparks. Tap / click anywhere on it to set off your own reaction.

   Usage: add data-lab-fx="full" (homepage hero) or data-lab-fx="lite"
   (inner page headers) to any element. */
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
  const PRODUCTS = ['H₂O', 'CO₂↑', 'O₂↑', 'NaCl', 'NH₃', '+ΔE', 'H₂↑', 'ΔH < 0', 'Fe', 'INK'];

  const R = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];

  /* Pre-rendered glow sprites: far cheaper than canvas shadowBlur */
  const sprites = {};
  function glow(color) {
    if (sprites[color]) return sprites[color];
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, color);
    grd.addColorStop(0.22, color + 'aa');
    grd.addColorStop(1, color + '00');
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
    return (sprites[color] = c);
  }

  function Lab(host) {
    const full = host.dataset.labFx !== 'lite';
    const canvas = document.createElement('canvas');
    canvas.className = 'lab-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    host.prepend(canvas);
    const ctx = canvas.getContext('2d');

    let W = 0, H = 0, mobile = false, D = 120;
    const atoms = [], eqs = [], bubbles = [], sparks = [], rings = [], flashes = [], labels = [];
    const pointer = { x: -9999, y: -9999, on: false, lastTrail: 0 };
    let raf = 0, last = 0, now = 0, nextReaction = 2600, nextBubble = 0, inView = true;

    /* ── factories ── */
    const makeAtom = () => ({
      x: R(0, W), y: R(0, H),
      vx: R(-0.25, 0.25), vy: R(-0.25, 0.25),
      r: R(3, full ? 9.5 : 7.5),
      el: pick(ELEMENTS), c: pick(COLORS),
      spin: R(-1, 1), tilt: R(0, Math.PI),
    });

    function makeEq(initial) {
      const size = R(11, 15) * (mobile ? 0.9 : 1);
      ctx.font = `${size}px "Space Mono", monospace`;
      const text = pick(EQUATIONS);
      const w = ctx.measureText(text).width;
      return {
        text, size, w,
        x: R(8, Math.max(9, W - w - 8)),
        y: initial ? R(H * 0.1, H) : H + 20,
        vy: -R(0.12, 0.28),
        life: initial ? R(0, 4000) : 0,
        max: R(9000, 16000),
        c: pick(COLORS),
      };
    }

    function focusPoint() {
      // keep the big reactions away from the headline so the text stays readable
      if (mobile) return { x: R(0.1, 0.9) * W, y: R(0.1, full ? 0.4 : 0.85) * H };
      return { x: R(0.55, 0.94) * W, y: R(0.18, 0.82) * H };
    }

    /* ── a reaction: flash + shockwave + sparks + product label ── */
    function bang(x, y, power) {
      power = power || 1;
      flashes.push({ x, y, r: 60 * power, life: 0, max: 520 });
      rings.push({ x, y, max: 110 * power, life: 0, dur: 760, w: 2.6 });
      rings.push({ x, y, max: 70 * power, life: -120, dur: 640, w: 1.6 });
      const n = Math.round((mobile ? 16 : 26) * power);
      for (let i = 0; i < n && sparks.length < 420; i++) {
        const a = R(0, Math.PI * 2), s = R(1.2, 5.2) * Math.sqrt(power);
        sparks.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0, max: R(450, 1100), c: pick(COLORS), size: R(1, 2.6) });
      }
      labels.push({ x, y, text: pick(PRODUCTS), life: 0, max: 1500, c: pick(COLORS) });
      // push nearby atoms away
      const reach = 170 * power;
      atoms.forEach((a) => {
        const dx = a.x - x, dy = a.y - y, d = Math.hypot(dx, dy) || 1;
        if (d < reach) {
          const f = (1 - d / reach) * 3.2 * power;
          a.vx += (dx / d) * f; a.vy += (dy / d) * f;
        }
      });
      start();
    }

    function popBubble(b) {
      rings.push({ x: b.x, y: b.y, max: b.r * 4 + 8, life: 0, dur: 380, w: 1.2 });
      for (let i = 0; i < 6; i++) {
        const a = R(0, Math.PI * 2), s = R(0.6, 1.8);
        sparks.push({ x: b.x, y: b.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0, max: R(250, 500), c: b.c, size: R(0.8, 1.6) });
      }
    }

    function ambientReaction() {
      // prefer two atoms that are already bonded inside the focus area: they "react"
      let best = null;
      for (let i = 0; i < atoms.length && !best; i++) {
        for (let j = i + 1; j < atoms.length; j++) {
          const a = atoms[i], b = atoms[j];
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          const inFocus = mobile ? a.y < H * (full ? 0.45 : 0.9) : a.x > W * 0.5;
          if (d < D * 0.55 && inFocus) { best = [a, b]; break; }
        }
      }
      if (best) {
        const [a, b] = best;
        a.el = pick(ELEMENTS); b.el = pick(ELEMENTS); a.c = pick(COLORS); b.c = pick(COLORS);
        bang((a.x + b.x) / 2, (a.y + b.y) / 2, R(0.8, 1.2));
      } else {
        const p = focusPoint();
        bang(p.x, p.y, R(0.7, 1.1));
      }
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
      while (atoms.length < nAtoms) atoms.push(makeAtom());
      atoms.length = nAtoms;
      atoms.forEach((a) => { if (a.x > W) a.x = R(0, W); if (a.y > H) a.y = R(0, H); });

      const nEqs = full ? (mobile ? 4 : 7) : (mobile ? 2 : 4);
      while (eqs.length < nEqs) eqs.push(makeEq(true));
      eqs.length = nEqs;

      if (!raf) draw();
    }

    /* ── simulation ── */
    function update(dt) {
      const k = dt / 16.67;

      atoms.forEach((a) => {
        // pointer repels atoms, so the molecules "react" to your finger / cursor
        if (pointer.on) {
          const dx = a.x - pointer.x, dy = a.y - pointer.y, d = Math.hypot(dx, dy) || 1;
          if (d < 120) { const f = (1 - d / 120) * 0.35 * k; a.vx += (dx / d) * f; a.vy += (dy / d) * f; }
        }
        // settle back to a slow drift after being pushed
        const sp = Math.hypot(a.vx, a.vy);
        if (sp > 0.35) { const damp = Math.pow(0.965, k); a.vx *= damp; a.vy *= damp; }
        a.x += a.vx * k; a.y += a.vy * k;
        const m = 20;
        if (a.x < -m) a.x = W + m; else if (a.x > W + m) a.x = -m;
        if (a.y < -m) a.y = H + m; else if (a.y > H + m) a.y = -m;
      });

      for (let i = 0; i < eqs.length; i++) {
        const e = eqs[i];
        e.y += e.vy * k; e.life += dt;
        if (e.life > e.max || e.y < -30) eqs[i] = makeEq(false);
      }

      if (now > nextBubble) {
        bubbles.push({ x: R(0, W), y: H + 10, r: R(2, 7), vy: -R(0.4, 1.2), wob: R(0, 6.28), popAt: R(0.05, 0.75) * H, c: pick(COLORS) });
        nextBubble = now + (full ? R(180, 420) : R(600, 1200));
      }
      for (let i = bubbles.length - 1; i >= 0; i--) {
        const b = bubbles[i];
        b.y += b.vy * k;
        b.x += Math.sin(now / 500 + b.wob) * 0.35 * k;
        if (b.y < b.popAt) { popBubble(b); bubbles.splice(i, 1); }
      }

      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i];
        const drag = Math.pow(0.94, k);
        s.vx *= drag; s.vy = s.vy * drag + 0.03 * k;
        s.x += s.vx * k; s.y += s.vy * k; s.life += dt;
        if (s.life > s.max) sparks.splice(i, 1);
      }
      [rings, flashes, labels].forEach((list) => {
        for (let i = list.length - 1; i >= 0; i--) {
          list[i].life += dt;
          if (list[i].life > (list[i].dur || list[i].max)) list.splice(i, 1);
        }
      });

      if (now > nextReaction) {
        ambientReaction();
        nextReaction = now + (full ? R(1600, 3800) : R(3500, 7500));
      }
    }

    /* ── drawing ── */
    function draw() {
      ctx.clearRect(0, 0, W, H);
      const bondAlpha = full ? 0.5 : 0.32;

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
          if (d < D * 0.42 && (i + j) % 3 === 0) {           // double bond
            const ox = (-dy / d) * 3, oy = (dx / d) * 3;
            ctx.beginPath(); ctx.moveTo(a.x + ox, a.y + oy); ctx.lineTo(b.x + ox, b.y + oy); ctx.stroke();
          }
        }
        if (pointer.on) {                                      // bonds to your finger / cursor
          const d = Math.hypot(a.x - pointer.x, a.y - pointer.y);
          if (d < 160) {
            ctx.strokeStyle = `rgba(34,211,238,${((1 - d / 160) * 0.7).toFixed(3)})`;
            ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(pointer.x, pointer.y); ctx.stroke();
          }
        }
      }

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

      ctx.globalCompositeOperation = 'lighter';

      // atoms (+ electron orbits on the bigger ones)
      atoms.forEach((a) => {
        const s = a.r * 6;
        ctx.globalAlpha = full ? 0.85 : 0.6;
        ctx.drawImage(glow(a.c), a.x - s / 2, a.y - s / 2, s, s);
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

      // flashes
      flashes.forEach((f) => {
        const p = f.life / f.max;
        const s = f.r * (0.6 + p * 1.6) * 2;
        ctx.globalAlpha = Math.max(0, 1 - p);
        ctx.drawImage(glow('#fdf4ff'), f.x - s / 2, f.y - s / 2, s, s);
        ctx.drawImage(glow('#e879f9'), f.x - s, f.y - s, s * 2, s * 2);
      });

      // shockwaves
      rings.forEach((r) => {
        if (r.life < 0) return;
        const p = Math.min(1, r.life / r.dur);
        const e = 1 - Math.pow(1 - p, 3);
        ctx.globalAlpha = 1 - p;
        ctx.strokeStyle = '#c4b5fd';
        ctx.lineWidth = r.w * (1 - p) + 0.3;
        ctx.beginPath(); ctx.arc(r.x, r.y, r.max * e, 0, Math.PI * 2); ctx.stroke();
      });

      // sparks (streaks + glow)
      sparks.forEach((s) => {
        const p = s.life / s.max;
        ctx.globalAlpha = Math.max(0, 1 - p);
        ctx.strokeStyle = s.c;
        ctx.lineWidth = s.size;
        ctx.beginPath(); ctx.moveTo(s.x - s.vx * 3, s.y - s.vy * 3); ctx.lineTo(s.x, s.y); ctx.stroke();
        const g = s.size * 6;
        ctx.drawImage(glow(s.c), s.x - g / 2, s.y - g / 2, g, g);
      });

      ctx.globalCompositeOperation = 'source-over';

      // product labels floating out of each reaction
      labels.forEach((l) => {
        const p = l.life / l.max;
        ctx.globalAlpha = Math.max(0, p < 0.15 ? p / 0.15 : 1 - (p - 0.15) / 0.85);
        ctx.font = `600 ${mobile ? 14 : 17}px "Space Grotesk", sans-serif`;
        ctx.fillStyle = l.c;
        ctx.textAlign = 'center';
        ctx.fillText(l.text, l.x, l.y - 18 - p * 46);
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
      if (!reduce && now - pointer.lastTrail > 45) {             // sparkle trail
        pointer.lastTrail = now;
        const a = R(0, Math.PI * 2);
        sparks.push({ x: pointer.x, y: pointer.y, vx: Math.cos(a) * 0.8, vy: Math.sin(a) * 0.8, life: 0, max: 500, c: '#22d3ee', size: 1.2 });
      }
    }, { passive: true });
    host.addEventListener('pointerleave', () => { pointer.on = false; });
    host.addEventListener('pointerup', (e) => { if (e.pointerType !== 'mouse') pointer.on = false; });
    host.addEventListener('pointerdown', (e) => {
      if (reduce || e.target.closest('a, button, input, textarea, select, label, summary, iframe')) return;
      setPointer(e);
      bang(pointer.x, pointer.y, full ? 1.7 : 1.3);
      host.classList.remove('lab-shake');
      void host.offsetWidth;                                       // restart the shake animation
      host.classList.add('lab-shake');
    });
    host.addEventListener('animationend', (e) => { if (e.animationName === 'labShake') host.classList.remove('lab-shake'); });

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

    // opening "ignition": a chain of reactions as the page appears
    if (!reduce && full) {
      const p = focusPoint();
      setTimeout(() => bang(p.x, p.y, 2.4), 1250);
      setTimeout(() => { const q = focusPoint(); bang(q.x, q.y, 1.3); }, 1600);
      setTimeout(() => { const q = focusPoint(); bang(q.x, q.y, 1); }, 1950);
    }
  }

  hosts.forEach((h) => Lab(h));
})();
