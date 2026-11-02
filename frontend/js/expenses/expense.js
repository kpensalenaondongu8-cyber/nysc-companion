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
}

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
