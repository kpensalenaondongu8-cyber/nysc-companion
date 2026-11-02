let ppa = null;
let mine = null;

fillSelect('s-state', NG_STATES);
fillSelect('a-state', NG_STATES, 'Choose state');

const same = (a, b) => a && b && a.trim().toLowerCase() === b.trim().toLowerCase();

function card(a) {
  const near = ppa && same(a.state, ppa.state) && same(a.lga, ppa.lga);
  const tags = [
    a.is_sample ? '<span class="pill sample">Sample listing</span>' : '',
    near ? '<span class="pill here">Covers your LGA</span>' : '',
    a.mine ? '<span class="pill ok">You</span>' : '',
  ].join('');
  const contact = a.is_sample
    ? '<span class="who-line">Sample listing for demonstration, not a real contact.</span>'
    : `<span class="who-line">${esc(a.phone)}</span>
       <a class="btn sm" href="tel:${esc(a.phone)}">Call</a>
       <a class="btn sm gold" href="${whatsapp(a.phone)}" target="_blank" rel="noopener">WhatsApp</a>`;
  return `<article class="card ${near ? 'here' : ''}">
    <div class="head"><h3>${esc(a.name)}</h3></div>
    <div class="meta">${a.agency ? esc(a.agency) + ' · ' : ''}${esc(a.lga)}, ${esc(a.state)}</div>
    ${a.towns ? `<p class="desc"><b>Covers:</b> ${esc(a.towns)}</p>` : ''}
    ${a.about ? `<p class="desc">${esc(a.about)}</p>` : ''}
    ${tags ? `<div class="tags">${tags}</div>` : ''}
    <div class="actions">${contact}</div>
  </article>`;
}

async function search() {
  const q = new URLSearchParams({ state: $('s-state').value });
  if ($('s-lga').value.trim()) q.set('lga', $('s-lga').value.trim());
  if ($('s-town').value.trim()) q.set('town', $('s-town').value.trim());
  try {
    const { agents } = await api('GET', '/api/agents?' + q);
    $('count').textContent = agents.length === 1 ? '1 agent' : agents.length + ' agents';
    $('results').innerHTML = agents.length ? agents.map(card).join('')
      : '<div class="card empty">No agents found here yet. Try clearing the town or LGA to widen the search.</div>';
  } catch (err) {
    $('results').innerHTML = `<div class="card empty">${esc(err.message)}</div>`;
  }
}

$('search-form').addEventListener('submit', (e) => { e.preventDefault(); search(); });

function fillAgentForm() {
  if (mine) {
    $('a-name').value = mine.name; $('a-agency').value = mine.agency; $('a-phone').value = mine.phone;
    $('a-state').value = mine.state; $('a-lga').value = mine.lga; $('a-towns').value = mine.towns; $('a-about').value = mine.about;
    $('a-save').textContent = 'Update my listing';
    $('a-remove').hidden = false;
  }
}

$('agent-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = {
    name: $('a-name').value.trim(), agency: $('a-agency').value.trim(), phone: $('a-phone').value,
    state: $('a-state').value, lga: $('a-lga').value.trim(), towns: $('a-towns').value.trim(), about: $('a-about').value.trim(),
  };
  const bad = [setBad('f-aname', !body.name), setBad('f-aphone', !phoneOk(body.phone)),
               setBad('f-astate', !body.state), setBad('f-alga', !body.lga)];
  if (bad.some(Boolean)) return;

  e.submitter.disabled = true;
  try {
    await api('PUT', '/api/agents/me', body);
    say('a-notice', 'Your agent listing is saved.', 'ok');
    $('s-state').value = body.state; $('s-lga').value = body.lga; $('s-town').value = '';
    mine = body;
    fillAgentForm();
    search();
  } catch (err) {
    say('a-notice', err.message, 'bad');
  }
  e.submitter.disabled = false;
});

$('a-remove').addEventListener('click', async () => {
  if (!confirm('Remove your agent listing?')) return;
  try {
    await api('DELETE', '/api/agents/me');
    mine = null;
    $('agent-form').reset(); $('a-save').textContent = 'List me'; $('a-remove').hidden = true;
    say('a-notice', 'Your listing was removed.', 'ok');
    search();
  } catch (err) { say('a-notice', err.message, 'bad'); }
});

(async function start() {
  try {
    const home = await api('GET', '/api/home');
    ppa = home.ppa;
    if (ppa) {
      $('s-state').value = ppa.state; $('s-lga').value = ppa.lga;
      $('a-state').value = ppa.state; $('a-lga').value = ppa.lga; $('a-towns').value = ppa.town;
    } else {
      $('no-ppa').hidden = false;
      $('s-state').value = 'FCT';
    }
    $('a-name').value = home.user.first_name + ' ' + home.user.last_name;
    mine = (await api('GET', '/api/agents/me')).agent;
    fillAgentForm();
  } catch (err) { /* the search below shows any problem */ }
  search();
})();
