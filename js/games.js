/* OCHE — moteur de jeu (X01, Cricket, Tour de l'horloge). Aucune dépendance au DOM. */
(function () {
  const OCHE = (window.OCHE = window.OCHE || {});
  const COLORS = ['#ff7a59', '#f4c04e', '#46d6b5', '#7fa8ff'];
  const CRICKET = [20, 19, 18, 17, 16, 15, 25];
  const CLOCK = Array.from({ length: 20 }, (_, i) => i + 1).concat([25]);

  function newVisit() {
    return { darts: [], startScore: 0, total: 0, busted: false, finalized: false };
  }

  function create(cfg) {
    const players = cfg.names.map((name, i) => {
      const p = { name, color: (cfg.colors || COLORS)[i % COLORS.length], darts: 0, scored: 0, best: 0, n180: 0, last: null };
      if (cfg.type === 'x01') p.score = cfg.start;
      if (cfg.type === 'cricket') {
        p.marks = {};
        CRICKET.forEach((t) => (p.marks[t] = 0));
        p.points = 0;
        p.markThrown = 0;
      }
      if (cfg.type === 'clock') { p.idx = 0; p.hits = 0; }
      return p;
    });
    return { cfg, players, turn: 0, round: 1, visit: newVisit(), phase: 'throwing', winner: null };
  }

  /* ---------- Lancer ---------- */
  function throwDart(state, h) {
    if (state.phase !== 'throwing') return [];
    const p = state.players[state.turn];
    const v = state.visit;
    const pts = h.n * h.m;
    const dart = { n: h.n, m: h.m, pts, x: h.x == null ? null : h.x, y: h.y == null ? null : h.y };
    const ev = [{ t: 'hit', h: dart }];
    p.darts++;
    if (v.darts.length === 0) v.startScore = p.score;
    v.darts.push(dart);

    if (state.cfg.type === 'x01') x01(state, p, v, h, pts, dart, ev);
    else if (state.cfg.type === 'cricket') cricket(state, p, v, h, dart, ev);
    else clock(state, p, v, h, dart, ev);

    if (state.phase === 'throwing' && v.darts.length >= 3) state.phase = 'visitDone';
    if (state.phase !== 'throwing') closeVisit(state, ev);
    return ev;
  }

  function x01(state, p, v, h, pts, dart, ev) {
    const ns = p.score - pts;
    const dbl = state.cfg.doubleOut;
    const bust = ns < 0 || (dbl && (ns === 1 || (ns === 0 && h.m !== 2)));
    if (bust) {
      dart.bust = true;
      p.score = v.startScore;
      p.scored -= v.total;
      v.total = 0;
      v.busted = true;
      state.phase = 'visitDone';
      ev.push({ t: 'bust' });
      return;
    }
    p.score = ns;
    p.scored += pts;
    v.total += pts;
    if (ns === 0) {
      state.phase = 'over';
      state.winner = state.turn;
      ev.push({ t: 'win' });
    }
  }

  function cricket(state, p, v, h, dart, ev) {
    if (CRICKET.includes(h.n) && h.m > 0) {
      p.markThrown += h.m;
      for (let k = 0; k < h.m; k++) {
        if (p.marks[h.n] < 3) {
          p.marks[h.n]++;
          if (p.marks[h.n] === 3) ev.push({ t: 'close', n: h.n });
        } else if (state.players.some((q) => q !== p && q.marks[h.n] < 3)) {
          p.points += h.n;
          v.total += h.n;
          ev.push({ t: 'points', v: h.n });
        }
      }
    }
    const closedAll = CRICKET.every((t) => p.marks[t] >= 3);
    const others = state.players.filter((q) => q !== p).map((q) => q.points);
    const maxOther = others.length ? Math.max(...others) : 0;
    if (closedAll && p.points >= maxOther) {
      state.phase = 'over';
      state.winner = state.turn;
      ev.push({ t: 'win' });
    }
  }

  function clock(state, p, v, h, dart, ev) {
    const target = CLOCK[p.idx];
    if (h.m > 0 && h.n === target) {
      const adv = state.cfg.advance ? h.m : 1;
      p.idx += adv;
      p.hits++;
      v.total += adv;
      ev.push({ t: 'advance', v: adv });
      if (p.idx >= CLOCK.length) {
        p.idx = CLOCK.length;
        state.phase = 'over';
        state.winner = state.turn;
        ev.push({ t: 'win' });
      }
    }
  }

  function closeVisit(state, ev) {
    const v = state.visit;
    if (v.finalized) return;
    v.finalized = true;
    const p = state.players[state.turn];
    p.last = v.total;
    if (state.cfg.type !== 'x01') return;
    if (v.total > p.best) p.best = v.total;
    if (v.total === 180) {
      p.n180++;
      ev.push({ t: '180' });
    } else if (v.total >= 100) ev.push({ t: 'ton', v: v.total });
  }

  /* ---------- Joueur suivant ---------- */
  function nextPlayer(state) {
    if (state.phase === 'over') return [];
    const ev = [];
    const p = state.players[state.turn];
    const v = state.visit;
    if (!v.busted && v.darts.length < 3 && state.phase === 'throwing') p.darts += 3 - v.darts.length;
    closeVisit(state, ev);
    state.turn = (state.turn + 1) % state.players.length;
    if (state.turn === 0) state.round++;
    state.visit = newVisit();
    state.phase = 'throwing';
    return ev;
  }

  /* ---------- Stats ---------- */
  function avg(p) {
    return p.darts ? ((p.scored / p.darts) * 3).toFixed(1) : '–';
  }
  function mpr(p) {
    return p.darts ? ((p.markThrown / p.darts) * 3).toFixed(2) : '–';
  }

  /* ---------- Aide à la sortie (checkout) ---------- */
  const HITS = [];
  for (let n = 1; n <= 20; n++) for (let m = 1; m <= 3; m++) HITS.push({ n, m, pts: n * m });
  HITS.push({ n: 25, m: 1, pts: 25 }, { n: 25, m: 2, pts: 50 });
  const DBL_PREF = [20, 16, 18, 10, 8, 12, 6, 4, 2, 14, 25, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];
  const short = (h) => (h.n === 25 ? (h.m === 2 ? 'BULL' : '25') : ['', '', 'D', 'T'][h.m] + h.n);

  function checkout(score, dartsLeft, doubleOut) {
    if (score < 2 || score > 170 || dartsLeft < 1) return null;
    const okLast = (h) => !doubleOut || h.m === 2;
    let best = null;
    const consider = (seq) => {
      const last = seq[seq.length - 1];
      const setup = seq.slice(0, -1).reduce((a, h) => a + (60 - h.pts), 0);
      const lastPen = last.m === 2 ? DBL_PREF.indexOf(last.n) * 2 : 30;
      const rank = seq.length * 1000 + setup + lastPen;
      if (!best || rank < best.rank) best = { rank, seq };
    };
    for (const a of HITS) {
      if (a.pts === score && okLast(a)) consider([a]);
    }
    if (best) return best.seq.map(short);
    if (dartsLeft >= 2) {
      for (const a of HITS) for (const b of HITS) if (a.pts + b.pts === score && okLast(b)) consider([a, b]);
      if (best) return best.seq.map(short);
    }
    if (dartsLeft >= 3) {
      for (const a of HITS)
        for (const b of HITS) {
          const rest = score - a.pts - b.pts;
          if (rest < 1) continue;
          for (const c of HITS) if (c.pts === rest && okLast(c)) consider([a, b, c]);
        }
      if (best) return best.seq.map(short);
    }
    return null;
  }

  OCHE.games = { create, throwDart, nextPlayer, avg, mpr, checkout, COLORS, CRICKET, CLOCK };
})();
