/* Houses for rent (corps members).
   The server only sends houses in YOUR state and LGA (from your saved PPA).
   Tap a house to see its pictures and contact the agent. */

let area = null;

const same = (a, b) => a && b && a.trim().toLowerCase() === b.trim().toLowerCase();

function card(h) {
  const inTown = area && same(h.town, area.town);
  const tags = [
    h.is_sample ? '<span class="pill sample">Sample listing</span>' : '',
    inTown ? '<span class="pill here">In your town</span>' : '',
  ].join('');
  const photo = h.cover
    ? `<img src="${photoUrl(h.cover)}" alt="Photo of ${esc(h.title)}" loading="lazy">`
    : '<div class="no-photo">No photo</div>';
  const count = h.photo_count > 1 ? `<span class="photo-count">📷 ${h.photo_count}</span>` : '';
  const agent = h.agent
    ? `<div class="meta" style="margin-top:8px">Agent: <b>${esc(h.agent.name)}</b>${h.agent.agency ? ' · ' + esc(h.agent.agency) : ''} ${ratingLine(h.agent.rating, h.agent.review_count)}</div>`
    : '';
  return `<a class="card house-card ${inTown ? 'here' : ''}" href="/house?id=${h.id}">
    <div class="thumb">${photo}${count}</div>
    <div class="info">
      <div class="head"><h3>${esc(h.title)}</h3><div class="price num">${naira(h.rent_per_year)} <small>/ year</small></div></div>
      <div class="meta">${esc(h.house_type)} · ${h.rooms} ${h.rooms === 1 ? 'room' : 'rooms'} · ${esc([h.town, h.lga, h.state].join(', '))}</div>
      ${agent}
      ${tags ? `<div class="tags">${tags}</div>` : ''}
    </div>
  </a>`;
}

async function search() {
  const q = new URLSearchParams();
  if ($('s-town').value.trim()) q.set('town', $('s-town').value.trim());
  if ($('s-rent').value) q.set('max_rent', $('s-rent').value);
  if ($('s-rooms').value) q.set('min_rooms', $('s-rooms').value);
  try {
    const data = await api('GET', '/api/houses?' + q);
    area = data.area;
    $('no-ppa').hidden = !!area;
    if (!area) {
      $('count').textContent = '';
      $('results').innerHTML = '<div class="card empty">Save your PPA to see houses near it.</div>';
      return;
    }
    $('sub').textContent = `Posted by agents in ${area.lga} LGA, ${area.state}${area.town ? ' (your town: ' + area.town + ' comes first)' : ''}. Rents are per year.`;
    const houses = data.houses;
    $('count').textContent = houses.length === 1 ? '1 house' : houses.length + ' houses';
    $('results').innerHTML = houses.length ? houses.map(card).join('')
      : `<div class="card empty">No houses in ${esc(area.lga)} yet. Agents are adding more, so check back soon.</div>`;
  } catch (err) {
    $('results').innerHTML = `<div class="card empty">${esc(err.message)}</div>`;
  }
}

$('search-form').addEventListener('submit', (e) => { e.preventDefault(); search(); });
search();
