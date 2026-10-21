// Loads a league's data from Sleeper, for the open league's panel and for the
// score previews in the sidebar. Every request goes through the `api` it is given.
(globalThis.SNP ||= {}).createData = (api) => {
  const { model, scoring } = globalThis.SNP;
  const PLAYERS_PATH = '/v1/players/nba';
  const PLAYERS_KEY = 'players:nba:v4';
  const PLAYERS_TTL_MS = 12 * 3600e3;

  async function loadPlayers(force) {
    if (!force) {
      const { [PLAYERS_KEY]: hit } = await chrome.storage.local.get(PLAYERS_KEY);
      if (hit && Date.now() - hit.savedAt < PLAYERS_TTL_MS) {
        api.cached(PLAYERS_PATH, hit.players, JSON.stringify(hit.players).length);
        return hit.players;
      }
    }
    const raw = await api.get(PLAYERS_PATH);
    const players = {};
    for (const [id, p] of Object.entries(raw)) {
      players[id] = {
        name: p.full_name || `${p.first_name || ''} ${p.last_name || ''}`.trim(),
        first: p.first_name,
        last: p.last_name,
        team: p.team,
        position: p.position,
        positions: p.fantasy_positions || [],
        injury: p.injury_status,
        years_exp: p.years_exp,
      };
    }
    await chrome.storage.local.set({ [PLAYERS_KEY]: { savedAt: Date.now(), players } });
    return players;
  }

  // Rosters straight from Sleeper when logged in. The public REST endpoint is
  // cached at the CDN for up to ~10 minutes, so it can lag a save the user just made.
  async function loadRosters(leagueId) {
    if (api.loggedIn()) {
      try {
        const data = await api.graphql('league_rosters', `query league_rosters {
  league_rosters(league_id: ${JSON.stringify(leagueId)}) {
    roster_id owner_id co_owners players starters reserve taxi settings metadata
  }
}`, { auth: true });
        if (data?.league_rosters?.length) return data.league_rosters;
      } catch (err) {
        console.warn('[sleeper-nba-panel] league_rosters unavailable, using the public endpoint', err);
      }
    }
    return api.get(`/v1/league/${leagueId}/rosters`);
  }

  // Who is logged in, if anyone. Only used to decide which roster can be edited.
  async function loadMe() {
    if (!api.loggedIn()) return null;
    try {
      const data = await api.graphql('me', 'query me { me { user_id } }', { auth: true });
      return data?.me?.user_id ?? null;
    } catch (err) {
      console.warn('[sleeper-nba-panel] could not identify the logged-in user', err);
      return null;
    }
  }

  // Lineups, Lock-In picks (starters_games) and server projections for a week.
  // Needs the logged-in session; null when logged out or refused.
  async function loadLegs(leagueId, week) {
    if (!api.loggedIn()) return null;
    const query = `query matchup_legs {
  matchup_legs(league_id: ${JSON.stringify(leagueId)}, round: ${Number(week)}) {
    leg matchup_id roster_id round starters points proj_points max_points custom_points starters_games subs
  }
}`;
    try {
      const data = await api.graphql(`matchup_legs (week ${week})`, query, { auth: true });
      return data?.matchup_legs ?? null;
    } catch (err) {
      console.warn('[sleeper-nba-panel] matchup_legs unavailable', err);
      return null;
    }
  }

  // One week of a league: matchups, schedule, projections, stats and lineups.
  // `full` adds what only the panel shows (research percentages and standings ranks).
  async function loadWeek({ league, leagueId, rosters, week, full = false }) {
    const season = league.season;
    const seasonType = league.season_type || 'regular';
    const scoresQuery = `query scores {
  scores(sport: "nba", season_type: ${JSON.stringify(seasonType)}, season: ${JSON.stringify(season)}, week: ${Number(week)}) {
    date game_id metadata season season_type sport status start_time week
  }
}`;
    const standingsQuery = `query roster_standings {
  roster_standings(league_id: ${JSON.stringify(leagueId)}, round: ${Number(week)}) { roster_id rank }
}`;
    const [matchups, projections, stats, scores, legs, research, standings] = await Promise.all([
      api.get(`/v1/league/${leagueId}/matchups/${week}`),
      api.get(`/projections/nba/${season}/${week}?season_type=${seasonType}`),
      api.get(`/stats/nba/${season}/${week}?season_type=${seasonType}`),
      api.graphql(`scores (week ${week})`, scoresQuery),
      loadLegs(leagueId, week),
      full ? api.get(`/players/nba/research/${seasonType}/${season}/${week}?league_type=${league.settings?.type ?? 0}`) : null,
      full
        ? api.graphql(`roster_standings (week ${week})`, standingsQuery)
          .then((data) => data?.roster_standings ?? [])
          .catch(() => [])
        : [],
    ]);
    const games = scores?.scores || [];
    const scoringSettings = league.scoring_settings || {};
    return {
      matchups: matchups || [],
      days: model.weekDays(games),
      gamesByTeam: model.gamesByTeam(games),
      games: games.map((g) => ({ start: g.start_time, status: g.status })),
      scores: games,
      statRows: stats || [],
      proj: model.pointsByGame(projections || [], scoringSettings, scoring.scoreStats),
      actual: model.pointsByGame(stats || [], scoringSettings, scoring.scoreStats),
      research: research || {},
      legs,
      ranks: model.standingsRanks(rosters, standings),
    };
  }

  // Play-by-play. Sleeper's per-game query only returns the game's latest 20 plays;
  // the week query returns every play of every game that week (a lot of data).
  function loadGamePlays({ season, seasonType, gameId }) {
    return api.graphql(`plays (game ${gameId})`, `query plays {
  plays(sport: "nba", season_type: ${JSON.stringify(seasonType)}, season: ${JSON.stringify(season)}, game_id: ${JSON.stringify(gameId)}) {
    play_id game_id sequence week metadata play_stats { stats player }
  }
}`).then((data) => data?.plays ?? []);
  }

  function loadWeekPlays({ season, seasonType, week, gameId }) {
    return api.graphql(`plays (week ${week})`, `query plays {
  plays(sport: "nba", season_type: ${JSON.stringify(seasonType)}, season: ${JSON.stringify(season)}, week: ${Number(week)}) {
    play_id game_id sequence week metadata play_stats { stats player }
  }
}`).then((data) => (data?.plays ?? []).filter((p) => p.game_id === gameId));
  }

  return { loadPlayers, loadRosters, loadMe, loadLegs, loadWeek, loadGamePlays, loadWeekPlays };
};
