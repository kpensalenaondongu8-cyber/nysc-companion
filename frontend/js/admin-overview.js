/* Admin overview: /admin-overview */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const parts = (iso) => iso.split('-').map(Number);
const shortDate = (iso) => { const [y, m, d] = parts(iso); return d + ' ' + MONTHS[m - 1]; };
const longDate = (iso) => { const [y, m, d] = parts(iso); return DAYS[new Date(y, m - 1, d).getDay()] + ' ' + d + ' ' + MONTHS[m - 1]; };
const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);
const kpi = (label, value, sub) => `<div class="kpi"><small>${label}</small><b>${value}</b><span>${sub}</span></div>`;

function attention(a) {
  const rows = [];
  if (a.agents_waiting) rows.push(`<a href="/admin"><span><b>${a.agents_waiting}</b> ${a.agents_waiting === 1 ? 'agent is' : 'agents are'} waiting for approval</span><span class="go">Review</span></a>`);
  const hidden = a.hidden_posts + a.hidden_replies;
  if (hidden) rows.push(`<a href="/admin#reported"><span><b>${hidden}</b> board ${hidden === 1 ? 'item was' : 'items were'} hidden after reports</span><span class="go">Review</span></a>`);
  if (a.ppa_reviews_reported) rows.push(`<a href="#ppa-reviews"><span><b>${a.ppa_reviews_reported}</b> PPA ${a.ppa_reviews_reported === 1 ? 'review was' : 'reviews were'} reported</span><span class="go">Review</span></a>`);
  $('attention').innerHTML = rows.length ? `<div class="attn">${rows.join('')}</div>` : '<div class="attn"><div class="ok">Nothing is waiting for you.</div></div>';
}

function drawChart(points) {
  const max = Math.max(1, ...points.map((p) => p.new));
  $('chart-total').textContent = plural(points.reduce((s, p) => s + p.new, 0), 'new account', 'new accounts');
  $('chart').innerHTML = `<div class="grid-line" style="bottom:100%"><span>${max}</span></div>` + points.map((p, i) =>
    `<button type="button" class="bar${p.new ? '' : ' zero'}" data-i="${i}" aria-pressed="false"
       aria-label="${esc(longDate(p.day))}: ${plural(p.new, 'new account', 'new accounts')}"><i style="height:${p.new ? Math.max(3, p.new / max * 100) : 2}%"></i></button>`).join('');
  $('chart').insertAdjacentHTML('afterend', `<div class="ticks" aria-hidden="true"><span>${shortDate(points[0].day)}</span><span>${shortDate(points[Math.floor(points.length / 2)].day)}</span><span>Today</span></div>`);
  $('chart-table').innerHTML = '<tr><th>Day</th><th>New accounts</th></tr>' + points.map((p) => `<tr><td>${esc(longDate(p.day))}</td><td>${p.new}</td></tr>`).join('');
  const show = (b) => {
    const p = points[+b.dataset.i];
    document.querySelectorAll('#chart .bar').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    $('chart-tip').textContent = longDate(p.day) + ': ' + plural(p.new, 'new account', 'new accounts');
  };
  for (const ev of ['mouseover', 'focusin', 'click']) $('chart').addEventListener(ev, (e) => { const b = e.target.closest('.bar'); if (b) show(b); });
}

function drawPlaces(places, none) {
  $('places').innerHTML = places.length
    ? '<tr><th>LGA</th><th class="n">Corps members</th><th class="n">Houses on offer</th></tr>' +
      places.map((p) => `<tr class="${p.houses ? '' : 'none'}"><td>${esc(p.lga)}, ${esc(p.state)}</td><td class="n">${p.corpers}</td><td class="n">${p.houses || 'None'}</td></tr>`).join('')
    : '<tr><td>No corps members have saved a PPA yet.</td></tr>';
  if (none.length) {
    $('short').hidden = false;
    $('short').innerHTML = '<b>Corps members here, but no houses yet:</b> ' + none.map((p) => `${esc(p.lga)} (${p.corpers})`).join(', ') + '. Agents in these LGAs would help most.';
  }
}

(async () => {
  try {
    const d = await api('GET', '/api/admin/overview');
    const t = d.totals;
    $('kpis').innerHTML =
      kpi('Corps members', t.corpers, plural(t.new_week, 'new account', 'new accounts') + ' this week') +
      kpi('Active this week', t.active_week, 'logged in at least once') +
      kpi('House agents', t.agents.approved, `${t.agents.pending} waiting · ${t.agents.rejected} rejected`) +
      kpi('Houses on offer', t.houses.available, `${t.houses.taken} taken`) +
      kpi('Reviews', t.reviews, 'written by corps members') +
      kpi('Board posts', t.posts, 'visible to corps members');
    attention(d.attention);
    drawChart(d.chart);
    drawPlaces(d.places, d.no_houses);
    $('content').hidden = false;
    loadReported();
  } catch (err) {
    $('load-error').textContent = err.message;
    $('load-error').hidden = false;
  }
})();

// Reported PPA reviews: keep (they are fine) or delete.
async function loadReported() {
  try {
    const r = await api('GET', '/api/ppa-reviews/admin/reported');
    const sec = $('ppa-reviews');
    if (!sec) return;
    sec.hidden = !r.reviews.length;
    $('mod-list').innerHTML = r.reviews.map((v) => `
      <li>
        <b>${esc(v.ppa_name)}</b> <span class="muted">${esc([v.lga, v.state].filter(Boolean).join(', '))}</span>
        <div>${stars(v.rating)} <span class="muted">${plural(v.reports, 'report', 'reports')}${v.hidden ? ' · hidden' : ''}</span></div>
        ${v.comment ? `<p style="margin:6px 0;overflow-wrap:anywhere;">${esc(v.comment)}</p>` : '<p class="muted" style="margin:6px 0;">No comment, rating only.</p>'}
        <div class="acts"><button class="btn sm" data-keep="${v.id}" type="button">Keep it</button><button class="btn sm ghost" data-del="${v.id}" type="button">Delete</button></div>
      </li>`).join('');
    document.querySelectorAll('[data-keep]').forEach((b) => b.addEventListener('click', async () => { await api('POST', '/api/ppa-reviews/admin/' + b.dataset.keep + '/keep'); loadReported(); }));
    document.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => { if (confirm('Delete this review for good?')) { await api('DELETE', '/api/ppa-reviews/admin/' + b.dataset.del); loadReported(); } }));
  } catch (e) { /* the panel just stays hidden */ }
}
