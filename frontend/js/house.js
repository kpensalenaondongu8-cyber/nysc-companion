/* One house: picture slider, details, and the agent's Call / WhatsApp buttons. */

const houseId = new URLSearchParams(location.search).get('id');
let photos = [];
let current = 0;

function showPhoto(i) {
  if (!photos.length) return;
  current = (i + photos.length) % photos.length;
  $('stage-img').src = photoUrl(photos[current]);
  $('counter').textContent = `${current + 1} / ${photos.length}`;
  document.querySelectorAll('#thumbs button').forEach((b, n) => b.setAttribute('aria-current', String(n === current)));
}

function buildGallery(title) {
  const g = $('gallery');
  if (!photos.length) {
    g.innerHTML = '<div class="empty-gallery">No pictures for this listing.</div>';
    return;
  }
  const many = photos.length > 1;
  g.innerHTML = `
    <div class="stage" id="stage">
      <img id="stage-img" alt="Picture of ${esc(title)}">
      ${many ? '<button class="nav prev" type="button" aria-label="Previous picture">‹</button><button class="nav next" type="button" aria-label="Next picture">›</button>' : ''}
      <span class="counter" id="counter"></span>
    </div>
    ${many ? `<div class="thumbs" id="thumbs">${photos.map((p, i) =>
      `<button type="button" data-i="${i}" aria-label="Show picture ${i + 1}"><img src="${photoUrl(p)}" alt=""></button>`).join('')}</div>` : ''}`;

  if (many) {
    g.querySelector('.prev').addEventListener('click', () => showPhoto(current - 1));
    g.querySelector('.next').addEventListener('click', () => showPhoto(current + 1));
    g.querySelector('#thumbs').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-i]');
      if (b) showPhoto(Number(b.dataset.i));
    });
    // swipe on phones
    let startX = null;
    const stage = $('stage');
    stage.addEventListener('touchstart', (e) => { startX = e.touches[0].clientX; }, { passive: true });
    stage.addEventListener('touchend', (e) => {
      if (startX === null) return;
      const dx = e.changedTouches[0].clientX - startX;
      if (Math.abs(dx) > 40) showPhoto(current + (dx < 0 ? 1 : -1));
      startX = null;
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') showPhoto(current - 1);
      if (e.key === 'ArrowRight') showPhoto(current + 1);
    });
  }
  showPhoto(0);
}

function agentPanel(h, me) {
  const a = h.agent;
  if (h.is_sample || !a) {
    return `<header><h2>Contact</h2></header><div class="body"><p class="muted">This is a sample listing for demonstration, so it has no real contact. Real houses come from registered agents.</p></div>`;
  }
  const reviewsLink = `<a class="link" href="/reviews?agent=${a.id}">Read reviews from former corpers</a>`;
  if (me.user.role === 'agent') {
    return `<header><h2>Your listing</h2></header><div class="body">
      <p class="muted">This is how corps members see your house. They can call or WhatsApp you from here.</p>
      <p style="margin-top:12px"><a class="btn ghost sm" href="/agent-hub">← Back to my listings</a></p></div>`;
  }
  const who = me.user.first_name;
  const where = me.ppa ? `${me.ppa.lga}, ${me.ppa.state}` : h.state;
  const message = `Hello ${a.name}, my name is ${who}, a corps member serving in ${where}. ` +
    `I saw "${h.title}" (${naira(h.rent_per_year)} per year) on NYSC Companion. Is it still available?`;
  return `<header><h2>Contact the agent</h2></header><div class="body">
    <h3>${esc(a.name)}</h3>
    ${a.agency ? `<div class="muted">${esc(a.agency)}</div>` : ''}
    <div style="margin-top:6px">${ratingLine(a.rating, a.review_count)}</div>
    <div class="phone num">${esc(a.phone)}</div>
    <div class="stack-actions">
      <a class="btn gold" href="${waLink(a.phone, message)}" target="_blank" rel="noopener">💬 Message on WhatsApp</a>
      <a class="btn" href="tel:${esc(a.phone)}">📞 Call the agent</a>
    </div>
    <p class="hint-small" style="margin-top:12px">Never pay before you have seen the house and the agent in person. ${reviewsLink}</p>
  </div>`;
}

(async function start() {
  if (!houseId) { $('error').textContent = 'No house was chosen.'; $('error').hidden = false; return; }
  try {
    const [h, me] = await Promise.all([api('GET', '/api/houses/' + encodeURIComponent(houseId)), api('GET', '/api/home')]);
    if (me.user.role === 'agent') $('back').href = '/agent-hub', $('back').textContent = '← Back to my listings';

    document.title = h.title + ' · NYSC Companion';
    $('h-title').textContent = h.title;
    $('h-meta').textContent = `${h.house_type} · ${h.rooms} ${h.rooms === 1 ? 'room' : 'rooms'} · ${[h.town, h.lga, h.state].join(', ')}`;
    $('h-price').innerHTML = `${naira(h.rent_per_year)} <small style="font-size:14px;font-weight:400;color:var(--muted)">/ year</small>`;

    photos = h.photos || [];
    buildGallery(h.title);

    $('h-about').innerHTML = `
      ${h.description ? `<p style="white-space:pre-wrap;overflow-wrap:anywhere">${esc(h.description)}</p>` : '<p class="muted">The agent did not add a description.</p>'}
      <p style="margin-top:12px"><b>Location:</b> ${esc([h.address, h.town, h.lga, h.state].filter(Boolean).join(', '))}</p>
      <p class="muted" style="margin-top:4px">Posted ${when(h.created_at)}</p>`;
    $('agent-panel').innerHTML = agentPanel(h, me);
    $('content').hidden = false;
  } catch (err) {
    $('error').textContent = err.message;
    $('error').hidden = false;
  }
})();
