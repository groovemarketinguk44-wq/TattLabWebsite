/* TattLabStudios — shared site behaviour
   Header state · mobile menu · scroll reveals · page transitions */
(function () {
  const doc = document.documentElement;
  const body = document.body;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── Header: solid background once the page scrolls ── */
  const header = document.getElementById('siteHeader');
  if (header) {
    const onScroll = () => header.classList.toggle('is-scrolled', window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  /* ── Mobile menu ── */
  const toggle = document.querySelector('.menu-toggle');
  const menu = document.getElementById('mobileMenu');
  if (toggle && menu) {
    const setOpen = (open) => {
      body.classList.toggle('menu-open', open);
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      menu.setAttribute('aria-hidden', String(!open));
      if (open) menu.querySelector('a')?.focus({ preventScroll: true });
    };
    toggle.addEventListener('click', () => setOpen(!body.classList.contains('menu-open')));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && body.classList.contains('menu-open')) { setOpen(false); toggle.focus(); }
    });
    window.addEventListener('resize', () => { if (window.innerWidth > 880) setOpen(false); });
  }

  /* ── Scroll reveals ── */
  const revealEls = document.querySelectorAll('[data-reveal], [data-reveal-lines]');
  if (!reduceMotion && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-in');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -8% 0px' });
    revealEls.forEach((el) => io.observe(el));
  } else {
    revealEls.forEach((el) => el.classList.add('is-in'));
  }

  /* ── Soft parallax for elements with data-parallax="0.15" ── */
  const parallaxEls = [...document.querySelectorAll('[data-parallax]')];
  if (parallaxEls.length && !reduceMotion) {
    let ticking = false;
    const update = () => {
      const vh = window.innerHeight;
      parallaxEls.forEach((el) => {
        const r = el.parentElement.getBoundingClientRect();
        if (r.bottom < 0 || r.top > vh) return;
        const speed = parseFloat(el.dataset.parallax) || 0.15;
        const offset = (r.top + r.height / 2 - vh / 2) * -speed;
        el.style.setProperty('--py', offset.toFixed(1) + 'px');
      });
      ticking = false;
    };
    window.addEventListener('scroll', () => {
      if (!ticking) { requestAnimationFrame(update); ticking = true; }
    }, { passive: true });
    update();
  }

  /* ── Cinematic page transitions between internal pages ── */
  if (!reduceMotion) {
    document.addEventListener('click', (e) => {
      const a = e.target.closest('a');
      if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      if (a.target === '_blank' || a.hasAttribute('download')) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin) return;
      if (url.pathname === location.pathname && url.hash) return; // in-page anchor
      e.preventDefault();
      body.classList.add('is-leaving');
      setTimeout(() => { location.href = url.href; }, 320);
    });
    // Coming back via the back button: make sure the page is visible again
    window.addEventListener('pageshow', (e) => {
      if (e.persisted) body.classList.remove('is-leaving');
    });
  }

  /* ── Scroll progress: a thin "fluid" bar filling across the top ── */
  const bar = document.createElement('div');
  bar.className = 'scroll-progress';
  bar.setAttribute('aria-hidden', 'true');
  body.appendChild(bar);
  const setBar = () => {
    const max = doc.scrollHeight - window.innerHeight;
    bar.style.transform = `scaleX(${max > 0 ? Math.min(1, window.scrollY / max) : 0})`;
  };
  window.addEventListener('scroll', setBar, { passive: true });
  window.addEventListener('resize', setBar);
  setBar();

  if (!reduceMotion) {
    /* ── Tap / click burst on every button and link: a little "pop" ── */
    const BURST = ['#a78bfa', '#e879f9', '#22d3ee'];
    document.addEventListener('pointerdown', (e) => {
      const el = e.target.closest('.btn-primary, .btn-ghost, .site-nav a, .mobile-menu a, .menu-toggle, .glass-card a, button, summary');
      if (!el || !document.body.animate) return;
      for (let i = 0; i < 12; i++) {
        const dot = document.createElement('i');
        dot.className = 'burst-dot';
        dot.style.left = e.clientX + 'px';
        dot.style.top = e.clientY + 'px';
        dot.style.background = BURST[i % 3];
        body.appendChild(dot);
        const ang = (i / 12) * Math.PI * 2 + Math.random() * 0.4;
        const dist = 26 + Math.random() * 36;
        dot.animate([
          { transform: 'translate(-50%, -50%) scale(1)', opacity: 1 },
          { transform: `translate(calc(-50% + ${(Math.cos(ang) * dist).toFixed(1)}px), calc(-50% + ${(Math.sin(ang) * dist).toFixed(1)}px)) scale(0)`, opacity: 0 },
        ], { duration: 520 + Math.random() * 220, easing: 'cubic-bezier(.16,1,.3,1)' }).onfinish = () => dot.remove();
      }
    }, { passive: true });

    /* ── Mouse users: glowing spotlight + 3D tilt on cards, magnetic buttons ── */
    if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
      document.querySelectorAll('.glass-card').forEach((card) => {
        if (card.querySelector('form, iframe, input, textarea') || card.id === 'instaEmbed') return;
        card.classList.add('is-reactive');
        const spot = document.createElement('span');
        spot.className = 'card-spot';
        spot.setAttribute('aria-hidden', 'true');
        card.appendChild(spot);
        if (card.parentElement) card.parentElement.style.perspective = '1200px';
        card.addEventListener('pointermove', (e) => {
          const r = card.getBoundingClientRect();
          const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
          card.style.setProperty('--mx', (px * 100).toFixed(1) + '%');
          card.style.setProperty('--my', (py * 100).toFixed(1) + '%');
          // tilt toward the cursor (axis-angle so it doesn't fight other transforms)
          const ax = -(py - 0.5), ay = px - 0.5;
          const ang = Math.min(6, Math.hypot(ax, ay) * 9);
          card.style.setProperty('--rot', `${ax.toFixed(3)} ${ay.toFixed(3)} 0 ${ang.toFixed(2)}deg`);
        });
        card.addEventListener('pointerleave', () => card.style.setProperty('--rot', '0 0 1 0deg'));
      });

      document.querySelectorAll('.btn-primary, .btn-ghost').forEach((btn) => {
        btn.addEventListener('pointermove', (e) => {
          const r = btn.getBoundingClientRect();
          btn.style.setProperty('--tx', ((e.clientX - r.left - r.width / 2) * 0.16).toFixed(1) + 'px');
          btn.style.setProperty('--ty', ((e.clientY - r.top - r.height / 2) * 0.22).toFixed(1) + 'px');
        });
        btn.addEventListener('pointerleave', () => {
          btn.style.setProperty('--tx', '0px');
          btn.style.setProperty('--ty', '0px');
        });
      });
    }
  }

  doc.classList.add('js-ready');
})();
