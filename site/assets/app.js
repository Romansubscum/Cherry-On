/* CherryOn Finance: the scrolled film and the page around it.
   Plain JavaScript. Nothing here is needed for the still page to be complete. */
(() => {
  'use strict';

  const root = document.documentElement;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const smooth = (p, e0, e1) => { const t = clamp((p - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };

  /* The five conditions that give a visitor the still hero instead of the scrub.
     They are decided live: every one of them listens for change. */
  const GATES = [
    '(max-width: 720px)',
    '(orientation: portrait) and (max-width: 1024px)',
    '(orientation: portrait) and (pointer: coarse)',
    '(orientation: landscape) and (pointer: coarse) and (max-height: 560px)',
    '(prefers-reduced-motion: reduce)'
  ];
  const MQLS = GATES.map(q => matchMedia(q));
  const RM = matchMedia('(prefers-reduced-motion: reduce)');

  const VIDEO_URL = 'assets/hero-scrub.mp4';
  const VIDEO_BYTES = 14000000;          // fallback for the loading ring when Content-Length is missing
  const POSTER_URL = 'assets/hero-poster.jpg';
  const T_END = 35;                      // the authored length of the film in seconds; times below are on this clock

  const video = $('#hero');
  const env = $('.env');
  const poster = $('.poster');
  const ring = $('.ring');
  const ringFill = $('.ring-fill');
  const marksEl = $('.marks');
  const journey = $('.journey');
  const nav = $('#nav');

  /* ---------------------------------------------------------------
     Text splitting: word and character spans, built once, seeded so every load is identical
     --------------------------------------------------------------- */
  function rng(seed) {
    let s = seed >>> 0;
    return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  }
  function splitText(el, seed, spread) {
    const text = el.textContent.trim();
    const r = rng(seed);
    const words = text.split(' ');
    const total = text.replace(/ /g, '').length;
    let idx = 0;
    el.textContent = '';
    words.forEach((word, wi) => {
      const w = document.createElement('span');
      w.className = 'w';
      for (const ch of word) {
        const c = document.createElement('span');
        c.className = 'c';
        c.textContent = ch;
        c.style.setProperty('--th', (idx / total * spread + r() * 0.06).toFixed(3));
        idx++;
        w.appendChild(c);
      }
      el.appendChild(w);
      if (wi < words.length - 1) el.appendChild(document.createTextNode(' '));
    });
  }
  $$('[data-split]').forEach(el => splitText(el, +el.dataset.split || 7, +el.dataset.spread || 0.5));

  /* The approach statement arrives like focus: two stacked copies crossfade, the soft one carries a static blur */
  $$('[data-focus]').forEach(el => {
    const text = el.textContent;
    el.textContent = '';
    const sharp = document.createElement('span');
    sharp.className = 'lede-sharp';
    sharp.textContent = text;
    const soft = document.createElement('span');
    soft.className = 'lede-soft';
    soft.setAttribute('aria-hidden', 'true');
    soft.textContent = text;
    el.append(sharp, soft);
  });

  /* ---------------------------------------------------------------
     Layout of the film: when does the footage reach each moment of the story
     --------------------------------------------------------------- */
  let vh = innerHeight;
  let markers = [[0, 0], [1, T_END]];     // [scrollY, authored seconds]
  const bands = $$('.band').map(el => ({
    el,
    a: +el.dataset.a,
    b: +el.dataset.b,
    ramp: +(el.dataset.ramp || 0.22),
    first: el.hasAttribute('data-first'),
    op: -1,
    k: -1,
    live: null
  }));

  /* Where the crystal sits in the frame over time: x%, y%, height%, marks opacity.
     These are authored against the keyframes; app.js converts them to screen pixels. */
  const CRYSTAL = [
    [0, 50, 50, 38, 0],
    [5.2, 50, 50, 38, 0],
    [6.0, 50, 50, 38, 0.9],
    [9.0, 50, 50, 38, 0.9],
    [10.4, 50, 50, 38, 0],
    [14, 50, 50, 38, 0],
    [22.6, 66, 50, 44, 0],
    [25.0, 68, 50, 44, 0.9],
    [26.2, 68, 49, 44, 0.75],
    [28.2, 63, 40, 36, 0],       // out of focus: nothing left to measure
    [30.0, 62, 32, 22, 0],
    [32.5, 54, 36, 24, 0],
    [35.0, 50, 38, 26, 0.8]
  ];

  function measure() {
    vh = innerHeight;
    const jt = journey ? journey.getBoundingClientRect().top + scrollY : 0;
    const m = [
      [jt, 0],
      [jt + 1.5 * vh, 6],
      [jt + 3.2 * vh, 8.5],
      [jt + 4.1 * vh, 11.5]
    ];
    $$('[data-vt]').forEach(el => m.push([el.getBoundingClientRect().top + scrollY - vh * 0.5, +el.dataset.vt]));
    const maxY = Math.max(1, document.documentElement.scrollHeight - vh);
    m.push([maxY, T_END]);
    m.sort((p, q) => p[0] - q[0]);
    markers = [];
    let lastY = -Infinity, lastT = -1;
    for (const [y, t] of m) {
      if (y > lastY + 1 && t >= lastT) { markers.push([y, t]); lastY = y; lastT = t; }
    }
    if (markers.length < 2) markers = [[0, 0], [maxY, T_END]];
    const cta = $('#access');
    if (cta) {
      const bottom = cta.getBoundingClientRect().bottom + scrollY;
      fadeA = bottom - vh;            // the CTA section's last line meets the bottom of the screen: the final composition
      fadeB = fadeA + vh * 0.5;       // then the footer rises and the crystal steps back
    }
  }

  function timeAt(y) {
    if (y <= markers[0][0]) return markers[0][1];
    for (let i = 1; i < markers.length; i++) {
      if (y <= markers[i][0]) {
        const [y0, t0] = markers[i - 1];
        const [y1, t1] = markers[i];
        return t0 + (t1 - t0) * ((y - y0) / (y1 - y0));
      }
    }
    return markers[markers.length - 1][1];
  }

  function crystalAt(t) {
    if (t <= CRYSTAL[0][0]) return CRYSTAL[0].slice(1);
    for (let i = 1; i < CRYSTAL.length; i++) {
      if (t <= CRYSTAL[i][0]) {
        const a = CRYSTAL[i - 1], b = CRYSTAL[i];
        const f = (t - a[0]) / (b[0] - a[0] || 1);
        return [1, 2, 3, 4].map(n => a[n] + (b[n] - a[n]) * f);
      }
    }
    return CRYSTAL[CRYSTAL.length - 1].slice(1);
  }

  /* ---------------------------------------------------------------
     Scrub engine: ease toward the target, one seek in flight, write to the DOM only on change
     --------------------------------------------------------------- */
  let scrubOn = false;
  let forceStatic = false;
  let heroInit = false;
  let videoReady = false;
  let target = 0;        // 0..1 progress through the film
  let shown = 0;
  let rafId = null;
  let lastTick = 0;
  let loadK = 0;         // band one's one-time assembly on arrival
  let seekBusy = false;
  let pendingTime = null;
  let lastMark = '';
  let fadeA = 0, fadeB = 1;   // scroll range over which the film steps aside for the footer
  let envOp = -1;

  function requestSeek(t) {
    if (!video.duration || !isFinite(video.duration)) return;
    t = clamp(t, 0, Math.max(0, video.duration - 0.001));
    if (seekBusy) { pendingTime = t; return; }
    if (Math.abs(video.currentTime - t) < 0.004) return;
    seekBusy = true;
    video.currentTime = t;
  }
  video.addEventListener('seeked', () => {
    seekBusy = false;
    if (pendingTime !== null) {
      const t = pendingTime;
      pendingTime = null;
      requestSeek(t);
    }
  });
  video.addEventListener('error', () => {
    seekBusy = false;
    pendingTime = null;
    if (!videoReady && heroInit) failVideo();
  });

  function tick(now) {
    const dt = Math.min(100, now - (lastTick || now));
    lastTick = now;
    const k = 0.16;
    shown += (target - shown) * (1 - Math.pow(1 - k, dt / 16.667));
    if (Math.abs(target - shown) < 0.0004) {
      shown = target;
      rafId = null;
      lastTick = 0;
    } else {
      rafId = requestAnimationFrame(tick);
    }
    requestSeek(shown * video.duration);
    updateMarks(shown * T_END);
  }

  function onScroll() {
    const y = scrollY;
    target = timeAt(y) / T_END;
    updateBands(y);
    updateEnvFade(y);
    if (rafId === null) rafId = requestAnimationFrame(tick);
  }

  function updateEnvFade(y) {
    const op = 1 - 0.9 * smooth(y, fadeA, fadeB);
    if (Math.abs(op - envOp) < 0.01) return;
    envOp = op;
    env.style.opacity = op.toFixed(2);
    marksEl.style.setProperty('--fade', op.toFixed(2));
  }

  /* Hero bands: opacity eased at both edges, entrance driven by --k, all writes delta-gated */
  function updateBands(y) {
    const sy = y / vh;
    for (const b of bands) {
      const f = Math.min(0.2, (b.b - b.a) / 3);
      let op = smooth(sy, b.a, b.a + f) * (1 - smooth(sy, b.b - f, b.b));
      let k = clamp((sy - b.a) / b.ramp, 0, 1);
      if (b.first) {                 // the opening band starts settled and assembles itself on arrival
        op = 1 - smooth(sy, b.b - f, b.b);
        k = Math.max(k, loadK);
      }
      if (Math.abs(op - b.op) > 0.004 || (op === 0) !== (b.op === 0)) {
        b.op = op;
        b.el.style.opacity = op.toFixed(3);
        b.el.style.visibility = op < 0.01 ? 'hidden' : 'visible';
      }
      if (Math.abs(k - b.k) > 0.008 || (k === 1) !== (b.k === 1)) {
        b.k = k;
        b.el.style.setProperty('--k', k.toFixed(3));
      }
      const live = op > 0.5;
      if (live !== b.live) { b.live = live; b.el.classList.toggle('live', live); }
    }
  }

  /* The registration marks follow the crystal, so the page looks measured rather than decorated */
  function updateMarks(t) {
    if (!marksEl) return;
    const [x, y, h, a] = crystalAt(t);
    const W = innerWidth, H = innerHeight;
    const sc = Math.max(W / 1920, H / 1080);          // object-fit: cover
    const cx = W / 2 + (x / 100 * 1920 - 960) * sc;
    const cy = H / 2 + (y / 100 * 1080 - 540) * sc;
    const size = h / 100 * 1080 * sc * 1.3;
    const key = Math.round(cx) + ',' + Math.round(cy) + ',' + Math.round(size) + ',' + a.toFixed(2);
    if (key === lastMark) return;
    lastMark = key;
    marksEl.style.transform = 'translate3d(' + (cx - 150).toFixed(1) + 'px,' + (cy - 150).toFixed(1) + 'px,0) scale(' + (size / 300).toFixed(3) + ')';
    marksEl.style.opacity = (a * (envOp < 0 ? 1 : envOp)).toFixed(2);
  }

  function loadRamp() {
    const t0 = performance.now();
    const step = now => {
      const p = clamp((now - t0) / 1700, 0, 1);
      loadK = 1 - Math.pow(1 - p, 3);
      if (scrubOn) updateBands(scrollY);
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  /* ---------------------------------------------------------------
     Loading the film: poster first, then a streamed Blob behind an honest ring
     --------------------------------------------------------------- */
  let blobStarted = false;
  function startBlobFetch() {
    if (blobStarted) return;
    blobStarted = true;
    loadHeroBlob().catch(failVideo);
  }

  async function loadHeroBlob() {
    const ctrl = new AbortController();
    let watchdog = setTimeout(() => ctrl.abort(), 20000);
    const res = await fetch(VIDEO_URL, { priority: 'low', signal: ctrl.signal });
    if (!res.ok) throw new Error('video ' + res.status);
    const total = Number(res.headers.get('Content-Length')) || VIDEO_BYTES;
    const reader = res.body.getReader();
    const chunks = [];
    let got = 0, lastRing = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      clearTimeout(watchdog);
      watchdog = setTimeout(() => ctrl.abort(), 20000);
      chunks.push(value);
      got += value.length;
      const frac = Math.min(1, got / total);
      const now = performance.now();
      if (now - lastRing > 100 || frac === 1) {
        lastRing = now;
        ring.style.setProperty('--ld', Math.round(126 * (1 - frac)));
      }
    }
    clearTimeout(watchdog);
    ring.style.setProperty('--ld', 0);
    video.preload = 'auto';
    video.src = URL.createObjectURL(new Blob(chunks, { type: 'video/mp4' }));
    video.load();
    video.addEventListener('loadedmetadata', () => {
      videoReady = true;
      shown = target;
      requestSeek(shown * video.duration);
      env.classList.add('video-ready');
      root.classList.add('film');
    }, { once: true });
  }

  function failVideo() {
    if (forceStatic) return;
    forceStatic = true;
    root.classList.remove('film');
    applyMode();
  }

  function initHeroOnce() {
    if (heroInit) return;
    heroInit = true;
    poster.style.backgroundImage = "url('" + POSTER_URL + "')";
    const img = new Image();
    img.onload = img.onerror = startBlobFetch;      // the poster wins the bandwidth race, or has failed
    img.src = POSTER_URL;
    setTimeout(startBlobFetch, 4000);
  }

  /* ---------------------------------------------------------------
     Modes: the still page is the default; the film is an enhancement
     --------------------------------------------------------------- */
  function loadStaticImages() {
    $$('img[data-src]').forEach(img => {
      if (img.getAttribute('src')) return;
      img.addEventListener('error', () => img.classList.add('missing'), { once: true });
      img.src = img.dataset.src;
    });
  }

  function clearBandStyles() {
    bands.forEach(b => {
      b.el.style.removeProperty('opacity');
      b.el.style.removeProperty('visibility');
      b.el.style.removeProperty('--k');
      b.el.classList.remove('live');
      b.op = -1; b.k = -1; b.live = null;
    });
  }

  function enableScrub() {
    if (scrubOn) return;
    scrubOn = true;
    root.classList.add('scrub');
    root.classList.remove('static');
    measure();
    initHeroOnce();
    addEventListener('scroll', onScroll, { passive: true });
    bands.forEach(b => { b.op = -1; b.k = -1; b.live = null; });
    lastMark = '';
    onScroll();
    if (loadK < 1) loadRamp();
  }

  function disableScrub() {
    const wasOn = scrubOn;
    scrubOn = false;
    root.classList.remove('scrub');
    root.classList.add('static');
    if (wasOn) {
      removeEventListener('scroll', onScroll);
      if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; lastTick = 0; }
      clearBandStyles();
      env.style.removeProperty('opacity');
      envOp = -1;
    }
    loadStaticImages();
  }

  function applyMode() {
    if (forceStatic || MQLS.some(m => m.matches)) disableScrub();
    else enableScrub();
  }
  MQLS.forEach(m => m.addEventListener('change', applyMode));

  /* ---------------------------------------------------------------
     The page around the film
     --------------------------------------------------------------- */
  // facet glint: one angle, driven by scroll, written only when it changes
  let ga = -1, glintQueued = false;
  function setGlint() {
    glintQueued = false;
    if (RM.matches) return;
    const a = Math.round((scrollY * 0.07) % 360);
    if (a !== ga) { ga = a; root.style.setProperty('--ga', a + 'deg'); }
  }
  function onAnyScroll() {
    if (!glintQueued) { glintQueued = true; requestAnimationFrame(setGlint); }
    nav.classList.toggle('scrolled', scrollY > 12);
  }
  addEventListener('scroll', onAnyScroll, { passive: true });

  // numbers: count up once when they arrive; the finished text is already in the HTML
  function parseCount(el) {
    const m = el.textContent.trim().match(/^([^\d]*)([\d.,]+)(.*)$/);
    if (!m) return null;
    const num = parseFloat(m[2].replace(/,/g, ''));
    const dec = (m[2].split('.')[1] || '').length;
    return { prefix: m[1], num, dec, suffix: m[3], final: el.textContent.trim() };
  }
  const counters = $$('[data-count]').map(el => ({ el, spec: parseCount(el), ran: false })).filter(c => c.spec);
  function runCounter(c) {
    if (c.ran) return;
    c.ran = true;
    const { prefix, num, dec, suffix, final } = c.spec;
    if (RM.matches) { c.el.textContent = final; return; }
    const t0 = performance.now(), dur = 1500;
    let last = '';
    const step = now => {
      const p = clamp((now - t0) / dur, 0, 1);
      const e = 1 - Math.pow(1 - p, 4);
      const text = p === 1 ? final : prefix + (num * e).toFixed(dec) + suffix;
      if (text !== last) { last = text; c.el.textContent = text; }
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  if (!RM.matches) counters.forEach(c => { c.el.textContent = c.spec.prefix + (0).toFixed(c.spec.dec) + c.spec.suffix; });

  // entrances: one class, staggered by --i, delays retired afterwards so hovers never lag
  const revealEls = $$('[data-reveal]');
  function pinFinalStates() {
    revealEls.forEach(el => el.classList.add('in', 'done'));
    counters.forEach(c => { c.ran = true; c.el.textContent = c.spec.final; });
  }
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (!e.isIntersecting) return;
        const el = e.target;
        io.unobserve(el);
        el.classList.add('in');
        setTimeout(() => el.classList.add('done'), 2200);
        counters.filter(c => el.contains(c.el)).forEach(runCounter);
      });
    }, { threshold: 0.18, rootMargin: '0px 0px -6% 0px' });
    revealEls.forEach(el => io.observe(el));
  } else {
    pinFinalStates();
  }
  if (RM.matches) pinFinalStates();
  RM.addEventListener('change', e => { if (e.matches) pinFinalStates(); });

  // anchors inside the film: jump, and let the eased scrub catch up
  $$('a[href^="#"]').forEach(a => {
    a.addEventListener('click', e => {
      const id = a.getAttribute('href');
      if (id.length < 2) return;
      const dest = $(id);
      if (!dest) return;
      e.preventDefault();
      const y = dest.getBoundingClientRect().top + scrollY - (scrubOn ? 0 : nav.offsetHeight);
      scrollTo({ top: Math.max(0, y), behavior: RM.matches ? 'auto' : 'smooth' });
      history.replaceState(null, '', id);
      dest.setAttribute('tabindex', '-1');
      dest.focus({ preventScroll: true });
    });
  });

  // pause every loop while the tab is hidden
  document.addEventListener('visibilitychange', () => document.body.classList.toggle('paused', document.hidden));

  // keep the film's timeline honest when the window changes
  let resizeTimer = 0;
  addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (scrubOn) { measure(); lastMark = ''; onScroll(); }
    }, 120);
  });
  addEventListener('load', () => { if (scrubOn) { measure(); onScroll(); } });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (scrubOn) { measure(); onScroll(); } });

  /* go */
  onAnyScroll();
  applyMode();
})();
