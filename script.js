(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  const rules = $$('.rule');
  const laws = $$('.law');
  const navLinks = $$('.nav-link');
  const input = $('#q');
  const bar = $('#resultBar');
  const empty = $('#empty');
  const toast = $('#toast');
  const side = $('#side');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- toast ---------- */
  let tt;
  const say = (m) => {
    toast.textContent = m;
    toast.classList.add('show');
    clearTimeout(tt);
    tt = setTimeout(() => toast.classList.remove('show'), 1800);
  };

  /* ---------- Arabic-aware normalisation (keeps 1:1 index map) ---------- */
  const MAP = { 'أ': 'ا', 'إ': 'ا', 'آ': 'ا', 'ٱ': 'ا', 'ى': 'ي', 'ئ': 'ي', 'ة': 'ه', 'ؤ': 'و' };
  const DIAC = /[ً-ٰٟـ]/;
  const norm = (s) => {
    let out = '';
    const idx = [];
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (DIAC.test(c)) continue;
      out += (MAP[c] || c).toLowerCase();
      idx.push(i);
    }
    return { out, idx };
  };

  /* ---------- search index ---------- */
  const store = rules.map((el) => {
    const title = $('.rule-title', el);
    const body = $('.rule-body', el);
    return {
      el, title, body,
      tHTML: title.innerHTML, bHTML: body.innerHTML,
      hay: norm(title.textContent + ' \n ' + body.textContent).out,
    };
  });

  const clearMarks = (it) => { it.title.innerHTML = it.tHTML; it.body.innerHTML = it.bHTML; };

  const highlight = (root, q) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const n of nodes) {
      const { out, idx } = norm(n.nodeValue);
      let from = 0, hit, last = 0;
      const frag = document.createDocumentFragment();
      let any = false;
      while ((hit = out.indexOf(q, from)) !== -1) {
        const s = idx[hit];
        const e = idx[Math.min(hit + q.length - 1, idx.length - 1)] + 1;
        frag.append(n.nodeValue.slice(last, s));
        const m = document.createElement('mark');
        m.textContent = n.nodeValue.slice(s, e);
        frag.append(m);
        last = e; from = hit + q.length; any = true;
      }
      if (any) { frag.append(n.nodeValue.slice(last)); n.replaceWith(frag); }
    }
  };

  let savedOpen = null;
  let timer;
  const run = () => {
    const raw = input.value.trim();
    const q = norm(raw).out.trim();
    if (!q) {
      store.forEach((it) => { clearMarks(it); it.el.hidden = false; });
      laws.forEach((l) => (l.hidden = false));
      navLinks.forEach((a) => { const n = $('.nav-n', a); n.textContent = n.dataset.total; a.classList.remove('dim'); });
      if (savedOpen) { store.forEach((it, i) => (it.el.open = savedOpen[i])); savedOpen = null; }
      bar.hidden = true; empty.hidden = true;
      return;
    }
    if (!savedOpen) savedOpen = store.map((it) => it.el.open);
    let total = 0;
    store.forEach((it) => {
      clearMarks(it);
      const ok = it.hay.includes(q);
      it.el.hidden = !ok;
      if (ok) {
        total++;
        it.el.open = true;
        highlight(it.title, q);
        highlight(it.body, q);
      }
    });
    laws.forEach((l, i) => {
      const c = $$('.rule:not([hidden])', l).length;
      l.hidden = c === 0;
      const a = navLinks[i];
      $('.nav-n', a).textContent = c;
      a.classList.toggle('dim', c === 0);
    });
    bar.hidden = total === 0;
    bar.innerHTML = `تم العثور على <b>${total}</b> ${total === 1 ? 'بند' : 'بنود'} تحتوي على «${raw.replace(/[<>&]/g, '')}»`;
    empty.hidden = total !== 0;
  };
  input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(run, 120); });

  const focusSearch = () => { input.focus(); input.select(); scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' }); };
  $('#focusSearch').addEventListener('click', () => {
    $('.layout').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' });
    setTimeout(() => input.focus(), 350);
  });
  addEventListener('keydown', (e) => {
    const typing = /^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName);
    if ((e.key === '/' && !typing) || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k')) { e.preventDefault(); input.focus(); input.select(); }
    else if (e.key === 'Escape') {
      if (side.classList.contains('open')) closeMenu();
      else if (document.activeElement === input || input.value) { input.value = ''; run(); input.blur(); }
    }
  });

  /* ---------- accordion tools ---------- */
  $('#expandAll').addEventListener('click', () => store.forEach((it) => !it.el.hidden && (it.el.open = true)));
  $('#collapseAll').addEventListener('click', () => store.forEach((it) => (it.el.open = false)));
  $('#printBtn').addEventListener('click', () => print());
  addEventListener('beforeprint', () => { savedPrint = rules.map((r) => r.open); rules.forEach((r) => (r.open = true)); });
  addEventListener('afterprint', () => savedPrint && rules.forEach((r, i) => (r.open = savedPrint[i])));
  let savedPrint;

  /* ---------- copy link ---------- */
  document.addEventListener('click', async (e) => {
    const b = e.target.closest('.copy');
    if (!b) return;
    e.preventDefault(); e.stopPropagation();
    const url = location.href.split('#')[0] + '#' + b.dataset.id;
    try { await navigator.clipboard.writeText(url); say('تم نسخ رابط البند'); }
    catch { const t = document.createElement('textarea'); t.value = url; document.body.append(t); t.select(); try { document.execCommand('copy'); say('تم نسخ رابط البند'); } catch { say(url); } t.remove(); }
    history.replaceState(null, '', '#' + b.dataset.id);
  });

  /* ---------- deep link ---------- */
  const goHash = () => {
    const id = decodeURIComponent(location.hash.slice(1));
    const el = id && document.getElementById(id);
    if (!el) return;
    if (el.matches('.rule')) {
      el.open = true;
      setTimeout(() => { el.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' }); el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }, 80);
    }
  };
  addEventListener('hashchange', goHash);
  goHash();

  /* ---------- scroll: progress, to-top, scroll-spy ---------- */
  const prog = $('#progress'), totop = $('#toTop');
  let tick = false;
  const onScroll = () => {
    if (tick) return; tick = true;
    requestAnimationFrame(() => {
      const h = document.documentElement.scrollHeight - innerHeight;
      prog.style.transform = `scaleX(${h > 0 ? Math.min(1, scrollY / h) : 0})`;
      totop.classList.toggle('show', scrollY > 700);
      tick = false;
    });
  };
  addEventListener('scroll', onScroll, { passive: true }); onScroll();
  totop.addEventListener('click', () => scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' }));

  const setActive = (id) => {
    navLinks.forEach((a) => {
      const on = a.dataset.target === id;
      a.classList.toggle('active', on);
      if (on && !side.classList.contains('open')) {
        const nav = $('#nav'); const r = a.getBoundingClientRect(), nr = nav.getBoundingClientRect();
        if (r.top < nr.top || r.bottom > nr.bottom) nav.scrollTop += r.top - nr.top - nr.height / 3;
      }
    });
  };
  const spy = new IntersectionObserver((ents) => {
    ents.forEach((en) => en.isIntersecting && setActive(en.target.id));
  }, { rootMargin: '-25% 0px -65% 0px' });
  laws.forEach((l) => spy.observe(l));

  /* ---------- reveal ---------- */
  if ('IntersectionObserver' in window && !reduce) {
    const rv = new IntersectionObserver((ents) => ents.forEach((en) => {
      if (en.isIntersecting) { en.target.classList.add('in'); rv.unobserve(en.target); }
    }), { threshold: 0.04 });
    laws.forEach((l) => { l.classList.add('reveal'); rv.observe(l); });
  }

  /* ---------- hero counters ---------- */
  $$('[data-count]').forEach((el) => {
    const to = +el.dataset.count; if (reduce) return;
    const t0 = performance.now(), d = 1100;
    const f = (t) => { const p = Math.min(1, (t - t0) / d); el.textContent = Math.round(to * (1 - Math.pow(1 - p, 3))); if (p < 1) requestAnimationFrame(f); };
    requestAnimationFrame(f);
  });

  /* ---------- mobile drawer ---------- */
  const menuBtn = $('#menuBtn');
  function openMenu() { side.classList.add('open'); document.body.classList.add('menu-open'); menuBtn.setAttribute('aria-expanded', 'true'); }
  function closeMenu() { side.classList.remove('open'); document.body.classList.remove('menu-open'); menuBtn.setAttribute('aria-expanded', 'false'); }
  menuBtn.addEventListener('click', openMenu);
  $('#closeMenu').addEventListener('click', closeMenu);
  $('#backdrop').addEventListener('click', closeMenu);
  navLinks.forEach((a) => a.addEventListener('click', closeMenu));
})();
