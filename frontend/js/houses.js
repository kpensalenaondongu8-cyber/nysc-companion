let ppa = null;

fillSelect('s-state', NG_STATES);
fillSelect('h-state', NG_STATES, 'Choose state');
fillSelect('h-type', HOUSE_TYPES);

const same = (a, b) => a && b && a.trim().toLowerCase() === b.trim().toLowerCase();

function card(h) {
  const inTown = ppa && same(h.town, ppa.town) && same(h.state, ppa.state);
  const inLga = ppa && same(h.lga, ppa.lga) && same(h.state, ppa.state);
  const tags = [
    h.is_sample ? '<span class="pill sample">Sample listing</span>' : '',
    inTown ? '<span class="pill here">In your town</span>' : inLga ? '<span class="pill here">In your LGA</span>' : '',
    h.mine ? '<span class="pill ok">Posted by you</span>' : '',
  ].join('');
  const contact = h.is_sample
    ? '<span class="who-line">Sample listing for demonstration, not a real contact.</span>'
    : `<span class="who-line">${esc(h.contact_name)} · ${esc(h.contact_phone)}</span>
       <a class="btn sm" href="tel:${esc(h.contact_phone)}">Call</a>
       <a class="btn sm gold" href="${whatsapp(h.contact_phone)}" target="_blank" rel="noopener">WhatsApp</a>`;
  return `<article class="card ${inTown || inLga ? 'here' : ''}">
    <div class="head"><h3>${esc(h.title)}</h3><div class="price num">${naira(h.rent_per_year)} <small>/ year</small></div></div>
    <div class="meta">${esc(h.house_type)} · ${h.rooms} ${h.rooms === 1 ? 'room' : 'rooms'} · ${esc([h.town, h.lga, h.state].join(', '))}${h.address ? ' · ' + esc(h.address) : ''}</div>
    ${h.description ? `<p class="desc">${esc(h.description)}</p>` : ''}
    ${tags ? `<div class="tags">${tags}</div>` : ''}
    <div class="actions">${contact}${h.mine ? `<button class="btn danger sm" type="button" data-del="${h.id}">Delete</button>` : ''}</div>
  </article>`;
}

async function search() {
  const q = new URLSearchParams({ state: $('s-state').value });
  if ($('s-lga').value.trim()) q.set('lga', $('s-lga').value.trim());
  if ($('s-town').value.trim()) q.set('town', $('s-town').value.trim());
  if ($('s-rent').value) q.set('max_rent', $('s-rent').value);
  if ($('s-rooms').value) q.set('min_rooms', $('s-rooms').value);
  try {
    const { houses } = await api('GET', '/api/houses?' + q);
    $('count').textContent = houses.length === 1 ? '1 house' : houses.length + ' houses';
    $('results').innerHTML = houses.length ? houses.map(card).join('')
      : '<div class="card empty">No houses found. Try clearing the town or LGA to widen the search.</div>';
  } catch (err) {
    $('results').innerHTML = `<div class="card empty">${esc(err.message)}</div>`;
  }
}

$('search-form').addEventListener('submit', (e) => { e.preventDefault(); search(); });

$('results').addEventListener('click', async (e) => {
  const button = e.target.closest('[data-del]');
  if (!button || !confirm('Delete this listing?')) return;
  try { await api('DELETE', '/api/houses/' + button.dataset.del); search(); }
  catch (err) { alert(err.message); }
});

$('post-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = {
    title: $('h-title').value.trim(), house_type: $('h-type').value, rooms: Number($('h-rooms').value),
    rent_per_year: Number($('h-rent').value), state: $('h-state').value, lga: $('h-lga').value.trim(),
    town: $('h-town').value.trim(), address: $('h-addr').value.trim(), description: $('h-desc').value.trim(),
    contact_name: $('h-cname').value.trim(), contact_phone: $('h-phone').value,
  };
  const bad = [
    setBad('f-title', !body.title), setBad('f-rooms', !(body.rooms >= 1 && body.rooms <= 20)),
    setBad('f-rentp', !(body.rent_per_year > 0)), setBad('f-hstate', !body.state),
    setBad('f-hlga', !body.lga), setBad('f-htown', !body.town),
    setBad('f-hname', !body.contact_name), setBad('f-hphone', !phoneOk(body.contact_phone)),
  ];
  if (bad.some(Boolean)) return;

  e.submitter.disabled = true;
  try {
    await api('POST', '/api/houses', body);
    say('post-notice', 'House posted.', 'ok');
    for (const id of ['h-title', 'h-rent', 'h-addr', 'h-desc']) $(id).value = '';
    // Show the new listing: search the state/LGA/town it was posted in.
    $('s-state').value = body.state; $('s-lga').value = body.lga; $('s-town').value = '';
    $('s-rent').value = ''; $('s-rooms').value = '';
    search();
  } catch (err) {
    say('post-notice', err.message, 'bad');
  }
  e.submitter.disabled = false;
});

(async function start() {
  try {
    const home = await api('GET', '/api/home');
    ppa = home.ppa;
    if (ppa) {
      $('s-state').value = ppa.state; $('s-lga').value = ppa.lga;
      $('sub').textContent = `Around ${ppa.town || ppa.lga}, ${ppa.state}. Rents are per year.`;
      $('h-state').value = ppa.state; $('h-lga').value = ppa.lga; $('h-town').value = ppa.town;
    } else {
      $('no-ppa').hidden = false;
      $('s-state').value = 'FCT';
    }
    $('h-cname').value = home.user.first_name + ' ' + home.user.last_name;
  } catch (err) { /* the search below shows any problem */ }
  search();
})();
