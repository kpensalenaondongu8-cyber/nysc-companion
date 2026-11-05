/* Reviews by former corps members, about PPAs and house agents.
   Everyone logged in can read. Corps members can write (agents cannot review). */

const params = new URLSearchParams(location.search);
let typeFilter = params.get('type') || '';
let agentFilter = params.get('agent') ? Number(params.get('agent')) : null;   // /reviews?agent=3
if (agentFilter) typeFilter = 'agent';
let canWrite = false;

// Years you could have served: this year back to 2010.
const thisYear = new Date().getFullYear();
$('r-year').innerHTML = Array.from({ length: thisYear - 2010 + 1 }, (_, i) => thisYear - i)
  .map((y) => `<option>${y}</option>`).join('');

function setTabs() {
  document.querySelectorAll('#tabs button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.type === typeFilter)));
}

function reviewCard(r) {
  const about = r.target_type === 'agent'
    ? `<h3>🏠 Agent: ${esc(r.agent_name || 'Agent')}${r.agent_agency ? ' <span class="muted" style="font-weight:400;font-size:14px">· ' + esc(r.agent_agency) + '</span>' : ''}</h3>`
    : `<h3>🏫 PPA: ${esc(r.ppa_name)}</h3><div class="muted" style="font-size:13.5px">${esc([r.town, r.lga, r.state].filter(Boolean).join(', '))}</div>`;
  return `<article class="review">
    <div class="top"><div>${about}</div>${stars(r.rating)}</div>
    <p class="text">${esc(r.body)}</p>
    <div class="by"><span class="pill here">Former corper · served ${r.service_year}</span>
      <span>${esc(r.author)}</span><span>· ${when(r.created_at)}</span>
      ${r.mine ? `<button class="btn danger sm" type="button" data-del="${r.id}">Delete</button>` : ''}</div>
  </article>`;
}

async function load() {
  const q = new URLSearchParams();
  if (typeFilter) q.set('target_type', typeFilter);
  if (agentFilter) q.set('agent_id', agentFilter);
  if ($('f-state-sel').value) q.set('state', $('f-state-sel').value);
  if ($('f-lga-in').value.trim()) q.set('lga', $('f-lga-in').value.trim());
  if ($('f-q').value.trim()) q.set('q', $('f-q').value.trim());
  try {
    const data = await api('GET', '/api/reviews?' + q);
    canWrite = data.can_write;
    $('write-panel').hidden = !canWrite;
    $('summary').innerHTML = data.count
      ? `<span class="big num">${data.average.toFixed(1)}</span><div>${stars(data.average)}<div class="muted">${data.count} ${data.count === 1 ? 'review' : 'reviews'}</div></div>`
      : '';
    $('results').innerHTML = data.reviews.length ? data.reviews.map(reviewCard).join('')
      : '<div class="card empty">No reviews here yet. If you have served, be the first to write one.</div>';
  } catch (err) {
    $('results').innerHTML = `<div class="card empty">${esc(err.message)}</div>`;
  }
}

$('tabs').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-type]');
  if (!b) return;
  typeFilter = b.dataset.type;
  if (typeFilter !== 'agent') agentFilter = null;
  $('agent-filter').hidden = true;
  setTabs();
  load();
});
$('filter-form').addEventListener('submit', (e) => { e.preventDefault(); load(); });

$('results').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-del]');
  if (!b || !confirm('Delete your review?')) return;
  try { await api('DELETE', '/api/reviews/' + b.dataset.del); load(); }
  catch (err) { alert(err.message); }
});

// ---------- the write form ----------

function selectedType() { return document.querySelector('input[name="rtype"]:checked').value; }

function syncType() {
  const agent = selectedType() === 'agent';
  $('ppa-fields').style.display = agent ? 'none' : 'grid';
  $('agent-fields').style.display = agent ? 'block' : 'none';
}
document.querySelectorAll('input[name="rtype"]').forEach((r) => r.addEventListener('change', syncType));

$('review-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const type = selectedType();
  const body = {
    target_type: type,
    rating: Number($('r-rating').value),
    service_year: Number($('r-year').value),
    body: $('r-body').value.trim(),
    served: $('r-served').checked,
  };
  const bad = [setBad('f-rbody', body.body.length < 20), setBad('f-served', !body.served)];
  if (type === 'ppa') {
    body.ppa_name = $('r-ppa').value.trim();
    body.state = $('r-state').value;
    body.lga = $('r-lga').value.trim();
    body.town = $('r-town').value.trim();
    bad.push(setBad('f-rppa', !body.ppa_name), setBad('f-rstate', !body.state), setBad('f-rlga', !body.lga));
    setBad('f-ragent', false);
  } else {
    body.agent_id = Number($('r-agent').value) || null;
    bad.push(setBad('f-ragent', !body.agent_id));
    setBad('f-rppa', false); setBad('f-rstate', false); setBad('f-rlga', false);
  }
  if (bad.some(Boolean)) return;

  $('r-submit').disabled = true;
  try {
    await api('POST', '/api/reviews', body);
    say('r-notice', '✅ Thank you. Your review is posted.', 'ok');
    $('r-body').value = '';
    $('r-served').checked = false;
    load();
  } catch (err) {
    say('r-notice', err.message, 'bad');
  }
  $('r-submit').disabled = false;
});

(async function start() {
  setTabs();
  // Real agents only (sample agents cannot be reviewed).
  try {
    const { agents } = await api('GET', '/api/agents');
    const real = agents.filter((a) => !a.is_sample);
    $('r-agent').innerHTML = real.length
      ? '<option value="">Choose an agent</option>' + real.map((a) =>
          `<option value="${a.id}">${esc(a.name)}${a.agency ? ' (' + esc(a.agency) + ')' : ''} · ${esc(a.lga)}, ${esc(a.state)}</option>`).join('')
      : '<option value="">No agents have registered yet</option>';
    if (agentFilter) {
      const a = real.find((x) => x.id === agentFilter);
      if (a) {
        $('r-agent').value = String(a.id);
        document.querySelector('input[name="rtype"][value="agent"]').checked = true;
        syncType();
        $('agent-filter').innerHTML = `Showing reviews of <b>${esc(a.name)}</b>. <a class="link" href="/reviews">Show all reviews</a>`;
        $('agent-filter').hidden = false;
      }
    }
  } catch (err) { /* the list below shows any problem */ }
  load();
})();
