// Score previews for NBA leagues in Sleeper's left sidebar. Sleeper shows
// "you vs. opponent" with live scores and projections for its other sports and
// only the league's format for NBA. This fills the same markup, using Sleeper's
// own classes, from the same numbers the Matchup tab shows.
(globalThis.SNP ||= {}).sidebar = (() => {
  const { esc, f2 } = globalThis.SNP.ui;
  const ITEM = 'a.nav-league-item-wrapper[data-snp-sport="nba"]';
  const PREVIEW = 'snp-nav-matchup';
  const LIVE_REFRESH_MS = 60e3;
  const IDLE_REFRESH_MS = 10 * 60e3;
  const RETRY_MS = 5 * 60e3;

  // One side's score and projection, as Sleeper lays them out.
  const score = (t, flip) => `<div class="roster-score-and-projection-matchup${flip ? ' flip' : ''} row"><div class="score">${t ? f2(t.points) : '–'}</div><div class="projections">${t ? f2(t.proj) : '–'}</div></div>`;

  // The markup of Sleeper's `.nav-league-matchup` for a summary from matchup.summary.
  function html({ mine, theirs }) {
    return `<div class="nav-league-matchup">
      <div class="team-name-container"><div class="small-text">${esc(mine.name)}</div><div class="vs">vs.</div><div class="small-text right">${esc(theirs?.name ?? 'No opponent')}</div></div>
      <div class="score-container"><div class="left-score">${score(mine)}</div><div class="win-bar-wrapper"></div><div class="right-score">${score(theirs, true)}</div></div>
    </div>`;
  }

  function create(api, loader, matchup) {
    const leagues = new Map(); // league id -> { loading, nextAt, state }
    let base = null; // { nbaState, players, me }, shared by every league

    function loadBase() {
      base ??= Promise.all([api.get('/v1/state/nba'), loader.loadPlayers(false), loader.loadMe()])
        .then(([nbaState, players, me]) => ({ nbaState, players, me }))
        .catch((err) => {
          base = null;
          throw err;
        });
      return base;
    }

    async function load(id) {
      const { nbaState, players, me } = await loadBase();
      const league = await api.get(`/v1/league/${id}`);
      if (!me || league.sport !== 'nba' || league.status !== 'in_season') return null;
      const [users, rosters] = await Promise.all([api.get(`/v1/league/${id}/users`), loader.loadRosters(id)]);
      const mine = rosters.find((r) => r.owner_id === me || (r.co_owners || []).includes(me));
      if (!mine) return null;
      const minWeek = league.settings?.start_week || 1;
      const week = Math.max(Number(nbaState.display_week || nbaState.week || minWeek), minWeek);
      const data = await loader.loadWeek({ league, leagueId: id, rosters, week });
      return {
        league, rosters, players, me, week,
        usersById: Object.fromEntries(users.map((u) => [u.user_id, u])),
        rosterId: mine.roster_id,
        currentWeek: week,
        seasonType: nbaState.season_type,
        weeks: { [week]: data },
      };
    }

    function refresh(id, entry) {
      if (entry.loading || Date.now() < entry.nextAt) return;
      entry.loading = true;
      load(id)
        .then((state) => {
          entry.state = state;
          const live = state?.weeks[state.week].games.some((g) => g.status === 'in_game');
          entry.nextAt = Date.now() + (live ? LIVE_REFRESH_MS : IDLE_REFRESH_MS);
        })
        .catch((err) => {
          console.warn('[sleeper-nba-panel] sidebar preview unavailable', err);
          entry.nextAt = Date.now() + RETRY_MS;
        })
        .finally(() => {
          entry.loading = false;
          sync();
        });
    }

    // Called often (DOM changes and a timer): only touches the sidebar when the preview changed.
    function sync() {
      for (const link of document.querySelectorAll(ITEM)) {
        // The narrow sidebar is avatars only; there is no room for a score.
        const info = link.querySelector('.nav-info-container');
        const id = link.dataset.snpLeague;
        if (!info || !id) continue;
        let entry = leagues.get(id);
        if (!entry) leagues.set(id, (entry = { loading: false, nextAt: 0, state: null }));
        refresh(id, entry);
        const summary = entry.state && matchup.summary({ ...entry.state, now: Date.now() });
        let block = info.querySelector(`:scope > .${PREVIEW}`);
        if (!summary) {
          block?.remove();
          continue;
        }
        const markup = html(summary);
        if (!block) {
          block = document.createElement('div');
          block.className = PREVIEW;
          info.append(block);
        }
        if (block.dataset.markup !== markup) {
          block.innerHTML = markup;
          block.dataset.markup = markup;
        }
      }
    }

    return { sync };
  }

  return { html, create };
})();
