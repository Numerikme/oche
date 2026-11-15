/* OCHE — interface : accueil, partie, visée à la loupe, animations. */
(function () {
  const O = window.OCHE, G = O.games, U = O.boardUtil, A = O.audio, Board = O.Board;
  const $ = (s, r = document) => r.querySelector(s);
  const store = {
    get(k, d) { try { const v = localStorage.getItem('oche.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('oche.' + k, JSON.stringify(v)); } catch (e) {} },
    del(k) { try { localStorage.removeItem('oche.' + k); } catch (e) {} },
  };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const mk = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  U.buildDefs($('#defs-svg'));
  const live = (O.live = O.live || { on: false, speech: store.get('speech', true) });

  const GAMES = [
    { id: '301', type: 'x01', start: 301, big: '301', small: 'Descends à zéro, vite.' },
    { id: '501', type: 'x01', start: 501, big: '501', small: 'Le grand classique.' },
    { id: '701', type: 'x01', start: 701, big: '701', small: 'Pour les longues soirées.' },
    { id: 'cricket', type: 'cricket', name: 'Cricket', wide: true, small: 'Ferme du 20 au 15 et le bull, marque des points.' },
    { id: 'clock', type: 'clock', name: "Tour de l'horloge", wide: true, small: 'Du 1 au 20 dans l’ordre, puis le bull.' },
  ];
  const setup = { game: store.get('game-id', '501'), names: store.get('names', ['', '']), doubleOut: store.get('double-out', true), advance: store.get('advance', false), useCam: store.get('useCam', false) };
  if (!GAMES.some((g) => g.id === setup.game)) setup.game = '501';
  if (!Array.isArray(setup.names) || !setup.names.length) setup.names = ['', ''];

  /* ================= ACCUEIL ================= */
  function renderGames() {
    const root = $('#game-grid');
    root.innerHTML = '';
    GAMES.forEach((g) => {
      const b = mk('button', 'gcard' + (g.wide ? ' wide' : '') + (g.id === setup.game ? ' on' : ''),
        (g.big ? `<div class="big">${g.big}</div>` : `<div class="name">${g.name}</div>`) + `<small>${g.small}</small>`);
      b.onclick = () => { setup.game = g.id; store.set('game-id', g.id); A.unlock(); A.tick(); renderGames(); renderOptions(); };
      root.appendChild(b);
    });
  }
  const X = '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>';
  function renderPlayers(animIdx) {
    const root = $('#player-list');
    root.innerHTML = '';
    setup.names.forEach((n, i) => {
      const r = mk('div', 'prow', `<i></i><input maxlength="14" placeholder="Joueur ${i + 1}" autocomplete="off" autocapitalize="words"><button class="x" aria-label="Retirer">${X}</button>`);
      r.style.setProperty('--c', G.COLORS[i]);
      if (animIdx != null && animIdx !== i) r.style.animation = 'none';
      else if (animIdx == null) r.style.animationDelay = i * 60 + 'ms';
      const inp = $('input', r);
      inp.value = n;
      inp.oninput = () => { setup.names[i] = inp.value; store.set('names', setup.names); };
      const x = $('.x', r);
      if (setup.names.length === 1) x.style.visibility = 'hidden';
      x.onclick = () => { setup.names.splice(i, 1); store.set('names', setup.names); renderPlayers(-1); };
      root.appendChild(r);
    });
    if (setup.names.length < 4) {
      const a = mk('button', 'padd', '+ Ajouter un joueur');
      a.onclick = () => { setup.names.push(''); renderPlayers(setup.names.length - 1); const ins = document.querySelectorAll('.prow input'); ins[ins.length - 1].focus(); };
      root.appendChild(a);
    }
  }
  function renderOptions() {
    const g = GAMES.find((x) => x.id === setup.game), root = $('#options');
    root.innerHTML = '';
    const sw = (key, title, desc) => {
      const b = mk('button', 'opt' + (setup[key] ? ' on' : ''), `<span><b>${title}</b><small>${desc}</small></span><i class="sw"></i>`);
      b.onclick = () => { setup[key] = !setup[key]; store.set(key === 'doubleOut' ? 'double-out' : key, setup[key]); b.classList.toggle('on', setup[key]); A.tick(); };
      root.appendChild(b);
    };
    if (g.type === 'x01') sw('doubleOut', 'Sortie en double', 'Pour finir, il faut terminer sur un double (ou le bull).');
    else if (g.type === 'clock') sw('advance', 'Doubles et triples font avancer', 'Un double compte 2 cases, un triple 3.');
    else if (g.type === 'cricket') root.appendChild(mk('div', 'note', 'Les points ne comptent que si un adversaire n’a pas encore fermé le numéro. Idéal à 2 ou 3 joueurs.'));
    if (navigator.mediaDevices) sw('useCam', 'Jouer avec la caméra', 'Le téléphone, posé face à la cible, compte les fléchettes tout seul.');
  }
  function renderResume() {
    const root = $('#resume');
    root.innerHTML = '';
    const sv = store.get('game', null);
    if (!sv || !sv.state || sv.state.phase === 'over') return;
    const s = sv.state;
    const g = s.cfg.type === 'x01' ? s.cfg.start : s.cfg.type === 'cricket' ? 'Cricket' : 'Horloge';
    const who = s.players.map((p) => esc(p.name) + (s.cfg.type === 'x01' ? ' ' + p.score : '')).join(' · ');
    const r = mk('div', 'resume', `<div class="r-t"><b>Partie en cours · ${g}</b><span>${who}</span></div><button class="btn primary" id="r-go">Reprendre</button><button class="drop" id="r-drop">Abandonner</button>`);
    root.appendChild(r);
    $('#r-go').onclick = () => { A.unlock(); state = s; history = sv.history || []; enterGame(true); };
    $('#r-drop').onclick = () => { store.del('game'); renderResume(); };
  }

  $('#btn-shuffle').onclick = () => {
    for (let i = setup.names.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [setup.names[i], setup.names[j]] = [setup.names[j], setup.names[i]]; }
    store.set('names', setup.names); renderPlayers(); A.tick();
  };
  $('#btn-start').onclick = () => {
    A.unlock();
    const g = GAMES.find((x) => x.id === setup.game);
    const names = setup.names.map((n, i) => n.trim() || 'Joueur ' + (i + 1));
    startNew({ type: g.type, start: g.start, doubleOut: setup.doubleOut, advance: setup.advance, names, colors: G.COLORS.slice(0, names.length) });
  };

  /* hero : une cible qui vit toute seule */
  let heroBoard = null, heroTimer = 0;
  function heroThrow() {
    if (!heroBoard) return;
    if (heroBoard.darts.length >= 7) { heroBoard.clearDarts(true); return; }
    let x, y;
    if (Math.random() < 0.55) {
      const g = () => (Math.random() + Math.random() + Math.random() - 1.5) * 16;
      x = g(); y = -103 + g();
    } else { const a = Math.random() * 6.283, r = Math.sqrt(Math.random()) * 160; x = Math.sin(a) * r; y = -Math.cos(a) * r; }
    const h = U.zoneAt(x, y), col = G.COLORS[heroBoard.darts.length % 4];
    heroBoard.addDart(x, y, col, { onLand() { heroBoard.ripple(x, y, col); heroBoard.flash(h); } });
  }
  function startHero() {
    if (!heroBoard) heroBoard = new Board($('#hero-board'));
    stopHero();
    heroTimer = setInterval(heroThrow, 1050);
    setTimeout(heroThrow, 700);
  }
  function stopHero() { clearInterval(heroTimer); }

  function showScreen(id) {
    ['home', 'game'].forEach((s) => $('#' + s).classList.toggle('hidden', s !== id));
    if (id === 'home') { startHero(); renderResume(); } else stopHero();
  }

  /* ================= PARTIE ================= */
  let state = null, history = [], board = null, busy = false, view = {};
  const wrap = $('#boardwrap'), gameEl = $('#game');
  const cur = () => state.players[state.turn];

  function save() { store.set('game', { state, history: history.slice(-80) }); }
  function pushHistory() { history.push(JSON.stringify(state)); if (history.length > 300) history.shift(); }

  function startNew(cfg) { state = G.create(cfg); history = []; save(); enterGame(false); }

  function enterGame(resumed) {
    hideModal('win'); hideModal('menu');
    showScreen('game');
    if (!board) { board = new Board($('#board')); attachAim(); }
    busy = false; view = { slots: [] };
    const c = state.cfg;
    $('#g-title').textContent = c.type === 'x01' ? c.start : c.type === 'cricket' ? 'Cricket' : 'Horloge';
    $('#btn-sound').innerHTML = speaker();
    $('#btn-sound').classList.toggle('off', !A.on);
    buildScores();
    syncDarts();
    refresh(true);
    if (!store.get('coached', false)) $('#coach').classList.remove('gone'); else $('#coach').classList.add('gone');
    setTimeout(turnPop, 250);
    if (setup.useCam && O.camera) O.camera.autoStart();
  }
  const speaker = () => '<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/></svg>';

  /* --- tableau de scores --- */
  function buildScores() {
    const root = $('#scores');
    root.innerHTML = '';
    view.cards = [];
    const c = state.cfg;
    if (c.type === 'cricket') {
      const n = state.players.length;
      const t = mk('div', 'cr');
      t.style.gridTemplateColumns = `54px repeat(${n}, 1fr)`;
      t.appendChild(mk('div', 'cr-cell h'));
      state.players.forEach((p, i) => {
        const h = mk('div', 'cr-cell h', `<span class="name"><i class="dot"></i>${esc(p.name)}</span><span class="pts">0</span>`);
        h.dataset.p = i; h.style.setProperty('--pc', p.color); t.appendChild(h);
      });
      G.CRICKET.forEach((tg) => {
        const lab = mk('div', 'cr-cell lab', tg === 25 ? 'B' : tg); lab.dataset.t = tg; t.appendChild(lab);
        state.players.forEach((p, i) => {
          const cell = mk('div', 'cr-cell', '<svg class="mk m0" viewBox="0 0 24 24"><path class="a" d="M5 19L19 5"/><path class="b" d="M5 5L19 19"/><circle class="c" cx="12" cy="12" r="10.5"/></svg>');
          cell.dataset.p = i; cell.dataset.t = tg; cell.style.setProperty('--pc', p.color); t.appendChild(cell);
        });
      });
      root.appendChild(t);
      view.table = t;
      return;
    }
    state.players.forEach((p, i) => {
      let html;
      if (c.type === 'x01') {
        html = `<div class="c-head"><i class="dot"></i><span class="name">${esc(p.name)}</span><span class="sub">moy. <b data-avg>–</b></span></div>
          <div class="c-score" data-score>${c.start}</div>
          <div class="c-foot"><span>Dernière volée <b data-last>–</b></span><span>Meilleure <b data-best>–</b></span></div>`;
      } else {
        html = `<div class="c-head"><i class="dot"></i><span class="name">${esc(p.name)}</span><span class="sub"><b data-hits>0</b> / 21</span></div>
          <div class="c-target"><small>Vise le</small><b data-target>1</b></div>
          <div class="dots">${'<i></i>'.repeat(21)}</div>`;
      }
      const el = mk('div', 'card', html);
      el.style.setProperty('--pc', p.color);
      root.appendChild(el);
      view.cards.push(el);
    });
  }

  function countTo(el, to, instant) {
    const from = el._v == null ? to : el._v;
    el._v = to;
    cancelAnimationFrame(el._r);
    if (instant || from === to) { el.textContent = to; return; }
    const t0 = performance.now(), D = 600;
    const s = (now) => {
      const k = Math.min(1, (now - t0) / D);
      el.textContent = Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3)));
      if (k < 1) el._r = requestAnimationFrame(s);
    };
    el._r = requestAnimationFrame(s);
    el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
  }

  function updateScores(instant) {
    const c = state.cfg, over = state.phase === 'over';
    if (c.type === 'cricket') {
      view.table.querySelectorAll('[data-p]').forEach((cell) => {
        const i = +cell.dataset.p;
        cell.classList.toggle('col-active', i === state.turn && !over);
        const p = state.players[i];
        if (cell.classList.contains('h')) countTo($('.pts', cell), p.points, instant);
        else {
          const m = Math.min(3, p.marks[cell.dataset.t]), svg = $('.mk', cell);
          if (cell._m !== m) {
            if (cell._m != null && m > cell._m && !instant) { cell.classList.remove('pulse'); void cell.offsetWidth; cell.classList.add('pulse'); }
            cell._m = m; svg.setAttribute('class', 'mk m' + m);
          }
        }
      });
      view.table.querySelectorAll('.lab').forEach((l) => { l.style.opacity = state.players.every((p) => p.marks[l.dataset.t] >= 3) ? 0.3 : 1; });
      return;
    }
    state.players.forEach((p, i) => {
      const el = view.cards[i];
      el.classList.toggle('active', i === state.turn && !over);
      el.classList.toggle('won', over && i === state.winner);
      if (c.type === 'x01') {
        countTo($('[data-score]', el), p.score, instant);
        $('[data-avg]', el).textContent = G.avg(p);
        $('[data-last]', el).textContent = p.last == null ? '–' : p.last;
        $('[data-best]', el).textContent = p.best || '–';
      } else {
        const tg = G.CLOCK[Math.min(p.idx, 20)];
        const t = $('[data-target]', el), txt = p.idx >= 21 ? '★' : tg === 25 ? 'BULL' : tg;
        if (t.textContent != txt) { t.textContent = txt; if (!instant) { t.parentNode.classList.remove('bump'); void t.offsetWidth; t.parentNode.classList.add('bump'); } }
        $('[data-hits]', el).textContent = Math.min(p.idx, 21);
        el.querySelectorAll('.dots i').forEach((d, k) => d.classList.toggle('d', k < p.idx));
      }
    });
  }

  function updateVisit() {
    const p = cur(), v = state.visit;
    gameEl.style.setProperty('--pc', p.color);
    const nm = $('.v-name');
    if (nm.textContent !== p.name) { nm.textContent = p.name; nm.classList.remove('swap'); void nm.offsetWidth; nm.classList.add('swap'); }
    document.querySelectorAll('.slot').forEach((s, i) => {
      const d = v.darts[i];
      const key = d ? U.label(d) + (d.bust ? 'b' : '') : '';
      if (s.dataset.k === key) return;
      s.dataset.k = key;
      if (!d) { s.className = 'slot'; s.innerHTML = ''; return; }
      const pts = d.n * d.m;
      s.className = 'slot filled' + (d.m === 3 ? ' t' : d.m === 2 ? ' d' : '') + (d.m === 0 ? ' miss' : '') + (d.bust ? ' bust' : '');
      s.innerHTML = (d.m === 0 ? '–' : U.label(d)) + (d.m > 1 ? `<small>${pts}</small>` : '');
    });
    $('.v-total b').textContent = v.total;
    $('#g-sub').textContent = (state.cfg.type === 'x01' ? (state.cfg.doubleOut ? 'sortie en double · ' : 'sortie libre · ') : '') + 'tour ' + state.round;

    let hint = '';
    if (state.phase === 'throwing') {
      if (state.cfg.type === 'x01') {
        const co = G.checkout(p.score, 3 - v.darts.length, state.cfg.doubleOut);
        if (co) hint = 'Sortie : ' + co.map((x) => `<b>${x}</b>`).join('');
      } else if (state.cfg.type === 'clock') {
        const tg = G.CLOCK[Math.min(p.idx, 20)];
        hint = `Vise le <b>${tg === 25 ? 'BULL' : tg}</b>`;
      }
    } else if (state.phase === 'visitDone') {
      hint = v.busted ? `Bust ! Tu retombes à <b>${v.startScore}</b>. Retire tes fléchettes.` : 'Retire tes fléchettes, puis joueur suivant.';
    }
    $('#hint').innerHTML = hint;
  }

  function updateButtons() {
    const throwing = state.phase === 'throwing', over = state.phase === 'over';
    $('#btn-undo').disabled = !history.length || busy;
    $('#btn-miss').disabled = !throwing || busy;
    const nx = $('#btn-next');
    nx.disabled = over || busy;
    nx.classList.toggle('ready', state.phase === 'visitDone');
    $('span', nx).textContent = state.visit.darts.length >= 3 || state.phase === 'visitDone' ? 'Suivant' : 'Passer';
    $('#board').classList.toggle('lock', !throwing);
  }
  function refresh(instant) { updateScores(instant); updateVisit(); updateButtons(); }

  function syncDarts() {
    board.clearDarts(false);
    const col = cur().color;
    state.visit.darts.forEach((d) => { if (d.x != null) board.addDart(d.x, d.y, col, { animate: false }); });
  }

  /* --- visée : loupe + relâcher pour lancer --- */
  function attachAim() {
    const svg = $('#board'), loupe = $('#loupe'), lsvg = $('svg', loupe), cross = $('.lp-cross', loupe), ro = $('#readout');
    let aiming = null;
    const canThrow = () => state && state.phase === 'throwing' && !busy;
    const pos = (e) => board.toBoard(e.clientX, e.clientY + (e.pointerType === 'touch' ? -62 : 0));
    function show(e) {
      const [x, y] = pos(e), h = U.zoneAt(x, y);
      board.setHover(h);
      ro.textContent = U.longLabel(h) + (h.m ? ' · ' + h.n * h.m : '');
      ro.classList.add('show');
      if (e.pointerType === 'touch') {
        lsvg.setAttribute('viewBox', `${x - 28} ${y - 28} 56 56`);
        cross.setAttribute('transform', `translate(${x} ${y})`);
        loupe.classList.add('show');
        loupe.style.left = x > 0 ? '6px' : 'auto';
        loupe.style.right = x > 0 ? 'auto' : '6px';
      }
      return h;
    }
    function end() { aiming = null; loupe.classList.remove('show'); ro.classList.remove('show'); board.setHover(null); }
    svg.addEventListener('pointerdown', (e) => {
      if (!canThrow()) return;
      A.unlock();
      svg.setPointerCapture(e.pointerId);
      aiming = e.pointerId; show(e); e.preventDefault();
    });
    svg.addEventListener('pointermove', (e) => {
      if (aiming === e.pointerId) show(e);
      else if (e.pointerType === 'mouse' && canThrow()) show(e);
    });
    svg.addEventListener('pointerup', (e) => {
      if (aiming !== e.pointerId) return;
      const [x, y] = pos(e); end(); onThrow(U.zoneAt(x, y));
    });
    svg.addEventListener('pointercancel', end);
    svg.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse' && aiming == null) end(); });
  }

  /* --- lancer --- */
  function onThrow(h) {
    if (!state || state.phase !== 'throwing' || busy) return;
    busy = true;
    pushHistory();
    if (!store.get('coached', false)) { store.set('coached', true); $('#coach').classList.add('gone'); }
    const p = cur();
    const ev = G.throwDart(state, h);
    save();
    updateButtons();
    A.whoosh();
    board.addDart(h.x, h.y, p.color, {
      onLand() {
        A.thud();
        impact(h, p.color, ev);
        events(ev, h);
        refresh(false);
        if (state.phase === 'over') winSequence(); else { busy = false; updateButtons(); }
      },
    });
  }
  function onMiss() {
    if (!state || state.phase !== 'throwing' || busy) return;
    pushHistory();
    G.throwDart(state, { n: 0, m: 0 });
    save(); A.tick(); callout('Raté', 'small'); refresh(false);
  }

  function impact(h, color, ev) {
    board.ripple(h.x, h.y, color);
    board.flash(h);
    const sh = $('#shaker');
    sh.classList.remove('shake'); void sh.offsetWidth; sh.classList.add('shake');
    if (live.on) { liveDart(h, ev); return; }
    if (h.m === 0) { callout('Raté', 'small'); return; }
    const pts = h.n * h.m;
    if (h.n === 25 && h.m === 2) { A.bull(); callout('<small>Dans le mille</small>BULL', 'gold'); }
    else if (h.n === 25) { A.ding(1); floatText('25', h); }
    else if (h.m === 3) { A.ding(2); callout(`<small>Triple</small>${h.n}`, 'red'); }
    else if (h.m === 2) { A.ding(1); callout(`<small>Double</small>${h.n}`, 'green'); }
    else floatText(pts, h);
  }

  function events(ev, h) {
    ev.forEach((e) => {
      if (e.t === 'bust') {
        announce('BUST', 'red'); A.bust(); say('Bust');
        const sh = $('#shaker'); sh.classList.remove('shake2'); void sh.offsetWidth; sh.classList.add('shake2');
        const card = view.cards[state.turn]; if (card) { card.classList.remove('shakeit'); void card.offsetWidth; card.classList.add('shakeit'); }
      } else if (e.t === '180') {
        announce('<small>Maximum</small>180 !', 'gold'); A.big(); say('Cent quatre-vingts !'); confetti(innerWidth / 2, innerHeight * 0.45, ['#f6d27a', '#e0a93b', '#fff'], 90, 1);
      } else if (e.t === 'ton') {
        announce(`<small>Belle volée</small>${e.v}`, 'gold'); A.big();
      } else if (e.t === 'close') {
        announce(`<small>Fermé</small>${e.n === 25 ? 'BULL' : e.n}`, 'green'); A.close();
      } else if (e.t === 'points') floatText('+' + e.v, h, '#f6d27a');
      else if (e.t === 'advance' && state.phase !== 'over') floatText('+' + e.v, h, '#6ee7a6');
      else if (e.t === 'win' && state.cfg.type === 'x01') announce('<small>Sortie</small>' + U.label(h), 'gold');
    });
  }

  function callout(html, cls) {
    wrap.querySelectorAll('.callout').forEach((n) => n.remove());
    const d = mk('div', 'callout ' + (cls || ''), html);
    wrap.appendChild(d);
    d.addEventListener('animationend', () => d.remove());
  }

  /* --- mode caméra : annonces plein écran + voix --- */
  const SPOKEN = (h) => (h.m === 0 ? 'Raté' : h.n === 25 ? (h.m === 2 ? 'Bull' : 'Vingt-cinq') : h.m === 3 ? 'Triple ' + h.n : h.m === 2 ? 'Double ' + h.n : String(h.n));
  function say(text) {
    if (!live.on || !live.speech || !window.speechSynthesis) return;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text); u.lang = 'fr-FR'; u.rate = 1.05;
      const v = speechSynthesis.getVoices().find((x) => /^fr/i.test(x.lang)); if (v) u.voice = v;
      speechSynthesis.speak(u);
    } catch (e) {}
  }
  function bigPop(html, cls, ms) {
    document.querySelectorAll('.bigpop').forEach((n) => n.remove());
    const d = mk('div', 'bigpop ' + (cls || ''), `<div class="bp-in">${html}</div>`);
    d.style.setProperty('--pc', state ? cur().color : '#f4c04e');
    d.style.animationDuration = d.firstChild.style.animationDuration = (ms || 1500) + 'ms';
    document.body.appendChild(d);
    d.addEventListener('animationend', (e) => { if (e.target === d) d.remove(); });
  }
  function announce(html, cls) { if (live.on) bigPop(html, cls); else callout(html, cls); }
  function liveDart(h, ev) {
    const c = state.cfg, v = state.visit, pts = h.n * h.m;
    const cls = h.n === 25 && h.m === 2 ? 'gold' : h.m === 3 ? 'red' : h.m === 2 ? 'green' : h.m === 0 ? 'dim' : '';
    const lab = h.m === 0 ? 'Raté' : U.longLabel(h);
    let main, em = '';
    if (c.type === 'x01') {
      main = h.m === 0 ? '–' : pts;
      if (state.phase === 'visitDone' && !v.busted) em = 'Volée : ' + v.total;
    } else if (c.type === 'cricket') {
      main = h.m === 0 ? '–' : G.CRICKET.includes(h.n) ? (h.n === 25 ? 'BULL' : h.n) + ' ×' + h.m : '–';
      const extra = v.total; if (extra) em = 'Points de la volée : ' + extra;
    } else main = '';
    if (c.type === 'clock') main = h.m === 0 ? 'Raté' : ev.some((e) => e.t === 'advance') ? 'Touché !' : '–';
    bigPop(`<small>${lab}</small>${main}${em ? `<em>${em}</em>` : ''}`, cls, 1300);
    say(SPOKEN(h));
  }
  function floatText(txt, h, color) {
    if (live.on) return;
    const [sx, sy] = board.toScreen(h.x, h.y);
    const d = mk('div', 'float', txt);
    d.style.left = sx + 'px'; d.style.top = sy - 40 + 'px';
    if (color) d.style.color = color;
    document.body.appendChild(d);
    d.addEventListener('animationend', () => d.remove());
  }
  function turnPop() {
    if (!state) return;
    wrap.querySelectorAll('.turn-pop').forEach((n) => n.remove());
    if (live.on) {
      const p0 = cur(), c = state.cfg;
      const info = c.type === 'x01' ? `Il te reste ${p0.score}` : c.type === 'clock' ? `Vise le ${G.CLOCK[Math.min(p0.idx, 20)] === 25 ? 'bull' : G.CLOCK[Math.min(p0.idx, 20)]}` : `${p0.points} points`;
      bigPop(`<small>À toi</small>${esc(p0.name)}<em>${info}</em>`, 'turn', 2000);
      say(`${p0.name}, ${info.toLowerCase()}`);
      return;
    }
    const p = cur(), d = mk('div', 'turn-pop', `<small>À toi</small>${esc(p.name)}`);
    d.style.setProperty('--pc', p.color);
    wrap.appendChild(d);
    d.addEventListener('animationend', () => d.remove());
  }

  /* --- joueur suivant / annuler --- */
  async function next() {
    if (!state || busy || state.phase === 'over') return;
    busy = true; updateButtons();
    pushHistory();
    A.swish();
    await Promise.race([board.clearDarts(true), new Promise((r) => setTimeout(r, 900))]);
    G.nextPlayer(state);
    save();
    busy = false;
    refresh(false);
    turnPop();
  }
  function undo() {
    if (busy || !history.length) return;
    hideModal('win');
    state = JSON.parse(history.pop());
    save(); A.tick();
    syncDarts();
    wrap.querySelectorAll('.callout,.turn-pop').forEach((n) => n.remove());
    refresh(true);
  }
  $('#btn-next').onclick = next;
  $('#btn-undo').onclick = undo;
  $('#btn-miss').onclick = onMiss;

  /* --- victoire --- */
  function winSequence() {
    store.del('game');
    setTimeout(() => {
      if (state.phase !== 'over') { busy = false; return; }
      A.fanfare();
      const w = state.players[state.winner];
      const cols = [w.color, '#f6d27a', '#f4ecd8', '#e5483c'];
      confetti(innerWidth * 0.2, innerHeight * 0.75, cols, 110, 1.3);
      confetti(innerWidth * 0.8, innerHeight * 0.75, cols, 110, 1.3);
      setTimeout(() => confetti(innerWidth / 2, innerHeight * 0.3, cols, 140, 1), 350);
      showWin();
      busy = false; updateButtons();
    }, 950);
  }
  function showWin() {
    const c = state.cfg, w = state.players[state.winner];
    let head, rows;
    if (c.type === 'x01') {
      head = '<th>Joueur</th><th>Moy.</th><th>Meilleure</th><th>180</th><th>Fléch.</th>';
      rows = (p) => `<td>${esc(p.name)}</td><td>${G.avg(p)}</td><td>${p.best || '–'}</td><td>${p.n180}</td><td>${p.darts}</td>`;
    } else if (c.type === 'cricket') {
      head = '<th>Joueur</th><th>Points</th><th>Marques / volée</th><th>Fléch.</th>';
      rows = (p) => `<td>${esc(p.name)}</td><td>${p.points}</td><td>${G.mpr(p)}</td><td>${p.darts}</td>`;
    } else {
      head = '<th>Joueur</th><th>Cases</th><th>Fléch.</th>';
      rows = (p) => `<td>${esc(p.name)}</td><td>${Math.min(21, p.idx)}/21</td><td>${p.darts}</td>`;
    }
    const gname = c.type === 'x01' ? c.start : c.type === 'cricket' ? 'Cricket' : "Tour de l'horloge";
    const sh = $('#win-sheet');
    sh.style.setProperty('--pc', w.color);
    sh.innerHTML = `<div class="crown">Victoire · ${gname}</div><h3>${esc(w.name)}</h3>
      <div class="wsub">en ${state.round} ${state.round > 1 ? 'tours' : 'tour'}</div>
      <table class="stats"><tr>${head}</tr>${state.players.map((p, i) => `<tr class="${i === state.winner ? 'w' : ''}" style="--c:${p.color}">${rows(p).replace('<td>', '<td><i></i>')}</tr>`).join('')}</table>
      <div class="sheet-actions"><button class="btn primary" id="w-again">Revanche</button><button class="btn ghost" id="w-home">Nouvelle partie</button></div>
      <button class="link" id="w-undo">Annuler le dernier lancer</button>`;
    $('#win').classList.remove('hidden');
    $('#w-again').onclick = () => {
      const n = c.names.slice(1).concat(c.names[0]), col = (c.colors || G.COLORS).slice(1).concat((c.colors || G.COLORS)[0]);
      startNew(Object.assign({}, c, { names: n, colors: col }));
    };
    $('#w-home').onclick = () => { hideModal('win'); showScreen('home'); };
    $('#w-undo').onclick = undo;
  }

  /* --- menu --- */
  const RULES = {
    x01: (c) => `<p>Pars de <b>${c.start}</b> et descends jusqu’à <b>zéro</b>. Trois fléchettes par volée.</p><p>${c.doubleOut ? 'Il faut finir <b>sur un double</b> (ou le bull). ' : ''}Si tu dépasses, ou si tu laisses 1 en sortie en double, c’est un <b>bust</b> : le score revient à celui du début de la volée.</p>`,
    cricket: () => '<p>Ferme les cibles <b>20, 19, 18, 17, 16, 15 et le bull</b> avec 3 marques chacune (double = 2, triple = 3).</p><p>Une fois fermé, chaque marque en plus rapporte des points, tant qu’un adversaire ne l’a pas fermé. Gagne en fermant tout avec au moins autant de points que les autres.</p>',
    clock: (c) => `<p>Touche dans l’ordre <b>1, 2, 3… 20</b> puis le <b>bull</b>. Toutes les zones du numéro comptent.</p>${c.advance ? '<p>Un double fait avancer de 2 cases, un triple de 3.</p>' : ''}`,
  };
  function openMenu() { $('#rules').innerHTML = RULES[state.cfg.type](state.cfg); $('#menu').classList.remove('hidden'); }
  function hideModal(id) { $('#' + id).classList.add('hidden'); }
  $('#btn-menu').onclick = openMenu;
  $('#m-resume').onclick = () => hideModal('menu');
  $('#menu').addEventListener('pointerdown', (e) => { if (e.target.id === 'menu') hideModal('menu'); });
  function confirmBtn(id, label, fn) {
    const b = $(id), base = b.textContent; let t = 0;
    b.onclick = () => {
      if (t) { clearTimeout(t); t = 0; b.textContent = base; fn(); return; }
      b.textContent = label; t = setTimeout(() => { t = 0; b.textContent = base; }, 3000);
    };
  }
  confirmBtn('#m-restart', 'Confirmer : recommencer', () => { hideModal('menu'); startNew(Object.assign({}, state.cfg)); });
  confirmBtn('#m-quit', 'Confirmer : quitter', () => { hideModal('menu'); showScreen('home'); });
  $('#btn-sound').onclick = () => { const on = A.toggle(); $('#btn-sound').classList.toggle('off', !on); if (on) A.ding(1); };
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideModal('menu'); });

  /* --- confettis --- */
  const cv = $('#confetti'), cx = cv.getContext('2d');
  let parts = [], raf = 0;
  function confetti(x, y, colors, n, power) {
    const dpr = Math.min(2, devicePixelRatio || 1);
    cv.width = innerWidth * dpr; cv.height = innerHeight * dpr;
    cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = (4 + Math.random() * 11) * power;
      parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 9 * power, w: 6 + Math.random() * 7, h: 3 + Math.random() * 5, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4, c: colors[i % colors.length], life: 0, max: 110 + Math.random() * 90 });
    }
    if (!raf) raf = requestAnimationFrame(loop);
  }
  function loop() {
    cx.clearRect(0, 0, innerWidth, innerHeight);
    parts = parts.filter((p) => p.life++ < p.max);
    parts.forEach((p) => {
      p.vy += 0.38; p.vx *= 0.985; p.vy *= 0.985; p.x += p.vx; p.y += p.vy; p.r += p.vr;
      cx.save(); cx.translate(p.x, p.y); cx.rotate(p.r); cx.globalAlpha = Math.min(1, (p.max - p.life) / 30);
      cx.fillStyle = p.c; cx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.r * 2)) + 1); cx.restore();
    });
    raf = parts.length ? requestAnimationFrame(loop) : 0;
  }

  /* ================= DÉMARRAGE ================= */
  renderGames(); renderPlayers(); renderOptions();
  showScreen('home');
  /* points d'entrée pour la caméra */
  O.app = {
    phase: () => (state ? state.phase : null),
    visitDarts: () => (state ? state.visit.darts.length : 0),
    busy: () => busy,
    active: () => !$('#game').classList.contains('hidden'),
    canThrow: () => !!state && state.phase === 'throwing' && !busy,
    throwAt(x, y) { if (!this.canThrow()) return false; onThrow(U.zoneAt(x, y)); return true; },
    next,
  };
  window.OCHE.debug ={ get state() { return state; }, onThrow, next, undo, startNew, zoneAt: U.zoneAt };
})();
