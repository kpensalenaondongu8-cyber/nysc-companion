let data = null;          // the latest answer from /api/dashboard
let filter = 'All';       // which category chip is selected

// ---------- helpers ----------
// Two letters for the icon in the history list: "Food" -> "FO", "Data & Airtime" -> "DA"
const abbr = (category) => category.replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase();

// The server saves date as "October-29-2026" and time as "03:12:44 PM".
function when(e) {
  const parts = e.date.split('-');
  if (parts.length !== 3) return e.date + ' ' + e.time;
  const time = e.time.replace(/:\d\d (?=[AP]M)/, ' ').replace(/^0/, '');
  return `${Number(parts[1])} ${parts[0].slice(0, 3)} ${parts[2]} · ${time}`;
}

// Show the saved-state helper for a category: what has been spent against its limit.
const limitFor = (category) => data.limits.find((l) => l.category === category);

// ---------- drawing the page ----------
function render() {
  const user = data.user;

  // No allowance yet: show only the setup card.
  if (!data.budget) {
    $('setup-name').textContent = user.first_name;
    $('setup').hidden = false;
    $('tracker').hidden = true;
    return;
  }
  $('setup').hidden = true;
  $('tracker').hidden = false;

  const b = data.budget;
  const pct = Math.min(100, Math.max(0, (b.remaining / b.monthly_income) * 100));
  $('t-balance').textContent = naira(b.remaining);
  $('t-income').textContent = naira(b.monthly_income);
  $('t-spent').textContent = naira(b.spent);
  $('t-bar').style.width = pct + '%';
  $('t-bar-s').textContent = b.remaining < 0
    ? `You are ${naira(-b.remaining)} over your allowance`
    : Math.round(pct) + '% of your allowance remains';
  $('tile-main').classList.toggle('low', b.remaining < 0);
  $('t-count').textContent = b.count === 1 ? '1 transaction' : b.count + ' transactions';
  $('pill').textContent = b.remaining < 0 ? 'Over allowance' : 'Within allowance';
  $('pill').style.background = b.remaining < 0 ? 'var(--danger-tint)' : '';
  $('pill').style.color = b.remaining < 0 ? 'var(--danger)' : '';

  // Drop-downs: keep whatever the user had selected.
  for (const id of ['e-cat', 'l-cat']) {
    const select = $(id);
    const chosen = select.value;
    select.innerHTML = data.categories.map((c) => `<option>${esc(c)}</option>`).join('');
    if (data.categories.includes(chosen)) select.value = chosen;
  }
  if (document.activeElement !== $('a-amt')) $('a-amt').value = b.monthly_income;

  // Spending limits
  $('limits').innerHTML = data.limits.map((l) => {
    const ratio = l.limit ? l.spent / l.limit : (l.spent ? 1 : 0);
    const cls = l.limit && ratio > 1 ? 'over' : l.limit && ratio >= 0.8 ? 'warn' : '';
    let note = '';
    if (l.limit && ratio > 1) note = `Over by ${naira(l.spent - l.limit)}`;
    else if (l.limit && ratio >= 0.8) note = `${naira(l.limit - l.spent)} left, nearly at your limit`;
    const width = Math.min(ratio, 1) * 100;
    return `<div class="limit ${cls}">
      <div class="top"><span class="name">${esc(l.category)}</span>
        <span class="amt num"><b>${naira(l.spent)}</b> of ${l.limit ? naira(l.limit) : 'no limit'}</span></div>
      <div class="progress" role="progressbar" aria-label="${esc(l.category)} spending" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(width)}"><i style="width:${width}%"></i></div>
      ${note ? `<div class="note num">${note}</div>` : ''}</div>`;
  }).join('');
  const planned = data.limits.reduce((sum, l) => sum + (l.limit || 0), 0);
  $('unalloc').innerHTML = `<span>Limits set: <b>${naira(planned)}</b></span><span>Not yet planned: <b>${naira(b.monthly_income - planned)}</b></span>`;

  // Filter chips + history list
  if (filter !== 'All' && !data.categories.includes(filter)) filter = 'All';
  $('filters').innerHTML = ['All', ...data.categories]
    .map((c) => `<button type="button" class="chip" data-f="${esc(c)}" aria-pressed="${filter === c}">${esc(c)}</button>`).join('');
  const shown = data.expenses.filter((x) => filter === 'All' || x.category === filter);
  $('statement').innerHTML = shown.length
    ? shown.map((x) => `<li class="tx"><div class="ic" aria-hidden="true">${esc(abbr(x.category))}</div>
        <div><div class="d">${esc(x.description)}</div><div class="m">${esc(x.category)} · ${esc(when(x))}</div></div>
        <div class="a num">−${naira(x.amount)}</div></li>`).join('')
    : `<li class="empty">${filter === 'All' ? 'No expenses yet. Log your first one above.' : 'No expenses in this category yet.'}</li>`;
  drawSpending();
}

