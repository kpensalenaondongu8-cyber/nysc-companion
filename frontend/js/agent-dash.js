/* Agent dashboard: /agent-dash */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const parts = (iso) => iso.split('-').map(Number);
const shortDate = (iso) => { const [y, m, d] = parts(iso); return d + ' ' + MONTHS[m - 1]; };
const longDate = (iso) => { const [y, m, d] = parts(iso); return DAYS[new Date(y, m - 1, d).getDay()] + ' ' + d + ' ' + MONTHS[m - 1]; };
const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);

let data = null;
let editing = null;          // the house whose rent is being changed

function kpi(label, value, sub) {
  return `<div class="kpi"><small>${label}</small><b>${value}</b><span>${sub}</span></div>`;
}

function drawChart(points) {
  const max = Math.max(1, ...points.map((p) => p.views));
  const total = points.reduce((s, p) => s + p.views, 0);
  $('chart-total').textContent = plural(total, 'view', 'views');
  $('chart').innerHTML = `<div class="grid-line" style="bottom:${100}%"><span>${max}</span></div>` + points.map((p, i) =>
    `<button type="button" class="bar${p.views ? '' : ' zero'}" data-i="${i}" aria-pressed="false"
        aria-label="${esc(longDate(p.day))}: ${plural(p.views, 'view', 'views')}"><i style="height:${p.views ? Math.max(3, p.views / max * 100) : 2}%"></i></button>`).join('');
  $('chart').insertAdjacentHTML('afterend', `<div class="ticks" aria-hidden="true"><span>${shortDate(points[0].day)}</span><span>${shortDate(points[Math.floor(points.length / 2)].day)}</span><span>Today</span></div>`);
  $('chart-table').innerHTML = '<tr><th>Day</th><th>Views</th></tr>' + points.map((p) => `<tr><td>${esc(longDate(p.day))}</td><td>${p.views}</td></tr>`).join('');
  const show = (b) => {
    const p = points[+b.dataset.i];
    document.querySelectorAll('#chart .bar').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    $('chart-tip').textContent = longDate(p.day) + ': ' + plural(p.views, 'view', 'views');
  };
  $('chart').addEventListener('mouseover', (e) => { const b = e.target.closest('.bar'); if (b) show(b); });
  $('chart').addEventListener('focusin', (e) => { const b = e.target.closest('.bar'); if (b) show(b); });
  $('chart').addEventListener('click', (e) => { const b = e.target.closest('.bar'); if (b) show(b); });
}

function houseCard(h) {
  const taken = h.status === 'taken';
  const photo = h.cover ? `<img src="${photoUrl(h.cover)}" alt="">` : '';
  const rentForm = editing === h.id
    ? `<form class="rent-form" data-rent-form="${h.id}">
         <div class="input-wrap"><span class="prefix">₦</span><input class="input has-prefix num" type="number" min="1" step="any" value="${h.rent_per_year}" aria-label="New yearly rent"></div>
         <button class="btn sm" type="submit">Save rent</button><button class="btn ghost sm" type="button" data-cancel="1">Cancel</button>
       </form><div class="notice" id="rn-${h.id}" role="status"></div>` : '';
  return `<article class="hcard${taken ? ' taken' : ''}">
    <div class="top"><div class="thumb">${photo}</div><div style="min-width:0">
      <h3>${esc(h.title)} ${taken ? '<span class="pill">Taken</span>' : ''}</h3>
      <div class="meta">${esc(h.house_type)} · ${esc(h.town)} · listed ${plural(h.days_listed, 'day', 'days')} ago</div>
      <div class="rent">${naira(h.rent_per_year)} <span class="meta">per year</span></div></div></div>
    <div class="nums">
      <div><b>${h.views}</b><small>Views (${h.views7} this week)</small></div>
      <div><b>${h.contacts}</b><small>Corps members who contacted you</small></div>
      <div><b>${h.whatsapp}</b><small>WhatsApp taps</small></div>
      <div><b>${h.calls}</b><small>Call taps</small></div>
    </div>
    ${h.tip ? `<div class="tip">${esc(h.tip)}</div>` : ''}
    ${rentForm}
    <div class="acts">
      <button class="btn ghost sm" type="button" data-edit="${h.id}">Change rent</button>
      <button class="btn ${taken ? '' : 'gold'} sm" type="button" data-status="${h.id}" data-to="${taken ? 'available' : 'taken'}">${taken ? 'Mark as available again' : 'Mark as taken'}</button>
      <a class="btn ghost sm" href="/house?id=${h.id}">Preview</a>
    </div></article>`;
}

function render() {
  const { summary: s, houses } = data;
  $('kpis').innerHTML =
    kpi('Houses on offer', s.available, s.taken ? plural(s.taken, 'taken', 'taken') : 'None taken yet') +
    kpi('Views this week', s.views7, s.views + ' in all') +
    kpi('Contacts this week', s.contacts7, s.contacts + ' in all') +
    kpi('Taken', s.taken, 'Hidden from corps members');
  $('best').hidden = !s.best;
  if (s.best) $('best').innerHTML = `<b>Most interest:</b> ${esc(s.best.title)}`;
  $('houses').innerHTML = houses.length ? houses.map(houseCard).join('')
    : '<div class="empty-box">You have not posted a house yet. <a class="link" href="/agent-hub">Post your first house</a> and the numbers will appear here.</div>';
}

async function load(first) {
  try {
    data = await api('GET', '/api/agent-dash');
    $('load-error').hidden = true;
  } catch (err) {
    $('load-error').textContent = err.message;
    $('load-error').hidden = false;
    return;
  }
  render();
  if (first) drawChart(data.chart);
  $('content').hidden = false;
}

$('houses').addEventListener('click', async (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.edit) { editing = +b.dataset.edit; render(); }
  else if (b.dataset.cancel) { editing = null; render(); }
  else if (b.dataset.status) {
    const taken = b.dataset.to === 'taken';
    if (taken && !confirm('Mark this house as taken? Corps members will stop seeing it. You can bring it back later.')) return;
    try { await api('PUT', '/api/agent-dash/house/' + b.dataset.status, { status: b.dataset.to }); await load(); }
    catch (err) { $('load-error').textContent = err.message; $('load-error').hidden = false; }
  }
});

$('houses').addEventListener('submit', async (e) => {
  const f = e.target.closest('[data-rent-form]');
  if (!f) return;
  e.preventDefault();
  const id = f.dataset.rentForm, rent = Number(f.querySelector('input').value);
  if (!(rent > 0)) return say('rn-' + id, 'Enter the yearly rent in naira.', 'bad');
  try {
    await api('PUT', '/api/agent-dash/house/' + id, { rent_per_year: rent });
    editing = null;
    await load();
  } catch (err) { say('rn-' + id, err.message, 'bad'); }
});

load(true);
