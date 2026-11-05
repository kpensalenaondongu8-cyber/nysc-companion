/* House agents directory (for corps members to browse).
   Agents manage their own profile and houses on the agent page (/agent-hub). */

let ppa = null;
let me = null;

const same = (a, b) => a && b && a.trim().toLowerCase() === b.trim().toLowerCase();

function card(a) {
  const near = ppa && same(a.state, ppa.state) && same(a.lga, ppa.lga);
  const tags = [
    a.is_sample ? '<span class="pill sample">Sample listing</span>' : '',
    near ? '<span class="pill here">Covers your LGA</span>' : '',
  ].join('');
  const message = `Hello ${a.name}, my name is ${me ? me.first_name : 'a corps member'}, a corps member${ppa ? ' serving in ' + ppa.lga + ', ' + ppa.state : ''}. I found you on NYSC Companion and I am looking for a house. Do you have any available?`;
  const contact = a.is_sample
    ? '<span class="who-line">Sample listing for demonstration, not a real contact.</span>'
    : `<span class="who-line">${esc(a.phone)}</span>
       <a class="btn sm" href="tel:${esc(a.phone)}">Call</a>
       <a class="btn sm gold" href="${waLink(a.phone, message)}" target="_blank" rel="noopener">WhatsApp</a>`;
  const reviews = a.is_sample ? '' : `<a class="btn ghost sm" href="/reviews?agent=${a.id}">Reviews</a>`;
  return `<article class="card ${near ? 'here' : ''}">
    <div class="head"><h3>${esc(a.name)}</h3>${a.is_sample ? '' : ratingLine(a.rating, a.review_count)}</div>
    <div class="meta">${a.agency ? esc(a.agency) + ' · ' : ''}${esc(a.lga)}, ${esc(a.state)}${a.is_sample ? '' : ' · ' + a.house_count + (a.house_count === 1 ? ' house posted' : ' houses posted')}</div>
    ${a.towns ? `<p class="desc"><b>Covers:</b> ${esc(a.towns)}</p>` : ''}
    ${a.about ? `<p class="desc">${esc(a.about)}</p>` : ''}
    ${tags ? `<div class="tags">${tags}</div>` : ''}
    <div class="actions">${contact}${reviews}</div>
  </article>`;
}

async function search() {
  const q = new URLSearchParams();
  if ($('s-state').value) q.set('state', $('s-state').value);
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

(async function start() {
  try {
    const home = await api('GET', '/api/home');
    me = home.user;
    ppa = home.ppa;
    if (ppa) {
      $('s-state').value = ppa.state;
      $('s-lga').value = ppa.lga;
    } else {
      $('no-ppa').hidden = false;
    }
  } catch (err) { /* the search below shows any problem */ }
  search();
})();
