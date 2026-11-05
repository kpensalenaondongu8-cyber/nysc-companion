/* The house agent's own page: /agent-hub
   1. Fill in the agent profile.   2. Post houses with pictures.   3. See and delete your listings. */

const MAX_PHOTOS = 6;
let mine = null;          // the agent profile
let picked = [];          // pictures chosen for the house being posted: [{ dataUrl }]

const profileDone = () => !!(mine && mine.state && mine.lga);

function renderProfileState() {
  $('profile-warn').hidden = profileDone();
  $('post-panel').hidden = !profileDone();
  $('mine-panel').hidden = !profileDone();
  if (profileDone()) {
    $('a-save').textContent = 'Update profile';
    if (!$('h-state').value) {
      $('h-state').value = mine.state;
      $('h-lga').value = mine.lga;
      $('h-town').value = (mine.towns || '').split(',')[0].trim();
    }
  }
}

function fillProfile() {
  if (!mine) return;
  $('a-name').value = mine.name || '';
  $('a-agency').value = mine.agency || '';
  $('a-phone').value = mine.phone || '';
  $('a-state').value = mine.state || '';
  $('a-lga').value = mine.lga || '';
  $('a-towns').value = mine.towns || '';
  $('a-about').value = mine.about || '';
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
    mine = { ...mine, ...body, phone: body.phone.replace(/[\s-]/g, '') };
    say('a-notice', 'Profile saved.', 'ok');
    renderProfileState();
    loadMine();
  } catch (err) {
    say('a-notice', err.message, 'bad');
  }
  e.submitter.disabled = false;
});

// ---------- choosing pictures ----------

function renderPicked() {
  $('photo-grid').innerHTML = picked.map((p, i) =>
    `<div class="ph"><img src="${p.dataUrl}" alt="Picture ${i + 1}">
       <button type="button" data-remove="${i}" aria-label="Remove picture ${i + 1}">×</button>
       ${i === 0 ? '<span class="first">Cover</span>' : ''}</div>`).join('');
}

$('h-photos').addEventListener('change', async (e) => {
  const files = [...e.target.files];
  e.target.value = '';                                   // so the same file can be chosen again
  say('post-notice', '', '');
  for (const file of files) {
    if (picked.length >= MAX_PHOTOS) { say('post-notice', `You can add up to ${MAX_PHOTOS} pictures.`, 'warn'); break; }
    try {
      picked.push({ dataUrl: await shrinkPhoto(file) });
    } catch (err) {
      say('post-notice', err.message, 'bad');
    }
  }
  $('f-photos').classList.remove('bad');
  renderPicked();
});

$('photo-grid').addEventListener('click', (e) => {
  const b = e.target.closest('[data-remove]');
  if (!b) return;
  picked.splice(Number(b.dataset.remove), 1);
  renderPicked();
});

// ---------- posting a house ----------

$('post-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = {
    title: $('h-title').value.trim(), house_type: $('h-type').value, rooms: Number($('h-rooms').value),
    rent_per_year: Number($('h-rent').value), state: $('h-state').value, lga: $('h-lga').value.trim(),
    town: $('h-town').value.trim(), address: $('h-addr').value.trim(), description: $('h-desc').value.trim(),
    photos: picked.map((p) => p.dataUrl),
  };
  const bad = [
    setBad('f-title', !body.title), setBad('f-rooms', !(body.rooms >= 1 && body.rooms <= 20)),
    setBad('f-rentp', !(body.rent_per_year > 0)), setBad('f-hstate', !body.state),
    setBad('f-hlga', !body.lga), setBad('f-htown', !body.town), setBad('f-photos', !body.photos.length),
  ];
  if (bad.some(Boolean)) return;

  $('post-btn').disabled = true;
  say('post-notice', 'Uploading…', 'warn');
  try {
    await api('POST', '/api/houses', body);
    say('post-notice', '✅ House posted. Corps members in that LGA can now see it.', 'ok');
    for (const id of ['h-title', 'h-rent', 'h-addr', 'h-desc']) $(id).value = '';
    picked = [];
    renderPicked();
    loadMine();
  } catch (err) {
    say('post-notice', err.message, 'bad');
  }
  $('post-btn').disabled = false;
});

// ---------- my listings ----------

function mineCard(h) {
  const photo = h.cover ? `<img src="${photoUrl(h.cover)}" alt="">` : '';
  return `<article class="card">
    <div class="mini-house">
      <div class="thumb">${photo}</div>
      <div style="min-width:0">
        <div class="head"><h3>${esc(h.title)}</h3><div class="price num">${naira(h.rent_per_year)} <small>/ year</small></div></div>
        <div class="meta">${esc(h.house_type)} · ${h.rooms} ${h.rooms === 1 ? 'room' : 'rooms'} · ${esc([h.town, h.lga, h.state].join(', '))} · ${h.photo_count} ${h.photo_count === 1 ? 'picture' : 'pictures'}</div>
      </div>
    </div>
    <div class="actions"><a class="btn ghost sm" href="/house?id=${h.id}">Preview</a><button class="btn danger sm" type="button" data-del="${h.id}">Delete</button></div>
  </article>`;
}

async function loadMine() {
  try {
    const { houses } = await api('GET', '/api/my/houses');
    $('mine-count').textContent = houses.length === 1 ? '1 house' : houses.length + ' houses';
    $('mine-list').innerHTML = houses.length ? houses.map(mineCard).join('')
      : '<div class="empty">You have not posted any house yet. Use the form above.</div>';
  } catch (err) {
    $('mine-list').innerHTML = `<div class="empty">${esc(err.message)}</div>`;
  }
}

$('mine-list').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-del]');
  if (!b || !confirm('Delete this house and its pictures?')) return;
  try { await api('DELETE', '/api/houses/' + b.dataset.del); loadMine(); }
  catch (err) { alert(err.message); }
});

(async function start() {
  try {
    const home = await api('GET', '/api/home');
    $('hello').textContent = 'Hello, ' + home.user.first_name;
    mine = (await api('GET', '/api/agents/me')).agent;
    fillProfile();
    renderProfileState();
    if (mine) {
      // Show the agent how corps members rate them.
      const r = await api('GET', '/api/reviews?target_type=agent');
      const mineReviews = r.reviews.filter((x) => x.agent_id === mine.id);
      if (mineReviews.length) {
        const avg = mineReviews.reduce((s, x) => s + x.rating, 0) / mineReviews.length;
        $('rating').innerHTML = `${ratingLine(avg, mineReviews.length)} · <a class="link" href="/reviews?agent=${mine.id}">Read</a>`;
      }
    }
    if (profileDone()) loadMine();
  } catch (err) {
    $('load-error').textContent = err.message;
    $('load-error').hidden = false;
  }
})();
