// Scores view: every matchup of the week with live scores, projections and win probability.
(globalThis.SNP ||= {}).scores = (() => {
  const { esc, f2, teamName, avatar, record, weekNav } = globalThis.SNP.ui;

  function render(s) {
    if (s.error) return `<p class="msg error">${esc(s.error)}</p>`;
    const week = s.weeks?.[s.week];
    const list = globalThis.SNP.matchup.pairs(s);
    const head = `<div class="section-head"><h3>Scoreboard</h3>${weekNav(s, week)}</div>`;
    if (!list) return `${head}<p class="msg">Loading week…</p>`;
    if (!list.length) return `${head}<p class="msg">No matchups this week</p>`;
    return `${head}<div class="sc-grid">${list.map((m) => card(s, m)).join('')}</div>`;
  }

  function card(s, { a, b, pa, pb }) {
    const lead = (x, y) => (x.anyPoints || y?.anyPoints) && x.points > (y?.points ?? 0) ? ' lead' : '';
    return `<article class="sc-card${a.mine || b?.mine ? ' mine' : ''}">
      ${team(s, a, pa, lead(a, b))}
      ${b ? team(s, b, pb, lead(b, a)) : '<div class="sc-team bye"><span class="sub">No opponent this week</span></div>'}
    </article>`;
  }

  function team(s, sd, prob, lead) {
    const { roster } = sd;
    const image = avatar(s, roster);
    const pct = prob == null ? null : Math.round(prob * 100);
    return `<div class="sc-team${lead}">
      ${image ? `<img class="avatar" src="${esc(image)}" alt="">` : '<div class="avatar"></div>'}
      <div class="sc-who">
        <div class="team-name">${esc(teamName(s, roster))}</div>
        <div class="sub">${record(roster)}${pct == null ? '' : ` · ${pct}% win`} · ${sd.yetToPlay} yet to play</div>
      </div>
      <div class="sc-proj">${f2(sd.proj)}</div>
      <div class="sc-pts">${sd.anyPoints ? f2(sd.points) : '–'}</div>
    </div>`;
  }

  return { render };
})();