// ---------- where the money went (one month, biggest category first) ----------
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
let spendMonth = '';       // "2026-10": the month being shown ('' = the newest month with spending)

function monthKey(e) {                       // "October-29-2026" -> "2026-10"
  const p = e.date.split('-');
  const m = MONTHS.indexOf(p[0]);
  return m < 0 || p.length !== 3 ? '' : p[2] + '-' + String(m + 1).padStart(2, '0');
}
// Each category keeps its own colour (slot 1-6). Any other category is folded into "Other" in the pie.
const SLOT = { 'Food': 1, 'Transport': 2, 'Data & Airtime': 3, 'Toiletries': 4, 'CDS & Contributions': 5, 'Other': 6 };
let spendView = 'pie';
try { spendView = localStorage.getItem('nysc_spview') === 'bars' ? 'bars' : 'pie'; } catch (e) { /* ignore */ }

function arc(cx, cy, r0, r1, a0, a1) {             // one donut slice, angles in turns (0 = top)
  const p = (r, a) => [cx + r * Math.sin(a * 2 * Math.PI), cy - r * Math.cos(a * 2 * Math.PI)];
  const big = a1 - a0 > 0.5 ? 1 : 0;
  const [x0, y0] = p(r1, a0), [x1, y1] = p(r1, a1), [x2, y2] = p(r0, a1), [x3, y3] = p(r0, a0);
  return `M${x0.toFixed(2)} ${y0.toFixed(2)}A${r1} ${r1} 0 ${big} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}L${x2.toFixed(2)} ${y2.toFixed(2)}A${r0} ${r0} 0 ${big} 0 ${x3.toFixed(2)} ${y3.toFixed(2)}Z`;
}

const monthName = (key) => MONTHS[Number(key.slice(5)) - 1] + ' ' + key.slice(0, 4);

