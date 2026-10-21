import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadSnp } from './load.js';

const { scores } = loadSnp();
const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

const side = (team, points, record, quarters) => ({ team, points, record, scoring: quarters.map((p, i) => ({ number: i + 1, points: p, type: 'quarter' })) });
const game = (id, date, start, status, away, home, extra = {}) => ({ game_id: id, date, start_time: start, status, metadata: { away_team: away, home_team: home, clock: '00:00', quarter_num: 4, ...extra } });
const stat = (player_id, game_id, team, stats) => ({ player_id, game_id, team, stats });

const state = (overrides = {}) => ({
  week: 1, minWeek: 1, maxWeek: 21, currentWeek: 1, me: 'u1', gameId: null,
  usersById: { u1: { display_name: 'a', metadata: { team_name: 'Alpha' } }, u2: { display_name: 'b' } },
  rosters: [
    { roster_id: 1, owner_id: 'u1', players: ['luka'] },
    { roster_id: 2, owner_id: 'u2', players: ['don'] },
  ],
  players: {
    luka: { name: 'Luka Doncic', first: 'Luka', last: 'Doncic', team: 'LAL', positions: ['PG'] },
    don: { name: 'Donovan Mitchell', first: 'Donovan', last: 'Mitchell', team: 'CLE', positions: ['SG'] },
    free: { name: 'Free Guy', first: 'Free', last: 'Guy', team: 'LAL', positions: ['C'] },
  },
  weeks: {
    1: {
      days: ['2026-10-20'],
      scores: [
        game('g1', '2026-10-20', 1000, 'complete', side('GSW', 101, '0-1', [25, 25, 25, 26]), side('LAL', 110, '1-0', [30, 20, 30, 30])),
        game('g2', '2026-10-21', 2000, 'pre_game', { team: 'CLE', record: '0-0' }, { team: 'BOS', record: '0-0' }),
      ],
      statRows: [
        stat('luka', 'g1', 'LAL', { min: 36, pts: 41, reb: 8, ast: 9, stl: 0 }),
        stat('free', 'g1', 'LAL', { min: 10, pts: 4, reb: 7 }),
        stat('TEAM_LAL', 'g1', 'LAL', { pts: 110 }),
      ],
      actual: { luka: { g1: 62.5 }, free: { g1: 12 } },
      proj: { luka: { g1: 55 }, don: { g2: 48.5 } },
    },
  },
  ...overrides,
});

test('games come in tip-off order with scores, records and quarters', () => {
  const [a, b] = scores.games(state().weeks[1]);
  assert.deepEqual([a.id, a.away.points, a.home.record, ...a.home.quarters], ['g1', 101, '1-0', 30, 20, 30, 30]);
  assert.equal(b.away.points, null);
});

test('status reads FINAL, OT, HALF, a running clock, or the tip-off time', () => {
  const g = (status, extra) => ({ status, ...extra });
  assert.equal(scores.statusText(g('complete', { quarter: 4 })), 'FINAL');
  assert.equal(scores.statusText(g('complete', { quarter: 5 })), 'FINAL/OT');
  assert.equal(scores.statusText(g('complete', { quarter: 6 })), 'FINAL/2OT');
  assert.equal(scores.statusText(g('in_game', { quarter: 3, clock: '05:12' })), 'Q3 5:12');
  assert.equal(scores.statusText(g('in_game', { quarter: 2, halftime: true })), 'HALF');
  assert.equal(scores.statusText(g('in_game', { quarter: 5, clock: '01:00' })), 'OT 1:00');
  assert.match(scores.statusText(g('pre_game', { start: Date.parse('2026-10-21T23:30:00Z') })), /\d:\d\dpm/);
});

test('opens a live game, else the latest finished one, else the first', () => {
  const list = scores.games(state().weeks[1]);
  assert.equal(scores.pickGame(list, null), 'g1');
  assert.equal(scores.pickGame(list, 'g2'), 'g2');
  assert.equal(scores.pickGame(list, 'leaders'), 'leaders');
  assert.equal(scores.pickGame([{ id: 'x', status: 'pre_game' }, { id: 'y', status: 'in_game' }], null), 'y');
  assert.equal(scores.pickGame([{ id: 'x', status: 'pre_game' }], null), 'x');
});

test('box score lists players best first, with fantasy points, projection and owner', () => {
  const out = scores.render(state());
  assert.match(text(out), /GSW 101 LAL 110/, 'ticker');
  assert.match(text(out), /FINAL/);
  assert.match(text(out), /Luka Doncic|L\. Doncic/);
  const t = text(out);
  assert.ok(t.indexOf('L. Doncic') < t.indexOf('F. Guy'), 'higher fantasy score first');
  assert.match(out, /class="gc-owner mine">Alpha</, 'your players are marked');
  assert.match(out, /Free agent/);
  assert.doesNotMatch(out, /TEAM_LAL/);
  assert.match(t, /62\.50 55\.00/);
});

test('before tip-off the box shows projections only', () => {
  const out = scores.render(state({ gameId: 'g2' }));
  assert.match(text(out), /Projected top scorers/);
  assert.match(text(out), /D\. Mitchell.*48\.50/);
});

test('week leaders rank the top fantasy scorers with a stat line', () => {
  const rows = scores.leaders(state().weeks[1]);
  assert.deepEqual(Array.from(rows, (r) => r.id), ['luka', 'free']);
  assert.equal(scores.statLine({ pts: 41, reb: 8, ast: 9, stl: 0, tpm: 3 }), '41 PTS, 8 REB, 9 AST, 3 3PM');
  const out = text(scores.render(state({ gameId: 'leaders' })));
  assert.match(out, /Top fantasy scorers this week 1 .*L\. Doncic.*41 PTS, 8 REB, 9 AST.*62\.50/);
});

test('loads, and has nothing to show without games', () => {
  assert.match(text(scores.render(state({ weeks: {} }))), /Loading week/);
  assert.match(text(scores.render(state({ weeks: { 1: { days: [], scores: [] } } }))), /No games this week/);
});
