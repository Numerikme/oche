/* OCHE — cible SVG : géométrie officielle, détection de zone, fléchettes animées. */
(function () {
  const OCHE = (window.OCHE = window.OCHE || {});
  const NS = 'http://www.w3.org/2000/svg';
  const ORDER = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];
  // rayons en mm (cible officielle, rayon de jeu 170)
  const R = { ib: 3.175, ob: 7.95, ti: 99, to: 107, di: 162, dout: 170, num: 214 };
  const rad = (d) => (d * Math.PI) / 180;
  const P = (r, deg) => [r * Math.sin(rad(deg)), -r * Math.cos(rad(deg))];
  const f = (n) => Math.round(n * 100) / 100;

  const BLACK = '#1b1b1b', CREAM = '#efe2bf', RED = '#c8372d', GREEN = '#1f8a52';

  function sector(r0, r1, a0, a1) {
    const [x1, y1] = P(r1, a0), [x2, y2] = P(r1, a1), [x3, y3] = P(r0, a1), [x4, y4] = P(r0, a0);
    return `M${f(x1)} ${f(y1)}A${r1} ${r1} 0 0 1 ${f(x2)} ${f(y2)}L${f(x3)} ${f(y3)}A${r0} ${r0} 0 0 0 ${f(x4)} ${f(y4)}Z`;
  }
  const disc = (r) => `M${-r} 0A${r} ${r} 0 1 0 ${r} 0A${r} ${r} 0 1 0 ${-r} 0Z`;

  /* ----- art de la cible, défini une seule fois dans un <defs> global ----- */
  function artMarkup() {
    let s = '';
    s += `<circle r="238" fill="#0b0f0d"/>`;
    s += `<circle r="${R.num + 2}" fill="#121212" stroke="#b88a2e" stroke-width="2.2"/>`;
    for (let i = 0; i < 20; i++) {
      const a0 = i * 18 - 9, a1 = i * 18 + 9, even = i % 2 === 0;
      const single = even ? BLACK : CREAM, multi = even ? RED : GREEN;
      s += `<path d="${sector(R.ob, R.ti, a0, a1)}" fill="${single}"/>`;
      s += `<path d="${sector(R.to, R.di, a0, a1)}" fill="${single}"/>`;
      s += `<path d="${sector(R.ti, R.to, a0, a1)}" fill="${multi}"/>`;
      s += `<path d="${sector(R.di, R.dout, a0, a1)}" fill="${multi}"/>`;
      const [tx, ty] = P(192, i * 18);
      s += `<text x="${f(tx)}" y="${f(ty)}" class="bnum">${ORDER[i]}</text>`;
    }
    s += `<circle r="${R.ob}" fill="${GREEN}"/><circle r="${R.ib}" fill="${RED}"/>`;
    // fils
    let w = '';
    for (let i = 0; i < 20; i++) {
      const [x1, y1] = P(R.ob, i * 18 + 9), [x2, y2] = P(R.dout, i * 18 + 9);
      w += `M${f(x1)} ${f(y1)}L${f(x2)} ${f(y2)}`;
    }
    s += `<path d="${w}" stroke="#cfd3d6" stroke-width=".9" opacity=".75" fill="none"/>`;
    [R.ib, R.ob, R.ti, R.to, R.di, R.dout].forEach((r) => {
      s += `<circle r="${r}" fill="none" stroke="#cfd3d6" stroke-width="${r === R.dout ? 1.4 : 0.9}" opacity=".8"/>`;
    });
    s += `<circle r="${R.dout}" fill="url(#boardLight)"/>`;
    return s;
  }

  function buildDefs(svg) {
    svg.innerHTML = `<defs>
      <radialGradient id="boardLight" cx=".5" cy=".5" r=".5" fx=".36" fy=".28">
        <stop offset="0" stop-color="#fff" stop-opacity=".13"/><stop offset=".6" stop-color="#000" stop-opacity="0"/>
        <stop offset="1" stop-color="#000" stop-opacity=".34"/></radialGradient>
      <linearGradient id="brassG" x1="0" x2="1"><stop offset="0" stop-color="#7a5a18"/><stop offset=".45" stop-color="#f3d684"/><stop offset="1" stop-color="#6e5014"/></linearGradient>
      <g id="oche-art">${artMarkup()}</g></defs>`;
  }

  /* ----- étiquettes ----- */
  function label(h) {
    if (!h || h.m === 0) return 'Raté';
    if (h.n === 25) return h.m === 2 ? 'BULL' : '25';
    return ['', '', 'D', 'T'][h.m] + h.n;
  }
  function longLabel(h) {
    if (!h || h.m === 0) return 'Raté';
    if (h.n === 25) return h.m === 2 ? 'Bull' : '25';
    return ['', 'Simple', 'Double', 'Triple'][h.m] + ' ' + h.n;
  }

  /* ----- coordonnées (-240..240) → zone touchée ----- */
  function zoneAt(x, y) {
    const r = Math.hypot(x, y);
    let ang = (Math.atan2(x, -y) * 180) / Math.PI;
    if (ang < 0) ang += 360;
    const idx = Math.floor(((ang + 9) % 360) / 18);
    const n = ORDER[idx];
    let h;
    if (r <= R.ib) h = { n: 25, m: 2, ring: 'ib' };
    else if (r <= R.ob) h = { n: 25, m: 1, ring: 'ob' };
    else if (r <= R.ti) h = { n, m: 1, ring: 'si' };
    else if (r <= R.to) h = { n, m: 3, ring: 't' };
    else if (r <= R.di) h = { n, m: 1, ring: 'so' };
    else if (r <= R.dout) h = { n, m: 2, ring: 'd' };
    else h = { n: 0, m: 0, ring: 'miss' };
    h.idx = idx;
    h.x = f(x);
    h.y = f(y);
    return h;
  }

  function zonePath(h) {
    if (h.ring === 'ib') return disc(R.ib);
    if (h.ring === 'ob') return disc(R.ob) + disc(R.ib);
    const a0 = h.idx * 18 - 9, a1 = h.idx * 18 + 9;
    const [r0, r1] = { si: [R.ob, R.ti], t: [R.ti, R.to], so: [R.to, R.di], d: [R.di, R.dout] }[h.ring];
    return sector(r0, r1, a0, a1);
  }

  /* ----- fléchette (pointe en 0,0) ----- */
  function dartMarkup(color) {
    return `<path d="M0 0L-.9 7L.9 7Z" fill="#d7dade"/>
      <rect x="-2.7" y="6" width="5.4" height="23" rx="2.2" fill="url(#brassG)"/>
      <path d="M-2.7 11H2.7M-2.7 15H2.7M-2.7 19H2.7M-2.7 23H2.7" stroke="#0005" stroke-width=".7"/>
      <rect x="-1.1" y="28" width="2.2" height="11" fill="#2b2b2b"/>
      <path d="M0 37L-10.5 57L-3.5 63L0 52L3.5 63L10.5 57Z" fill="${color}" stroke="#0009" stroke-width=".8" stroke-linejoin="round"/>
      <path d="M0 37L0 55" stroke="#fff7" stroke-width=".9"/>`;
  }

  const ease = { out: (t) => 1 - Math.pow(1 - t, 3), in: (t) => t * t * t };

  class Board {
    constructor(svg) {
      this.svg = svg;
      svg.setAttribute('viewBox', '-240 -240 480 480');
      svg.classList.add('board');
      svg.innerHTML = `<use href="#oche-art"/><g class="fx"></g><g class="darts"></g>`;
      this.fx = svg.querySelector('.fx');
      this.layer = svg.querySelector('.darts');
      this.darts = [];
    }
    toBoard(cx, cy) {
      const r = this.svg.getBoundingClientRect();
      return [((cx - r.left) / r.width) * 480 - 240, ((cy - r.top) / r.height) * 480 - 240];
    }
    toScreen(x, y) {
      const r = this.svg.getBoundingClientRect();
      return [r.left + ((x + 240) / 480) * r.width, r.top + ((y + 240) / 480) * r.height];
    }
    addDart(x, y, color, { animate = true, onLand } = {}) {
      x = Math.max(-232, Math.min(232, x));
      y = Math.max(-232, Math.min(232, y));
      const g = document.createElementNS(NS, 'g');
      const rot = Math.random() * 22 - 11;
      g.setAttribute('transform', `translate(${x} ${y}) rotate(${rot})`);
      const inner = document.createElementNS(NS, 'g');
      inner.innerHTML = dartMarkup(color);
      g.appendChild(inner);
      this.layer.appendChild(g);
      this.darts.push(g);
      if (!animate) { onLand && onLand(); return g; }
      const T1 = 260, T2 = 520, t0 = performance.now();
      inner.setAttribute('opacity', 0);
      const land = () => { if (g._landed) return; g._landed = true; inner.setAttribute('opacity', 1); onLand && onLand(); };
      setTimeout(land, T1 + 40); // filet de sécurité si l'onglet est en arrière-plan
      const step = (now) => {
        const t = now - t0;
        if (t < T1) {
          const k = ease.in(t / T1);
          inner.setAttribute('transform', `translate(0 ${f((1 - k) * 150)}) scale(${f(1 + (1 - k) * 1.5)})`);
          inner.setAttribute('opacity', Math.min(1, t / 70));
          requestAnimationFrame(step);
        } else if (t < T1 + T2) {
          land();
          const k = (t - T1) / T2;
          inner.setAttribute('transform', `rotate(${f(Math.sin(k * 26) * 5 * Math.pow(1 - k, 2))})`);
          requestAnimationFrame(step);
        } else inner.setAttribute('transform', '');
      };
      requestAnimationFrame(step);
      return g;
    }
    clearDarts(animated = true) {
      const list = this.darts.splice(0);
      if (!animated || !list.length) { list.forEach((g) => g.remove()); return Promise.resolve(); }
      return new Promise((res) => {
        list.forEach((g, i) => {
          const inner = g.firstChild, t0 = performance.now() + i * 70;
          const step = (now) => {
            const k = Math.max(0, Math.min(1, (now - t0) / 260));
            if (k > 0) {
              inner.setAttribute('transform', `translate(0 ${f(ease.out(k) * 60)}) scale(${f(1 + ease.out(k) * 1.2)})`);
              inner.setAttribute('opacity', 1 - k);
            }
            if (k < 1) requestAnimationFrame(step);
            else { g.remove(); if (g === list[list.length - 1]) res(); }
          };
          requestAnimationFrame(step);
        });
      });
    }
    flash(h) {
      if (h.ring === 'miss') return;
      const p = document.createElementNS(NS, 'path');
      p.setAttribute('d', zonePath(h));
      p.setAttribute('fill-rule', 'evenodd');
      p.setAttribute('class', 'zone-flash');
      this.fx.appendChild(p);
      setTimeout(() => p.remove(), 1000);
    }
    ripple(x, y, color) {
      const c = document.createElementNS(NS, 'circle');
      c.setAttribute('cx', x); c.setAttribute('cy', y); c.setAttribute('r', 30);
      c.setAttribute('class', 'ripple');
      c.setAttribute('stroke', color);
      this.fx.appendChild(c);
      setTimeout(() => c.remove(), 700);
    }
    setHover(h) {
      if (!this.hov) {
        this.hov = document.createElementNS(NS, 'path');
        this.hov.setAttribute('class', 'zone-hover');
        this.hov.setAttribute('fill-rule', 'evenodd');
        this.fx.appendChild(this.hov);
      }
      this.hov.setAttribute('d', h && h.ring !== 'miss' ? zonePath(h) : '');
    }
  }

  OCHE.Board = Board;
  OCHE.boardUtil = { buildDefs, zoneAt, label, longLabel, ORDER, R };
})();
