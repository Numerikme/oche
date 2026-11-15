/* OCHE — mode caméra : calibrage de la cible, détection des fléchettes par comparaison d'images.
   Principe :
   1. On pose 4 repères sur la cible (bout des fils du double) → homographie image ⇄ plan de la cible (en mm).
   2. On garde une image de référence de la cible vide et une image après chaque fléchette.
   3. Quand l'image est stable, tout ce qui a changé par rapport à la dernière image est une fléchette (ou un retrait).
   4. La pointe est l'extrémité du bloc la plus proche de la caméra : une fléchette dépasse de la cible, donc dans le plan
      de la cible son corps est étiré à l'opposé de la caméra, et seule la pointe touche vraiment la cible. */
(function () {
  const O = (window.OCHE = window.OCHE || {});
  const U = O.boardUtil;
  const $ = (s, r = document) => r.querySelector(s);
  const R = 170;
  const P = (r, deg) => [r * Math.sin((deg * Math.PI) / 180), -r * Math.cos((deg * Math.PI) / 180)];

  /* ---------- homographie ---------- */
  function solveH(src, dst) {
    const A = [];
    for (let i = 0; i < 4; i++) {
      const [x, y] = src[i], [u, v] = dst[i];
      A.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
      A.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
    }
    const n = 8;
    for (let c = 0; c < n; c++) {
      let p = c;
      for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
      if (Math.abs(A[p][c]) < 1e-12) return null;
      [A[c], A[p]] = [A[p], A[c]];
      for (let r = 0; r < n; r++) {
        if (r === c) continue;
        const f = A[r][c] / A[c][c];
        for (let k = c; k <= n; k++) A[r][k] -= f * A[c][k];
      }
    }
    const h = A.map((row, i) => row[n] / row[i]);
    h.push(1);
    return h;
  }
  function warp(h, x, y) {
    const w = h[6] * x + h[7] * y + h[8];
    return [(h[0] * x + h[1] * y + h[2]) / w, (h[3] * x + h[4] * y + h[5]) / w];
  }

  /* ---------- détecteur ---------- */
  const FEET = { top: [0, -600], bottom: [0, 600], left: [-600, 0], right: [600, 0], front: [0, 0] };

  class Detector {
    /** @param Hib homographie image(px, résolution de traitement) → cible (mm) */
    constructor(w, h, Hib, pos, thr = 28) {
      this.w = w; this.h = h; this.foot = FEET[pos] || FEET.top; this.thr = thr;
      const n = w * h;
      this.BX = new Float32Array(n); this.BY = new Float32Array(n); this.mask = new Uint8Array(n);
      let mc = 0;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = y * w + x, [X, Y] = warp(Hib, x, y);
        this.BX[i] = X; this.BY[i] = Y;
        if (Math.hypot(X, Y) <= 250) { this.mask[i] = 1; mc++; }
      }
      this.maskCount = mc;
      this.minArea = Math.max(10, Math.round(16 * Math.pow(w / 480, 2)));
      this.maxArea = Math.round(0.012 * mc);
      this.reset();
    }
    reset() {
      this.prev = null; this.ref = null; this.empty = null;
      this.lastMotion = -1e9; this.dirty = false; this.status = 'init'; this.bigSince = 0;
      this.tmp = new Uint8Array(this.w * this.h);
    }
    resetEmpty() { this.empty = null; this.ref = null; this.dirty = false; this.status = 'init'; }

    blur(g) {
      const { w, h } = this, o = new Uint8Array(w * h);
      for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        o[i] = (g[i - w - 1] + g[i - w] + g[i - w + 1] + g[i - 1] + g[i] + g[i + 1] + g[i + w - 1] + g[i + w] + g[i + w + 1]) / 9;
      }
      return o;
    }
    diff(a, b, thr) {
      const m = this.mask, o = new Uint8Array(a.length);
      for (let i = 0; i < a.length; i++) if (m[i] && Math.abs(a[i] - b[i]) > thr) o[i] = 1;
      return o;
    }
    dilate(b, iter) {
      const { w, h } = this;
      let src = b;
      for (let k = 0; k < iter; k++) {
        const o = new Uint8Array(b.length);
        for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
          const i = y * w + x;
          if (src[i] || src[i - 1] || src[i + 1] || src[i - w] || src[i + w]) o[i] = 1;
        }
        src = o;
      }
      return src;
    }
    /** blocs de pixels changés ; on relie les morceaux proches (fût + empennage) mais on garde les pixels bruts */
    components(b) {
      const { w, h } = this, grown = this.dilate(b, 2), seen = new Uint8Array(b.length), out = [], st = [];
      for (let s = 0; s < b.length; s++) {
        if (!grown[s] || seen[s]) continue;
        const core = []; st.push(s); seen[s] = 1;
        while (st.length) {
          const i = st.pop(); if (b[i]) core.push(i);
          const x = i % w, y = (i / w) | 0;
          if (x > 0 && grown[i - 1] && !seen[i - 1]) { seen[i - 1] = 1; st.push(i - 1); }
          if (x < w - 1 && grown[i + 1] && !seen[i + 1]) { seen[i + 1] = 1; st.push(i + 1); }
          if (y > 0 && grown[i - w] && !seen[i - w]) { seen[i - w] = 1; st.push(i - w); }
          if (y < h - 1 && grown[i + w] && !seen[i + w]) { seen[i + w] = 1; st.push(i + w); }
        }
        if (core.length >= this.minArea) out.push(core);
      }
      return out;
    }

    /** position de la pointe (mm) d'un bloc de pixels */
    tip(comp) {
      const { BX, BY, foot } = this, n = comp.length;
      let cx = 0, cy = 0;
      for (const i of comp) { cx += BX[i]; cy += BY[i]; }
      cx /= n; cy /= n;
      let sxx = 0, sxy = 0, syy = 0;
      for (const i of comp) { const dx = BX[i] - cx, dy = BY[i] - cy; sxx += dx * dx; sxy += dx * dy; syy += dy * dy; }
      sxx /= n; sxy /= n; syy /= n;
      const th = 0.5 * Math.atan2(2 * sxy, sxx - syy), ax = Math.cos(th), ay = Math.sin(th);
      const tr = sxx + syy, det = sxx * syy - sxy * sxy, disc = Math.sqrt(Math.max(0, tr * tr / 4 - det));
      const l1 = tr / 2 + disc, l2 = Math.max(1e-6, tr / 2 - disc), elong = Math.sqrt(l1 / l2);
      let tmin = 1e9, tmax = -1e9;
      const ts = new Float32Array(n);
      comp.forEach((i, k) => { const t = (BX[i] - cx) * ax + (BY[i] - cy) * ay; ts[k] = t; if (t < tmin) tmin = t; if (t > tmax) tmax = t; });
      const dPlus = Math.hypot(cx + ax * tmax - foot[0], cy + ay * tmax - foot[1]);
      const dMinus = Math.hypot(cx + ax * tmin - foot[0], cy + ay * tmin - foot[1]);
      let sx = 0, sy = 0, c = 0;
      if (elong >= 1.6) {
        const s = dPlus < dMinus ? 1 : -1, ext = s > 0 ? tmax : -tmin, wd = Math.max(1.5, 0.06 * (tmax - tmin)), cut = ext - wd;
        comp.forEach((i, k) => { if (s * ts[k] >= cut) { sx += BX[i]; sy += BY[i]; c++; } });
        // la moyenne de la tranche est à wd/2 du bout : on avance jusqu'à l'extrémité
        return { x: sx / c + s * ax * (wd / 2), y: sy / c + s * ay * (wd / 2), area: n, elong };
      } else {
        const ds = comp.map((i) => Math.hypot(BX[i] - foot[0], BY[i] - foot[1]));
        const sorted = ds.slice().sort((a, b) => a - b), lim = sorted[Math.max(0, Math.floor(n * 0.08))];
        comp.forEach((i, k) => { if (ds[k] <= lim) { sx += BX[i]; sy += BY[i]; c++; } });
      }
      return { x: sx / c, y: sy / c, area: n, elong };
    }

    /** @returns tableau d'évènements : {t:'dart',x,y} | {t:'removed'} | {t:'cleared'} | {t:'ready'} | {t:'bigchange'} */
    process(gray, now) {
      const ev = [], cur = this.blur(gray), m = this.mask;
      if (!this.prev) { this.prev = cur; this.lastMotion = now; this.status = 'settling'; return ev; }
      let cnt = 0;
      for (let i = 0; i < cur.length; i++) if (m[i] && Math.abs(cur[i] - this.prev[i]) > 18) cnt++;
      this.prev = cur;
      const moving = cnt / this.maskCount > 0.003;
      if (moving) { this.lastMotion = now; this.dirty = true; }
      const still = now - this.lastMotion > 600;
      if (!still) { this.status = this.empty ? 'moving' : 'settling'; return ev; }
      if (!this.empty) {
        this.empty = cur; this.ref = cur; this.dirty = false; this.status = 'ready'; ev.push({ t: 'ready' });
        return ev;
      }
      this.status = 'ready';
      if (now - (this.lastAn || 0) < 450) return ev; // on compare régulièrement, sans dépendre du seuil de mouvement
      this.lastAn = now;

      const dRef = this.diff(cur, this.ref, this.thr);
      let total = 0;
      for (let i = 0; i < dRef.length; i++) total += dRef[i];
      if (total / this.maskCount > 0.05) { // main, bras ou caméra déplacée : on attend
        this.dirty = true;
        if (!this.bigSince) this.bigSince = now;
        if (now - this.bigSince > 6000) { ev.push({ t: 'bigchange' }); this.bigSince = now; }
        this.status = 'hand';
        return ev;
      }
      this.bigSince = 0;
      const comps = this.components(dRef);
      if (comps.some((c) => c.length > this.maxArea)) { // trop gros pour une fléchette : main, bras
        this.dirty = true; this.status = 'hand'; return ev;
      }
      const dEmpty = this.diff(cur, this.empty, this.thr);
      const darts = [];
      let removed = false;
      for (const c of comps) {
        let ov = 0;
        for (const i of c) ov += dEmpty[i];
        if (ov / c.length >= 0.5) darts.push(c); else removed = true;
      }
      darts.sort((a, b) => b.length - a.length);
      darts.slice(0, 3).forEach((c) => { const t = this.tip(c); ev.push({ t: 'dart', x: t.x, y: t.y, area: t.area, elong: t.elong }); });
      if (removed) {
        ev.push({ t: 'removed' });
        if (!this.components(dEmpty).length) { ev.push({ t: 'cleared' }); this.empty = cur; }
      }
      this.ref = cur;
      return ev;
    }
  }

  /* ================= INTERFACE ================= */
  const store = {
    get(k, d) { try { const v = localStorage.getItem('oche.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('oche.' + k, JSON.stringify(v)); } catch (e) {} },
  };
  const ANGLES = [9, 99, 189, 279];
  const WHERE = ['entre le 20 et le 1', 'entre le 6 et le 10', 'entre le 3 et le 19', 'entre le 11 et le 14'];
  const POS = { top: 'Au-dessus de la cible', bottom: 'En dessous de la cible', left: 'À gauche de la cible', right: 'À droite de la cible', front: 'En face (de loin)' };

  const cam = {
    video: null, stream: null, pts: null, pos: store.get('cam-pos', 'top'), deviceId: store.get('cam-device', ''),
    det: null, timer: 0, drawTimer: 0, pw: 480, ph: 270, pctx: null, thr: store.get('cam-thr', 28), grid: true,
    queue: [], tip: null, flash: { text: '', until: 0 }, view: 'setup', drag: -1,
  };
  const sheet = $('#cam-sheet'), modal = $('#cam'), pip = $('#campip'), pipCtx = $('canvas', pip).getContext('2d');

  const open = () => modal.classList.remove('hidden');
  const close = () => { modal.classList.add('hidden'); clearInterval(cam.drawTimer); };
  modal.addEventListener('pointerdown', (e) => { if (e.target === modal && cam.view !== 'calib') close(); });

  $('#btn-cam').onclick = () => { open(); show(cam.det ? 'run' : 'setup'); };
  pip.onclick = () => { open(); show('run'); };

  function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  async function devices() {
    try { return (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput'); } catch (e) { return []; }
  }

  function show(view, msg) {
    cam.view = view;
    clearInterval(cam.drawTimer);
    if (view === 'setup') return viewSetup(msg);
    if (view === 'calib') return viewCalib();
    return viewRun();
  }

  async function viewSetup(msg) {
    const devs = await devices();
    const secure = window.isSecureContext && navigator.mediaDevices;
    sheet.innerHTML = `<h3>Caméra</h3>
      <div class="rules"><p>OCHE regarde la cible et compte les fléchettes toute seule. Il faut une caméra <b>fixe</b>, qui voit <b>toute la cible</b>, avec une lumière stable.</p></div>
      ${secure ? '' : '<div class="cam-warn">La caméra n’est autorisée que sur une page sécurisée (https ou localhost). Ouvre OCHE depuis une adresse https.</div>'}
      ${msg ? `<div class="cam-warn">${esc(msg)}</div>` : ''}
      <label class="fld">Où est la caméra ?<select id="cam-pos">${Object.entries(POS).map(([k, v]) => `<option value="${k}"${k === cam.pos ? ' selected' : ''}>${v}</option>`).join('')}</select></label>
      ${devs.length > 1 ? `<label class="fld">Caméra<select id="cam-dev">${devs.map((d, i) => `<option value="${esc(d.deviceId)}"${d.deviceId === cam.deviceId ? ' selected' : ''}>${esc(d.label || 'Caméra ' + (i + 1))}</option>`).join('')}</select></label>` : ''}
      <ul class="tips"><li>Idéal : un peu de côté ou au-dessus, qui regarde la cible en biais, pour voir les fléchettes dépasser.</li><li>Évite le contre-jour et les ombres qui bougent.</li><li>Une fois calibrée, ne touche plus à la caméra.</li></ul>
      <div class="sheet-actions"><button class="btn primary" id="cam-go">Activer la caméra</button><button class="btn ghost" id="cam-x">Fermer</button></div>`;
    $('#cam-x').onclick = close;
    $('#cam-go').onclick = async () => {
      cam.pos = $('#cam-pos').value; store.set('cam-pos', cam.pos);
      const d = $('#cam-dev'); if (d) { cam.deviceId = d.value; store.set('cam-device', cam.deviceId); }
      $('#cam-go').disabled = true; $('#cam-go').textContent = 'Connexion…';
      try { await startStream(); } catch (e) { return show('setup', 'Impossible d’ouvrir la caméra : ' + (e && e.message ? e.message : e)); }
      const saved = store.get('cam-calib', null);
      if (saved && saved.dev === cam.deviceId && saved.pts && saved.pts.length === 4) { cam.pts = saved.pts; show('run'); startDetection(); }
      else { cam.pts = []; show('calib'); }
    };
  }

  async function startStream() {
    stopStream();
    const c = { video: { width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false };
    if (cam.deviceId) c.video.deviceId = { exact: cam.deviceId }; else c.video.facingMode = 'environment';
    cam.stream = await navigator.mediaDevices.getUserMedia(c);
    const v = (cam.video = document.createElement('video'));
    v.playsInline = true; v.muted = true; v.srcObject = cam.stream;
    await v.play();
    for (let i = 0; i < 40 && !v.videoWidth; i++) await new Promise((r) => setTimeout(r, 50));
    if (!cam.deviceId) { const t = cam.stream.getVideoTracks()[0]; const s = t && t.getSettings && t.getSettings(); if (s && s.deviceId) cam.deviceId = s.deviceId; }
  }
  function stopStream() {
    if (cam.stream) cam.stream.getTracks().forEach((t) => t.stop());
    cam.stream = null;
  }
  function stopAll() {
    clearInterval(cam.timer); cam.timer = 0; cam.det = null; stopStream();
    pip.classList.add('hidden'); $('#btn-cam').classList.remove('on');
    O.live.on = false; document.body.classList.remove('live'); wake(false);
  }

  /* ---------- calibrage ---------- */
  function viewCalib() {
    const v = cam.video, vw = v.videoWidth || 1280, vh = v.videoHeight || 720;
    sheet.innerHTML = `<h3>Calibrage</h3>
      <div class="calib-hint" id="ch"></div>
      <div class="calib-wrap"><canvas id="cc" width="960" height="${Math.round((960 * vh) / vw)}"></canvas>
        <svg class="calib-map" viewBox="-240 -240 480 480"><use href="#oche-art"/><circle id="cm-dot" r="11" class="cm-dot"/></svg></div>
      <p class="calib-help">Touche le point demandé sur l’image, puis ajuste-le en le faisant glisser (une loupe t’aide). Le quadrillage doit épouser les fils de la cible.</p>
      <div class="sheet-actions"><button class="btn primary" id="cc-ok" disabled>Valider</button><button class="btn ghost" id="cc-reset">Recommencer</button><button class="btn ghost" id="cc-x">Annuler</button></div>`;
    const cv = $('#cc'), ctx = cv.getContext('2d'), W = cv.width, H = cv.height;
    const ch = $('#ch'), ok = $('#cc-ok'), dot = $('#cm-dot');
    const upd = () => {
      const n = cam.pts.length;
      ch.innerHTML = n < 4 ? `Point <b>${n + 1} / 4</b> : le bout extérieur du fil du double, <b>${WHERE[n]}</b>` : 'Vérifie que le quadrillage colle aux fils, puis valide.';
      const [x, y] = P(R, ANGLES[Math.min(n, 3)]); dot.setAttribute('cx', x); dot.setAttribute('cy', y);
      dot.style.display = n < 4 ? '' : 'none';
      ok.disabled = n < 4;
    };
    upd();
    const toPx = (e) => { const r = cv.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H]; };
    cv.style.touchAction = 'none';
    cv.onpointerdown = (e) => {
      const [x, y] = toPx(e);
      let k = cam.pts.findIndex((p) => Math.hypot(p[0] * W - x, p[1] * H - y) < 34);
      if (k < 0 && cam.pts.length < 4) { cam.pts.push([x / W, y / H]); k = cam.pts.length - 1; upd(); }
      cam.drag = k;
      if (k >= 0) cv.setPointerCapture(e.pointerId);
    };
    cv.onpointermove = (e) => { if (cam.drag >= 0) { const [x, y] = toPx(e); cam.pts[cam.drag] = [Math.max(0, Math.min(1, x / W)), Math.max(0, Math.min(1, y / H))]; } };
    cv.onpointerup = () => { cam.drag = -1; };
    $('#cc-reset').onclick = () => { cam.pts = []; upd(); };
    $('#cc-x').onclick = () => { stopAll(); close(); };
    ok.onclick = () => { store.set('cam-calib', { dev: cam.deviceId, pts: cam.pts }); startDetection(); if (cam.autoClose) close(); else show('run'); };

    cam.drawTimer = setInterval(() => {
      ctx.drawImage(v, 0, 0, W, H);
      if (cam.pts.length === 4) drawGrid(ctx, cam.pts, W, H, 3);
      cam.pts.forEach((p, i) => {
        ctx.beginPath(); ctx.arc(p[0] * W, p[1] * H, 9, 0, 7); ctx.fillStyle = '#e0a93b'; ctx.fill();
        ctx.lineWidth = 2; ctx.strokeStyle = '#000'; ctx.stroke();
        ctx.fillStyle = '#000'; ctx.font = '700 13px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(i + 1, p[0] * W, p[1] * H + 4.5);
      });
      if (cam.drag >= 0) loupe(ctx, v, cam.pts[cam.drag], W, H);
    }, 50);
  }

  function loupe(ctx, v, p, W, H) {
    const s = 110, z = 4, px = p[0] * v.videoWidth, py = p[1] * v.videoHeight, k = v.videoWidth / W;
    const lx = p[0] > 0.5 ? 70 : W - 70, ly = 70;
    ctx.save(); ctx.beginPath(); ctx.arc(lx, ly, s / 2, 0, 7); ctx.clip();
    ctx.drawImage(v, px - s / z / 2 * k, py - s / z / 2 * k, (s / z) * k, (s / z) * k, lx - s / 2, ly - s / 2, s, s);
    ctx.restore();
    ctx.beginPath(); ctx.arc(lx, ly, s / 2, 0, 7); ctx.lineWidth = 3; ctx.strokeStyle = '#e0a93b'; ctx.stroke();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(lx - 14, ly); ctx.lineTo(lx + 14, ly); ctx.moveTo(lx, ly - 14); ctx.lineTo(lx, ly + 14); ctx.stroke();
  }

  function boardToImg(pts, W, H) {
    const src = ANGLES.map((a) => P(R, a)), dst = pts.map((p) => [p[0] * W, p[1] * H]);
    return solveH(src, dst);
  }
  function drawGrid(ctx, pts, W, H, lw = 1.5) {
    const Hbi = boardToImg(pts, W, H);
    if (!Hbi) return;
    ctx.save(); ctx.lineWidth = lw; ctx.strokeStyle = 'rgba(246,210,122,.9)';
    [R, 162, 107, 99, 7.95].forEach((r) => {
      ctx.beginPath();
      for (let a = 0; a <= 72; a++) { const [x, y] = warp(Hbi, r * Math.sin((a / 72) * 6.2832), -r * Math.cos((a / 72) * 6.2832)); a ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      ctx.stroke();
    });
    ctx.strokeStyle = 'rgba(246,210,122,.45)'; ctx.beginPath();
    for (let i = 0; i < 20; i++) { const [x1, y1] = warp(Hbi, ...P(7.95, i * 18 + 9)), [x2, y2] = warp(Hbi, ...P(R, i * 18 + 9)); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); }
    ctx.stroke(); ctx.restore();
  }

  /* ---------- détection ---------- */
  function startDetection() {
    const v = cam.video;
    cam.pw = Math.min(480, v.videoWidth || 480);
    cam.ph = Math.round((cam.pw * (v.videoHeight || 270)) / (v.videoWidth || 480));
    const c = document.createElement('canvas'); c.width = cam.pw; c.height = cam.ph;
    cam.pctx = c.getContext('2d', { willReadFrequently: true });
    const src = cam.pts.map((p) => [p[0] * cam.pw, p[1] * cam.ph]), dst = ANGLES.map((a) => P(R, a));
    const Hib = solveH(src, dst);
    if (!Hib) return;
    cam.det = new Detector(cam.pw, cam.ph, Hib, cam.pos, cam.thr);
    cam.queue = [];
    clearInterval(cam.timer);
    cam.timer = setInterval(tick, 110);
    pip.classList.remove('hidden'); $('#btn-cam').classList.add('on');
    O.live.on = true; document.body.classList.add('live'); wake(true);
  }

  function flash(text, ms = 1800) { cam.flash = { text, until: performance.now() + ms }; }

  function tick() {
    const v = cam.video, A = O.app;
    if (!cam.det || !v || !v.videoWidth) return;
    const now = performance.now();
    cam.pctx.drawImage(v, 0, 0, cam.pw, cam.ph);
    const d = cam.pctx.getImageData(0, 0, cam.pw, cam.ph).data, g = new Uint8Array(cam.pw * cam.ph);
    for (let i = 0, j = 0; i < g.length; i++, j += 4) g[i] = (d[j] * 77 + d[j + 1] * 150 + d[j + 2] * 29) >> 8;
    if (A.active()) {
      for (const e of cam.det.process(g, now)) {
        if (e.t === 'dart') { cam.queue.push({ t: 'dart', x: e.x, y: e.y, at: now }); cam.tip = { x: e.x, y: e.y, until: now + 2500 }; }
        else if (e.t === 'cleared') cam.queue.push({ t: 'next', at: now });
        else if (e.t === 'bigchange') flash('Image très changée : la caméra a bougé ?', 4000);
      }
      pump(now);
    }
    drawPip(now);
  }

  function pump(now) {
    const A = O.app, q = cam.queue;
    while (q.length) {
      const it = q[0];
      if (now - it.at > 8000) { q.shift(); continue; }
      if (it.t === 'dart') {
        if (A.phase() !== 'throwing') { q.shift(); continue; }
        if (A.busy()) return;
        q.shift();
        const h = U.zoneAt(it.x, it.y);
        A.throwAt(it.x, it.y);
        flash((h.m ? U.label(h) : 'Hors cible') + ' détecté');
      } else {
        if (A.busy()) return;
        q.shift();
        if (A.visitDarts() > 0 && A.phase() !== 'over') A.next();
      }
      return;
    }
  }

  const STAT = { init: ['wait', 'Calage…'], settling: ['wait', 'Ne bougez pas…'], ready: ['ok', 'Prête, lance !'], moving: ['move', 'Mouvement…'], hand: ['move', 'Main détectée…'] };
  function drawPip(now) {
    const W = pipCtx.canvas.width, H = pipCtx.canvas.height;
    pipCtx.drawImage(cam.video, 0, 0, W, H);
    if (cam.grid) drawGrid(pipCtx, cam.pts, W, H, 1);
    if (cam.tip && cam.tip.until > now) {
      const Hbi = boardToImg(cam.pts, W, H), [x, y] = warp(Hbi, cam.tip.x, cam.tip.y);
      pipCtx.strokeStyle = '#ff4d3d'; pipCtx.lineWidth = 2; pipCtx.beginPath(); pipCtx.arc(x, y, 7, 0, 7); pipCtx.moveTo(x - 11, y); pipCtx.lineTo(x + 11, y); pipCtx.moveTo(x, y - 11); pipCtx.lineTo(x, y + 11); pipCtx.stroke();
    }
    let [k, txt] = STAT[cam.det.status] || STAT.init;
    if (cam.flash.until > now) { k = 'ok'; txt = cam.flash.text; }
    pip.dataset.k = k; $('.camstat b', pip).textContent = txt;
    const live = $('#cam-live');
    if (live && !modal.classList.contains('hidden')) {
      const c = live.getContext('2d'); c.drawImage(cam.video, 0, 0, live.width, live.height);
      if (cam.grid) drawGrid(c, cam.pts, live.width, live.height, 2);
      if (cam.tip && cam.tip.until > now) {
        const [x, y] = warp(boardToImg(cam.pts, live.width, live.height), cam.tip.x, cam.tip.y);
        c.strokeStyle = '#ff4d3d'; c.lineWidth = 3; c.beginPath(); c.arc(x, y, 10, 0, 7); c.stroke();
      }
      const s = $('#cam-st'); if (s) s.textContent = txt;
    }
  }


  /* ---------- écran allumé + démarrage automatique ---------- */
  let wakeLock = null;
  async function wake(on) {
    try {
      if (on && navigator.wakeLock && !wakeLock) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); }
      if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
    } catch (e) {}
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden && cam.det) wake(true); });

  /** appelé au lancement d'une partie : ouvre la caméra et reprend le dernier calibrage, sans repasser par les réglages */
  async function autoStart() {
    if (cam.det || !navigator.mediaDevices) return;
    cam.autoClose = true;
    try { await startStream(); } catch (e) { open(); return show('setup', 'Impossible d’ouvrir la caméra : ' + (e && e.message ? e.message : e)); }
    const saved = store.get('cam-calib', null);
    if (saved && saved.dev === cam.deviceId && saved.pts && saved.pts.length === 4) { cam.pts = saved.pts; startDetection(); flash('Caméra prête', 2500); }
    else { cam.pts = []; open(); show('calib'); }
  }

  function viewRun() {
    const v = cam.video, vw = (v && v.videoWidth) || 1280, vh = (v && v.videoHeight) || 720;
    sheet.innerHTML = `<h3>Caméra active</h3>
      <canvas id="cam-live" width="640" height="${Math.round((640 * vh) / vw)}"></canvas>
      <div class="cam-st" id="cam-st">…</div>
      <label class="fld rng">Sensibilité<input type="range" id="cam-thr" min="12" max="60" value="${72 - cam.thr}"><small>Si elle rate des fléchettes, monte-la. Si elle en voit trop, baisse-la.</small></label>
      <label class="opt${O.live.speech ? ' on' : ''}" id="cam-speech" role="button"><span><b>Annonces vocales</b><small>Dit le score de chaque fléchette et le joueur suivant.</small></span><i class="sw"></i></label>
      <label class="opt${cam.grid ? ' on' : ''}" id="cam-grid" role="button"><span><b>Quadrillage</b><small>Montre la cible repérée sur l’image.</small></span><i class="sw"></i></label>
      <div class="sheet-actions"><button class="btn primary" id="cam-ok">Fermer</button>
        <button class="btn ghost" id="cam-ref">Nouvelle image de référence</button>
        <button class="btn ghost" id="cam-re">Recalibrer</button>
        <button class="btn ghost" id="cam-off">Arrêter la caméra</button></div>`;
    $('#cam-ok').onclick = close;
    $('#cam-thr').oninput = (e) => { cam.thr = 72 - +e.target.value; store.set('cam-thr', cam.thr); if (cam.det) cam.det.thr = cam.thr; };
    $('#cam-speech').onclick = (e) => { O.live.speech = !O.live.speech; store.set('speech', O.live.speech); e.currentTarget.classList.toggle('on', O.live.speech); if (O.live.speech && window.speechSynthesis) { const u = new SpeechSynthesisUtterance('Annonces activées'); u.lang = 'fr-FR'; speechSynthesis.speak(u); } };
    $('#cam-grid').onclick = (e) => { cam.grid = !cam.grid; e.currentTarget.classList.toggle('on', cam.grid); };
    $('#cam-ref').onclick = () => { if (cam.det) { cam.det.resetEmpty(); cam.det.prev = null; flash('Référence en cours…'); } };
    $('#cam-re').onclick = () => { cam.pts = []; clearInterval(cam.timer); cam.det = null; show('calib'); };
    $('#cam-off').onclick = () => { stopAll(); close(); };
  }

  O.camera = { Detector, solveH, warp, cam, show, startDetection, autoStart };
})();
