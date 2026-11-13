/* PPA reviews: a list of what corps members say about a place, and a form for your own PPA.
   Needs api.js and ui.js loaded first. */
const PPA_REVIEWS = (function () {
  const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);

  function badge(avg, count) {
    if (!count) return '';
    return `<span class="rv-badge">★ ${Number(avg).toFixed(1)} <span>(${plural(count, 'review', 'reviews')})</span></span>`;
  }

  // Reviews of one place, read-only (with a "report" button on other people's reviews).
  async function showList(boxId, place) {
    const box = $(boxId);
    if (!box) return;
    box.hidden = false;
    box.innerHTML = '<p class="rv-empty">Loading reviews…</p>';
    try {
      const r = await api('GET', '/api/ppa-reviews?name=' + encodeURIComponent(place.name) + '&lat=' + place.lat + '&lon=' + place.lon);
      const s = r.summary;
      let html = '<h3 class="rv-title">What corps members say</h3>';
      if (!s.count) {
        html += '<p class="rv-empty">Nobody has reviewed this PPA yet. If you serve here, you can add the first review from this page.</p>';
      } else {
        html += `<p class="rv-sum">${stars(s.avg)} <b>${Number(s.avg).toFixed(1)}</b> <span class="rv-muted">from ${plural(s.count, 'review', 'reviews')}</span></p>`;
        if (s.tags.length) html += '<p class="rv-tags">' + s.tags.map((t) => `<span class="rv-tag">${esc(t.label)} · ${t.count}</span>`).join('') + '</p>';
        html += '<ul class="rv-list">' + r.reviews.map((v) => `
          <li>
            <div class="rv-head">${stars(v.rating)} <span class="rv-muted">A corps member · ${esc(when(v.when))}${v.mine ? ' · <b>yours</b>' : ''}</span></div>
            ${v.tags.length ? '<p class="rv-tags">' + v.tags.map((t) => `<span class="rv-tag">${esc(t.label)}</span>`).join('') + '</p>' : ''}
            ${v.comment ? `<p class="rv-text">${esc(v.comment)}</p>` : ''}
            ${v.mine ? '' : (v.reported ? '<span class="rv-muted">Reported. Thanks.</span>' : `<button class="rv-link" type="button" data-report="${v.id}">Report this review</button>`)}
          </li>`).join('') + '</ul>';
      }
      box.innerHTML = html;
      box.querySelectorAll('[data-report]').forEach((b) => b.addEventListener('click', async () => {
        if (!confirm('Report this review as unfair, fake or rude?')) return;
        b.disabled = true;
        try { await api('POST', '/api/ppa-reviews/' + b.dataset.report + '/report'); b.replaceWith(Object.assign(document.createElement('span'), { className: 'rv-muted', textContent: 'Reported. Thanks.' })); }
        catch (e) { b.disabled = false; alert(e.message); }
      }));
    } catch (e) {
      box.innerHTML = '<p class="rv-empty">' + esc(e.message) + '</p>';
    }
  }

  // The star ratings for a list of places, at once. Returns an array in the same order.
  async function lookup(places) {
    try {
      const r = await api('POST', '/api/ppa-reviews/lookup', { places: places.map((p) => ({ name: p.name, lat: p.lat, lon: p.lon })) });
      return r.results;
    } catch (e) { return places.map(() => ({ count: 0, avg: 0 })); }
  }

  // The form for my own PPA.
  async function mountMine(boxId, onChange) {
    const box = $(boxId);
    if (!box) return;
    let st, tags;
    try {
      [st, tags] = await Promise.all([api('GET', '/api/ppa-reviews/mine'), api('GET', '/api/ppa-reviews/tags')]);
    } catch (e) { box.innerHTML = '<p class="rv-empty">' + esc(e.message) + '</p>'; return; }

    if (!st.has_ppa) { box.innerHTML = '<p class="rv-empty">Save your PPA first, then you can review it.</p>'; return; }
    if (!st.can_review) { box.innerHTML = '<p class="rv-empty">Pin your PPA on the map above and save it, then you can review it.</p>'; return; }

    const mine = st.review;
    let rating = mine ? mine.rating : 0;
    const picked = new Set(mine ? mine.tags : []);
    box.innerHTML = `
      <h3 class="rv-title">${mine ? 'Your review of ' : 'Review '}${esc(st.ppa.name)}</h3>
      ${st.stale ? `<p class="rv-warn">This review was for <b>${esc(mine.place)}</b>. You have since changed your PPA. Saving moves it to ${esc(st.ppa.name)}.</p>` : ''}
      ${mine && mine.hidden ? '<p class="rv-warn">Other corps members reported this review, so it is hidden until the admin checks it.</p>' : ''}
      <p class="rv-muted" style="margin:0 0 8px;">Only corps members who serve here can review a PPA. Your name is never shown.</p>
      <div class="rv-stars" role="radiogroup" aria-label="Your rating">${[1, 2, 3, 4, 5].map((n) =>
        `<button type="button" class="rv-star" role="radio" data-n="${n}" aria-label="${n} ${n === 1 ? 'star' : 'stars'}">★</button>`).join('')}</div>
      <p class="rv-muted" id="rv-word" style="margin:4px 0 12px;"></p>
      <div class="rv-pick">${tags.tags.map((t) => `<label class="rv-chip"><input type="checkbox" value="${t.id}"><span>${esc(t.label)}</span></label>`).join('')}</div>
      <div class="field" style="margin-top:12px;"><label for="rv-comment">Anything others should know? <span class="opt">(optional)</span></label>
        <textarea class="input" id="rv-comment" rows="3" maxlength="500" placeholder="For example: the principal is kind, but the road is bad in the rainy season."></textarea></div>
      <div class="notice" id="rv-notice" role="status"></div>
      <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:10px;">
        <button class="btn" type="button" id="rv-save">${mine ? 'Save changes' : 'Post my review'}</button>
        ${mine ? '<button class="btn ghost" type="button" id="rv-del">Delete my review</button>' : ''}
      </div>`;

    const words = ['', 'Poor', 'Fair', 'Good', 'Very good', 'Excellent'];
    const paint = () => {
      box.querySelectorAll('.rv-star').forEach((b) => { const on = +b.dataset.n <= rating; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(+b.dataset.n === rating)); });
      $('rv-word').textContent = rating ? words[rating] : 'Tap a star';
    };
    box.querySelectorAll('.rv-star').forEach((b) => b.addEventListener('click', () => { rating = +b.dataset.n; paint(); }));
    box.querySelectorAll('.rv-chip input').forEach((c) => { c.checked = picked.has(c.value); });
    if (mine) $('rv-comment').value = mine.comment;
    paint();

    $('rv-save').addEventListener('click', async () => {
      if (!rating) { say('rv-notice', 'Tap the stars to rate your PPA first.', 'warn'); return; }
      $('rv-save').disabled = true;
      try {
        await api('PUT', '/api/ppa-reviews/mine', {
          rating, comment: $('rv-comment').value.trim(),
          tags: [...box.querySelectorAll('.rv-chip input:checked')].map((c) => c.value),
        });
        if (onChange) await onChange();
        await mountMine(boxId, onChange);
        say('rv-notice', 'Saved. Thank you.', 'ok');
      } catch (e) { say('rv-notice', e.message, 'bad'); $('rv-save').disabled = false; }
    });
    if ($('rv-del')) $('rv-del').addEventListener('click', async () => {
      if (!confirm('Delete your review?')) return;
      try { await api('DELETE', '/api/ppa-reviews/mine'); if (onChange) await onChange(); await mountMine(boxId, onChange); }
      catch (e) { say('rv-notice', e.message, 'bad'); }
    });
    return st;
  }

  return { badge, showList, lookup, mountMine };
})();