function drawSpending() {
  const totals = {};                          // month -> { category -> amount }
  for (const e of data.expenses) {
    const k = monthKey(e);
    if (!k) continue;
    totals[k] = totals[k] || {};
    totals[k][e.category] = (totals[k][e.category] || 0) + e.amount;
  }
  const months = Object.keys(totals).sort().reverse();
  const sel = $('sp-month');
  if (!months.length) {
    sel.hidden = true;
    $('sp-sum').textContent = 'Nothing to show yet. Log an expense and it will appear here.';
    $('sp-bars').innerHTML = '';
    $('sp-table').parentElement.hidden = true;
    return;
  }
  sel.hidden = false;
  $('sp-table').parentElement.hidden = false;
  if (!months.includes(spendMonth)) spendMonth = months[0];
  sel.innerHTML = months.map((k) => `<option value="${k}">${esc(monthName(k))}</option>`).join('');
  sel.value = spendMonth;

  const rows = Object.entries(totals[spendMonth]).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const total = rows.reduce((s, r) => s + r[1], 0);
  const pct = (v) => (v * 100 / total < 0.5 ? '<1' : Math.round(v * 100 / total));
  const income = data.budget.monthly_income;
  $('sp-sum').innerHTML = `You spent <b class="num">${naira(total)}</b> in ${esc(monthName(spendMonth))}` +
    (income ? ` (${Math.round(total * 100 / income)}% of your allowance)` : '') +
    `. Most of it went on <b>${esc(rows[0][0])}</b>: ${pct(rows[0][1])}%.`;
  $('sp-bars').innerHTML = rows.map(([c, v], i) => `<li class="sp-row${i === 0 ? ' top' : ''}">
      <div class="sp-top"><span class="sp-name">${esc(c)}</span><span class="sp-val num">${naira(v)} <small>${pct(v)}%</small></span></div>
      <div class="sp-track"><i style="width:${Math.max(2, v * 100 / rows[0][1])}%"></i></div></li>`).join('');
  drawPie(rows, total, pct);
  $('sp-pie').hidden = spendView !== 'pie';
  $('sp-bars').hidden = spendView !== 'bars';
  $('sp-toggle').querySelectorAll('[data-view]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === spendView)));
  $('sp-table').innerHTML = '<tr><th>Category</th><th>Spent</th><th>Share</th></tr>' +
    rows.map(([c, v]) => `<tr><td>${esc(c)}</td><td class="num">${naira(v)}</td><td class="num">${pct(v)}%</td></tr>`).join('');
}
function drawPie(rows, total, pct) {
  // Merge categories without their own colour into "Other".
  const merged = {};
  for (const [c, v] of rows) { const k = SLOT[c] ? c : 'Other'; merged[k] = (merged[k] || 0) + v; }
  const slices = Object.entries(merged).sort((a, b) => b[1] - a[1]);
  let at = 0;
  const paths = slices.map(([c, v], i) => {
    const a0 = at, a1 = at + v / total; at = a1;
    const d = slices.length === 1 ? arc(100, 100, 56, 96, 0, 0.5) + arc(100, 100, 56, 96, 0.5, 1) : arc(100, 100, 56, 96, a0, a1);
    return `<path class="sp-slice sp${SLOT[c]}" d="${d}" tabindex="0" data-i="${i}" aria-label="${esc(c)}: ${naira(v)}, ${pct(v)}%"/>`;
  }).join('');
  $('sp-svg').innerHTML = paths;
  pieCenter = (i) => {
    const s = slices[i];
    $('sp-center').innerHTML = s ? `<b>${esc(s[0])}</b><span class="num">${naira(s[1])}</span><small>${pct(s[1])}%</small>`
                                 : `<small>Spent</small><b class="num">${naira(total)}</b>`;
    document.querySelectorAll('#sp-legend li').forEach((li, n) => li.classList.toggle('on', n === i));
    document.querySelectorAll('.sp-slice').forEach((el, n) => el.classList.toggle('dim', i !== null && n !== i));
  };
  $('sp-legend').innerHTML = slices.map(([c, v], i) => `<li data-i="${i}"><i class="sw sp${SLOT[c]}"></i><span class="sp-name">${esc(c)}</span><span class="sp-val num">${naira(v)} <small>${pct(v)}%</small></span></li>`).join('');
  pieCenter(null);
}
// Listeners are added once; pieCenter always points at the latest drawing.
let pieCenter = () => {};
for (const ev of ['mouseover', 'focusin', 'click']) $('sp-pie').addEventListener(ev, (e) => {
  const t = e.target.closest('[data-i]'); if (t) pieCenter(+t.dataset.i);
});
for (const ev of ['mouseleave', 'focusout']) $('sp-pie').addEventListener(ev, () => pieCenter(null));
$('sp-toggle').addEventListener('click', (e) => {
  const b = e.target.closest('[data-view]'); if (!b) return;
  spendView = b.dataset.view;
  try { localStorage.setItem('nysc_spview', spendView); } catch (err) { /* ignore */ }
  drawSpending();
});
$('sp-month').addEventListener('change', (e) => { spendMonth = e.target.value; drawSpending(); });

// ---------- loading ----------
async function load() {
  try {
    data = await api('GET', '/api/dashboard');
    $('load-error').hidden = true;
    render();
  } catch (err) {
    $('load-error').textContent = err.message;
    $('load-error').hidden = false;
  }
}

// ---------- events ----------
$('filters').addEventListener('click', (e) => {
  const button = e.target.closest('[data-f]');
  if (button) { filter = button.dataset.f; render(); }
});

// Setup card and the "change allowance" form both save an allowance.
async function saveAllowance(inputId, fieldId, noticeId, button) {
  const amount = Number($(inputId).value);
  if (setBad(fieldId, !(amount > 0))) return;
  button.disabled = true;
  try {
    data = await api('POST', '/api/allowance', { monthly_income: amount });
    render();
    if (noticeId) say(noticeId, 'Allowance updated.', 'ok');
  } catch (err) {
    say(noticeId || 'load-error', err.message, 'bad');
    if (!noticeId) $('load-error').hidden = false;
  }
  button.disabled = false;
}
$('setup-form').addEventListener('submit', (e) => {
  e.preventDefault();
  saveAllowance('setup-amt', 'f-setup', null, e.submitter);
});
$('allowance-form').addEventListener('submit', (e) => {
  e.preventDefault();
  saveAllowance('a-amt', 'f-a-amt', 'a-notice', e.submitter);
});

$('expense-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const category = $('e-cat').value;
  const amount = Number($('e-amt').value);
  const description = $('e-desc').value.trim();

  const amountBad = setBad('f-e-amt', !(amount > 0));
  const descBad = setBad('f-e-desc', !description);
  if (amountBad || descBad) return;

  e.submitter.disabled = true;
  try {
    data = await api('POST', '/api/expenses', { category, amount, description });
    $('e-amt').value = '';
    $('e-desc').value = '';

    // Tell the user how this expense sits against that category's limit.
    const l = limitFor(category);
    if (l && l.limit && l.spent > l.limit) say('e-notice', `Added. You are ${naira(l.spent - l.limit)} over your ${category} limit.`, 'bad');
    else if (l && l.limit && l.spent / l.limit >= 0.8) say('e-notice', `Added. ${naira(l.limit - l.spent)} left in ${category}.`, 'warn');
    else say('e-notice', 'Expense added.', 'ok');
    if (data.budget.remaining < 0) say('e-notice', 'Added. You have now spent more than your whole allowance.', 'bad');
    render();
  } catch (err) {
    say('e-notice', err.message, 'bad');
  }
  e.submitter.disabled = false;
});

$('limit-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const category = $('l-cat').value;
  const raw = $('l-amt').value;
  if (setBad('f-l-amt', raw === '' || Number(raw) < 0)) return;

  e.submitter.disabled = true;
  try {
    data = await api('PUT', '/api/limits', { category, max_amount: Number(raw) });
    $('l-amt').value = '';
    say('l-notice', `Limit saved for ${category}.`, 'ok');
    render();
  } catch (err) {
    say('l-notice', err.message, 'bad');
  }
  e.submitter.disabled = false;
});

load();
