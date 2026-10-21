import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadSnp } from './load.js';

const { sidebar } = loadSnp();
const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

test('preview uses Sleeper\'s matchup markup with scores and projections', () => {
  const out = sidebar.html({
    mine: { name: 'COOKIE MONSTER', points: 87.8, proj: 120.5, any: true },
    theirs: { name: 'Cling <Kong>', points: 45.95, proj: 101.25, any: true },
  });
  assert.match(out, /class="nav-league-matchup"/);
  assert.match(out, /class="score">87\.80</);
  assert.match(out, /class="roster-score-and-projection-matchup flip row"><div class="score">45\.95</);
  assert.equal(text(out), 'COOKIE MONSTER vs. Cling &lt;Kong&gt; 87.80 120.50 45.95 101.25');
});

test('a bye week shows no opponent and dashes', () => {
  const out = sidebar.html({ mine: { name: 'Me', points: 0, proj: 0, any: false }, theirs: null });
  assert.equal(text(out), 'Me vs. No opponent 0.00 0.00 – –');
});
