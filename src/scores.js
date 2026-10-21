// Scores tab, laid out like Sleeper's Game Center: the week's NBA games down the
// left (score, status), and for the selected game a box score with each player's
// fantasy points, projection and owner in this league. A first entry ranks the
// week's top fantasy scorers.
(globalThis.SNP ||= {}).scores = (() => {
  const { esc, f2, teamLogo, teamName, headshot, shortName, weekNav, positions, gameTime } = globalThis.SNP.ui;
  const LEADERS = 'leaders';
  const LEADER_COUNT = 30;
  const PREVIEW_COUNT = 8;
  const STAT_COLUMNS = [['min', 'MIN'], ['pts', 'PTS'], ['reb', 'REB'], ['ast', 'AST'], ['stl', 'STL'], ['blk', 'BLK'], ['to', 'TO']];

  const isTeamRow = (id) => String(id).startsWith('TEAM_');

  // The schedule rows of a week, in tip-off order, with each side's score and quarters.
  function games(week) {
    const side = (t = {}) => ({ team: t.team, points: t.points ?? null, record: t.record, quarters: (t.scoring || []).map((q) => q.points) });
    return (week?.scores || []).map((g) => {
      const m = g.metadata || {};
      return {
        id: g.game_id,
        date: g.date,
        start: g.start_time,
        status: g.status,
        clock: m.clock,
        quarter: m.quarter_num ?? (Number(m.quarter) || null),
        halftime: m.status === 'halftime',
        away: side(m.away_team),
        home: side(m.home_team),
      };
    }).sort((a, b) => a.start - b.start);
  }

  function statusText(g) {
    if (g.status === 'complete') return g.quarter > 4 ? `FINAL/${g.quarter > 5 ? `${g.quarter - 4}OT` : 'OT'}` : 'FINAL';
    if (g.status === 'in_game') {
      if (g.halftime) return 'HALF';
      const q = g.quarter > 4 ? `OT${g.quarter > 5 ? g.quarter - 4 : ''}` : `Q${g.quarter ?? ''}`;
      return `${q} ${String(g.clock || '').replace(/^0/, '')}`.trim();
    }
    return g.start ? gameTime(g.start) : '';
  }

  // What opens by default: a live game, else the latest finished one, else the next to tip off.
  function pickGame(list, id) {
    if (id === LEADERS) return LEADERS;
    return list.find((g) => g.id === id)?.id
      ?? list.find((g) => g.status === 'in_game')?.id
      ?? list.filter((g) => g.status === 'complete').at(-1)?.id
      ?? list[0]?.id
      ?? null;
  }

  // Who owns each player in this league: { [player id]: { name, mine } }.
  function owners(s) {
    const out = {};
    for (const roster of s.rosters || []) {
      const owner = { name: teamName(s, roster), mine: s.me != null && (roster.owner_id === s.me || (roster.co_owners || []).includes(s.me)) };
      for (const id of roster.players || []) out[id] = owner;
    }
    return out;
  }

  const hasStats = (stats) => Boolean(stats) && Object.keys(stats).length > 0;

  // One game's players. Without stats (before tip-off) it is the projected top of each team.
  function gamePlayers(s, week, game) {
    const found = new Map();
    for (const r of week.statRows || []) {
      if (r.game_id === game.id && !isTeamRow(r.player_id) && hasStats(r.stats)) found.set(r.player_id, { id: r.player_id, team: r.team, stats: r.stats, row: r.player });
    }
    const projected = !found.size;
    if (projected) {
      for (const [id, byGame] of Object.entries(week.proj || {})) {
        const team = s.players[id]?.team;
        if (byGame[game.id] != null && (team === game.away.team || team === game.home.team)) found.set(id, { id, team, stats: null });
      }
    }
    const rows = [...found.values()].map((p) => ({ ...p, fpts: week.actual[p.id]?.[game.id], proj: week.proj[p.id]?.[game.id] }));
    const by = projected ? (p) => p.proj ?? 0 : (p) => p.fpts ?? 0;
    const sorted = rows.sort((a, b) => by(b) - by(a));
    return { projected, rows: sorted };
  }

  // Everyone with stats in any game of the week, best fantasy score first.
  function leaders(week) {
    const rows = [];
    for (const r of week.statRows || []) {
      const fpts = week.actual[r.player_id]?.[r.game_id];
      if (!isTeamRow(r.player_id) && hasStats(r.stats) && fpts != null) rows.push({ id: r.player_id, team: r.team, stats: r.stats, row: r.player, fpts, proj: week.proj[r.player_id]?.[r.game_id] });
    }
    return rows.sort((a, b) => b.fpts - a.fpts).slice(0, LEADER_COUNT);
  }

  // "27 PTS, 8 REB, 5 AST": the counting stats that happened.
  function statLine(stats) {
    const parts = [['pts', 'PTS'], ['reb', 'REB'], ['ast', 'AST'], ['stl', 'STL'], ['blk', 'BLK'], ['tpm', '3PM']];
    return parts.filter(([key]) => stats?.[key] > 0).map(([key, label]) => `${stats[key]} ${label}`).join(', ');
  }

  function info(s, p) {
    const known = s.players[p.id];
    if (known) return known;
    const r = p.row || {};
    return { name: `${r.first_name || ''} ${r.last_name || ''}`.trim() || `Player #${p.id}`, first: r.first_name, last: r.last_name, team: p.team, positions: r.fantasy_positions || [] };
  }

  const ownerText = (owner) => (owner ? `<span class="gc-owner${owner.mine ? ' mine' : ''}">${esc(owner.name)}</span>` : '<span class="gc-owner fa">Free agent</span>');

  function render(s) {
    if (s.error) return `<p class="msg error">${esc(s.error)}</p>`;
    const week = s.weeks?.[s.week];
    const head = `<div class="section-head"><h3>Game Center</h3>${weekNav(s, week)}</div>`;
    if (!week) return `${head}<p class="msg">Loading week…</p>`;
    const list = games(week);
    if (!list.length) return `${head}<p class="msg">No games this week</p>`;
    const selected = pickGame(list, s.gameId);
    const game = list.find((g) => g.id === selected);
    return `${head}<div class="gc">
      <nav class="gc-list" aria-label="Games">${ticker(list, selected)}</nav>
      <section class="gc-detail">${game ? detail(s, week, game) : leaderboard(s, week)}</section>
    </div>`;
  }

  function ticker(list, selected) {
    const day = (date) => new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    let last = null;
    const items = list.map((g) => {
      const heading = g.date !== last ? `<div class="gc-day">${esc(day(g.date))}</div>` : '';
      last = g.date;
      return `${heading}${tickerItem(g, g.id === selected)}`;
    });
    return `<button class="gc-game leaders${selected === LEADERS ? ' selected' : ''}" data-game="${LEADERS}"><b>WEEK LEADERS</b></button>${items.join('')}`;
  }

  function tickerItem(g, selected) {
    const done = g.status === 'complete';
    const winner = done && g.home.points !== g.away.points ? (g.home.points > g.away.points ? 'home' : 'away') : null;
    const team = (cls) => `<span class="gc-tm ${winner ? (winner === cls ? 'win' : 'lose') : ''}"><img src="${teamLogo(g[cls].team)}" alt="">${esc(g[cls].team)}<b>${g[cls].points ?? ''}</b></span>`;
    return `<button class="gc-game${selected ? ' selected' : ''}${g.status === 'in_game' ? ' live' : ''}" data-game="${esc(g.id)}">
      <span class="gc-status">${esc(statusText(g))}</span>${team('away')}${team('home')}
    </button>`;
  }

  function detail(s, week, game) {
    const { rows, projected } = gamePlayers(s, week, game);
    const owner = owners(s);
    const side = (cls) => {
      const mine = rows.filter((p) => p.team === game[cls].team);
      return playerTable(s, game[cls].team, projected ? mine.slice(0, PREVIEW_COUNT) : mine, projected, owner);
    };
    return `${scoreHeader(game)}
      <div class="gc-note">${projected ? 'Projected top scorers, before tip-off' : 'Box score'}</div>
      ${side('away')}${side('home')}`;
  }

  function scoreHeader(game) {
    const team = (t, cls) => `<div class="gc-hteam ${cls}">
      <img src="${teamLogo(t.team)}" alt="">
      <div><div class="gc-abbr">${esc(t.team)}</div><div class="sub">${esc(t.record || '')}</div></div>
      <div class="gc-score">${t.points ?? ''}</div>
    </div>`;
    const periods = Math.max(game.away.quarters.length, game.home.quarters.length);
    const label = (i) => (i < 4 ? `Q${i + 1}` : `OT${i > 4 ? i - 3 : ''}`);
    const lineScore = periods ? `<table class="gc-line"><thead><tr><th></th>${Array.from({ length: periods }, (_, i) => `<th>${label(i)}</th>`).join('')}<th>T</th></tr></thead><tbody>
      ${['away', 'home'].map((cls) => `<tr><td>${esc(game[cls].team)}</td>${Array.from({ length: periods }, (_, i) => `<td>${game[cls].quarters[i] ?? ''}</td>`).join('')}<td><b>${game[cls].points ?? ''}</b></td></tr>`).join('')}
    </tbody></table>` : '';
    return `<div class="gc-header">${team(game.away, 'away')}<div class="gc-when">${esc(statusText(game))}</div>${team(game.home, 'home')}</div>${lineScore}`;
  }

  function playerTable(s, team, rows, projected, owner) {
    if (!rows.length) return `<h3 class="gc-team-title">${esc(team)}</h3><p class="msg">No players yet</p>`;
    return `<h3 class="gc-team-title"><img src="${teamLogo(team)}" alt="">${esc(team)}</h3>
      <table class="gc-box"><thead><tr><th>Player</th>${STAT_COLUMNS.map(([, label]) => `<th>${label}</th>`).join('')}<th>FPTS</th><th>PROJ</th></tr></thead><tbody>
      ${rows.map((p) => {
        const who = info(s, p);
        return `<tr><td class="gc-p"><button data-player="${esc(p.id)}">${esc(shortName(who))}</button> ${positions(who)}<br>${ownerText(owner[p.id])}</td>
          ${STAT_COLUMNS.map(([key]) => `<td>${p.stats?.[key] == null ? '–' : Math.round(p.stats[key])}</td>`).join('')}
          <td class="gc-fpts">${projected ? '–' : f2(p.fpts)}</td><td>${p.proj == null ? '–' : f2(p.proj)}</td></tr>`;
      }).join('')}
      </tbody></table>`;
  }

  function leaderboard(s, week) {
    const owner = owners(s);
    const rows = leaders(week);
    if (!rows.length) return '<p class="msg">No scores yet this week</p>';
    return `<div class="gc-note">Top fantasy scorers this week</div>${rows.map((p, i) => {
      const who = info(s, p);
      return `<div class="gc-leader">
        <span class="gc-rank">${i + 1}</span>
        <img class="headshot" src="${headshot(p.id)}" alt="" data-player="${esc(p.id)}">
        <div class="gc-lwho"><div class="name"><button data-player="${esc(p.id)}">${esc(shortName(who))}</button></div>
          <div class="sub">${positions(who)} <span class="team">• ${esc(p.team || who.team || 'FA')}</span> ${ownerText(owner[p.id])}</div>
          <div class="sub">${esc(statLine(p.stats))}</div></div>
        <div class="gc-fpts big">${f2(p.fpts)}</div>
      </div>`;
    }).join('')}`;
  }

  return { render, games, pickGame, gamePlayers, leaders, statLine, statusText };
})();
