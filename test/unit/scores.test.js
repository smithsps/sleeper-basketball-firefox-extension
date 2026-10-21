import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadSnp } from './load.js';

const { scores } = loadSnp();
const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

test('shows each matchup with record, win % and totals', () => {
  const s = {
    week: 1, minWeek: 1, maxWeek: 21, currentWeek: 1, now: Date.parse('2026-10-22T12:00:00Z'),
    league: { status: 'in_season', roster_positions: ['PG', 'BN'], settings: {} },
    usersById: { u1: { display_name: 'a', metadata: { team_name: 'Alpha' } }, u2: { display_name: 'b' } },
    rosters: [
      { roster_id: 1, owner_id: 'u1', settings: { wins: 2, losses: 1 }, players: [], reserve: [] },
      { roster_id: 2, owner_id: 'u2', settings: { wins: 1, losses: 2 }, players: [], reserve: [] },
    ],
    players: {},
    weeks: { 1: { days: [], gamesByTeam: {}, proj: {}, actual: {}, matchups: [], legs: [
      { roster_id: 1, matchup_id: 1, starters: [], points: 90.5, proj_points: 120, starters_games: {} },
      { roster_id: 2, matchup_id: 1, starters: [], points: 80, proj_points: 100, starters_games: {} },
    ] } },
  };
  const out = scores.render(s);
  assert.match(text(out), /Scoreboard.*Alpha 2-1 · \d+% win · 0 yet to play 120\.00 90\.50 b 1-2 · \d+% win · 0 yet to play 100\.00 80\.00/);
  assert.equal((out.match(/class="sc-team lead"/g) || []).length, 1, 'only the leader is highlighted');
  assert.match(text(scores.render({ ...s, weeks: {} })), /Loading week/);
});
