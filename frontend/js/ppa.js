/* The PPA settings page: /ppa-locator
   1. Fill in the details from your posting letter.
   2. Search for your PPA by name/town, or pin the exact spot on a map (street or satellite view).
   3. Optionally add a photo of the gate or signboard.
   Then save, and the map page shows the route from where you are standing to your PPA. */

// Listeners for parts of the page that may be missing (for example when only some files were updated)
// must never stop the rest of the page, the map and the search, from starting.
const on = (id, ev, fn) => { const el = document.getElementById(id); if (el) el.addEventListener(ev, fn); };
const setText = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };

fillSelect('p-state', NG_STATES, 'Choose state');

let pin = null;            // { lat, lon } or null
let hadPin = false;        // was a pin already saved?
let pinMarker = null;
let newPhoto = null;       // a photo chosen now (data URL)
let savedPhoto = '';       // the photo already saved (file name)
let removePhoto = false;

// ---------- the details: one summary line, with the fields hidden until they are needed ----------
let userTyped = false;     // did the corps member type in the fields themselves?

function missingDetails() { return !$('p-name').value.trim() || !$('p-state').value || !$('p-lga').value.trim(); }

function refreshSummary() {
  const where = [$('p-town').value.trim(), $('p-lga').value.trim() && $('p-lga').value.trim() + ' LGA', $('p-state').value && $('p-state').value + ' State'].filter(Boolean).join(', ');
  setText('sum-name', $('p-name').value.trim() || 'Your PPA');
  setText('sum-where', where || 'Add the state and LGA');
}

function openFields(open) {
  if (!$('fields')) return;
  $('fields').hidden = !open;
  setText('edit-details', open ? 'Done' : 'Edit details');
  if ($('edit-details')) $('edit-details').setAttribute('aria-expanded', String(open));
}

// Show the details once there is something to show. Fields open by themselves only when something is missing.
function showDetails(forceOpen) {
  if ($('details')) $('details').hidden = false;
  refreshSummary();
  openFields(forceOpen || missingDetails());
}

on('edit-details', 'click', () => { if ($('fields').hidden) openFields(true); else if (!missingDetails()) openFields(false); else refreshSummary(); });
on('manual-link', 'click', (e) => { e.preventDefault(); userTyped = true; showDetails(true); $('p-name').focus(); });
['p-name', 'p-addr', 'p-state', 'p-lga', 'p-town'].forEach((id) => $(id).addEventListener('input', () => { userTyped = true; refreshSummary(); }));
$('p-state').addEventListener('change', () => { userTyped = true; refreshSummary(); });

// ---------- the map (Google Maps if the server has a key, otherwise the free map) ----------
let pickMap = null;

function showReadout() {
  $('pin-readout').textContent = pin
    ? `📍 Pinned at ${pin.lat.toFixed(5)}, ${pin.lon.toFixed(5)}. Drag the pin or tap the map to move it.`
    : 'No pin yet.';
  $('pin-clear').hidden = !pin;
}

function setPin(lat, lon, zoom) {
  if (!pickMap) return;                       // the map is still loading
  pin = { lat, lon };
  if (!pinMarker) {
    pinMarker = pickMap.addMarker(lat, lon, {
      draggable: true,
      onDrag: (la, lo) => { pin = { lat: la, lon: lo }; showReadout(); },
    });
  } else {
    pinMarker.setPos(lat, lon);
  }
  if (zoom) pickMap.setView(lat, lon, Math.max(pickMap.getZoom(), zoom));
  showReadout();
}

$('pin-clear').addEventListener('click', () => {
  if (pinMarker) { pinMarker.remove(); pinMarker = null; }
  pin = null;
  say('pin-notice', '', '');
  showReadout();
});

// "Find my PPA": search by the details typed above, then place the pin there.
$('pin-find').addEventListener('click', async () => {
  const record = {
    ppa_name: $('p-name').value.trim(), address: $('p-addr').value.trim(),
    state: $('p-state').value, lga: $('p-lga').value.trim(), town: $('p-town').value.trim(),
  };
  if (!record.state || !record.lga) {
    say('pin-notice', 'Choose the state and type the LGA first, then tap Find my PPA.', 'warn');
    return;
  }
  $('pin-find').disabled = true;
  say('pin-notice', '🔍 Searching…', 'warn');
  try {
    const hit = await NYSC_MAP.findPpa(record);
    if (!hit) {
      say('pin-notice', 'Nothing found. Check the spelling, or zoom the map to your area and tap your PPA.', 'bad');
    } else if (hit.precision === 'exact' || hit.precision === 'street') {
      setPin(hit.lat, hit.lon, 17);
      say('pin-notice', 'Found a match. Zoom in and drag the pin onto your exact building.', 'ok');
    } else {
      setPin(hit.lat, hit.lon, hit.precision === 'town' ? 15 : 13);
      say('pin-notice', `We could only find the ${hit.precision === 'town' ? 'town' : 'LGA'} centre. Zoom in and tap your PPA building. Use the Satellite button on the map if you need it.`, 'warn');
    }
  } catch (err) {
    say('pin-notice', err.message, 'bad');
  }
  $('pin-find').disabled = false;
});

// "I am at my PPA now": use the phone's GPS.
$('pin-here').addEventListener('click', async () => {
  $('pin-here').disabled = true;
  say('pin-notice', '📍 Getting your location…', 'warn');
  try {
    const here = await NYSC_MAP.getUserPosition();
    setPin(here.lat, here.lon, 18);
    say('pin-notice', `Pin placed where you are standing (accurate to about ${Math.round(here.accuracy)} m). Only use this if you are at your PPA.`, 'ok');
  } catch (err) {
    say('pin-notice', err.message, 'bad');
  }
  $('pin-here').disabled = false;
});


// ---------- search for your PPA: "Government Secondary School, Gboko, Benue" ----------
// Splits one line into name / town / state. Commas are best, but plain spaces work too.
function parseSearch(text) {
  let parts = text.split(',').map((s) => s.trim()).filter(Boolean);
  let state = '';
  const asState = (s) => NG_STATES.find((x) => x.toLowerCase() === s.toLowerCase().replace(/ state$/i, ''));
  if (parts.length > 1) {
    for (let i = parts.length - 1; i >= 0; i--) { const s = asState(parts[i]); if (s) { state = s; parts.splice(i, 1); break; } }
    return { name: parts[0] || '', town: parts[1] || '', state };
  }
  // no commas: take a state off the end, then the last word as the town
  let words = text.trim().split(/\s+/);
  for (const n of [2, 1]) {   // "Cross River", "Akwa Ibom" first
    const s = words.length > n ? asState(words.slice(-n).join(' ')) : '';
    if (s) { state = s; words = words.slice(0, -n); break; }
  }
  if (words.length < 2) return { name: '', town: words.join(' '), state };
  const NAME_WORDS = /^(school|schools|college|university|polytechnic|academy|institute|hospital|clinic|centre|center|station|office|secretariat|council|ministry|department|commission|court|bank|barracks|command|division|church|mission|nursery|primary|secondary|health|care|police|sch|ctr|phc|gss|gjss|hospital)$/i;
  if (NAME_WORDS.test(words[words.length - 1])) return { name: words.join(' '), town: '', state };   // no town typed
  return { name: words.slice(0, -1).join(' '), town: words[words.length - 1], state };
}

function runSearch() {
  const text = $('s-name').value.trim();
  const q = parseSearch(text);
  const state = q.state || $('p-state').value;
  if (!q.town) { say('s-notice', 'Add the town after the name, for example: Government Secondary School, Gboko, Benue.', 'warn'); return; }
  $('s-go').disabled = true;
  $('s-results').innerHTML = '';
  say('s-notice', '🔍 Searching…', 'warn');

  // 1. PPAs other corps members already pinned. 2. Our own list of schools, hospitals and offices.
  // 3. Map data (Google if the server has a key, otherwise free map data), only when the first two find nothing.
  const sharedP = api('GET', '/api/ppa-directory/search?name=' + encodeURIComponent(q.name) + '&town=' + encodeURIComponent(q.town) +
                      '&state=' + encodeURIComponent(state || '')).then((r) => r.results || []).catch(() => []);
  const knownP = api('GET', '/api/places/search?name=' + encodeURIComponent(q.name) + '&town=' + encodeURIComponent(q.town) +
                     '&state=' + encodeURIComponent(state || '')).then((r) => r.results || []).catch(() => []);
  const noMap = () => Object.assign([], { centre: null, problem: '', googleProblem: '' });

  Promise.all([sharedP, knownP]).then(async ([shared, known]) => {
    let places = (shared.length + known.length >= 1) ? noMap()
      : await NYSC_MAP.searchPlaces(q.name, q.town, state, '').catch((e) => Object.assign([], { problem: e.message, centre: null }));
    const where = [q.town, state].filter(Boolean).join(', ');
    const haveOurs = shared.length + known.length > 0;
    if ($('manual')) $('manual').hidden = haveOurs;      // the "enter it yourself" link appears only when we found nothing
    if (haveOurs && places.noMatch) places = noMap();   // unrelated nearby places are just noise now
    const hint = places.googleProblem ? ' (' + places.googleProblem + ')'
      : NYSC_MAP.provider() === 'google' ? ' (Google found nothing for this either. Check the spelling of the town.)' : '';
    const addOwn = ' Nobody has added this PPA yet. Open the map at the town, tap your PPA, fill in the details and save: it will then show up for the next corps member.';

    const add = (node) => { const li = document.createElement('li'); li.appendChild(node); $('s-results').appendChild(li); };

    const addTownRow = () => {           // always leave a way to open the map at the town
      const first = shared[0] || known[0];
      if (!places.centre && !first) return;
      const centre = places.centre || { lat: first.lat, lon: first.lon };
      const b = document.createElement('button');
      b.type = 'button';
      b.innerHTML = '<b>📍 Open the map at ' + esc(where) + '</b><span>Not listed? Go to the town and tap your PPA on the map yourself.</span>';
      b.addEventListener('click', () => openTown(centre, q.town, state));
      add(b);
    };

    // shared PPAs first, each with a "wrong location?" button
    shared.forEach((pl) => {
      const wrap = document.createElement('div');
      wrap.className = 'row-wrap';
      const b = document.createElement('button');
      b.type = 'button';
      b.innerHTML = '<b>' + esc(pl.name) + '</b><span>' + esc(pl.address) + '</span><span class="tag-shared">Pinned by ' +
                    pl.confirmations + (pl.confirmations === 1 ? ' corps member' : ' corps members') + '</span>';
      b.addEventListener('click', () => choosePlace(pl, b));
      const rep = document.createElement('button');
      rep.type = 'button'; rep.className = 'small'; rep.textContent = 'Wrong spot?';
      rep.addEventListener('click', async () => {
        try {
          await api('POST', '/api/ppa-directory/' + pl.id + '/report');
          wrap.parentNode.remove();
          say('s-notice', 'Thanks. We noted that this pin looks wrong.', 'ok');
        } catch (err) { say('s-notice', err.message, 'bad'); }
      });
      wrap.appendChild(b); wrap.appendChild(rep);
      add(wrap);
    });

    known.forEach((pl) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.innerHTML = '<b>' + esc(pl.name) + '</b><span>' + esc(pl.address || 'No address listed') + '</span>';
      b.addEventListener('click', () => choosePlace(pl, b));
      add(b);
    });

    if (!haveOurs && !places.length) {
      if (places.problem || places.googleProblem) say('s-notice', '⚠️ ' + [places.googleProblem, places.problem].filter(Boolean).join(' ') + addOwn, 'bad');
      else say('s-notice', `No "${q.name || 'place'}" found in ${where}. Check the spelling of the town.${hint}${addOwn}`, 'bad');
      addTownRow();
      return;
    }

    if (!haveOurs && places.noMatch) {
      say('s-notice', `No place named like "${q.name}" found in ${where}. These are the nearest places on the map.${hint}${addOwn}`, 'warn');
    } else {
      const n = shared.length + known.length + places.length;
      say('s-notice', `${n} found${q.name ? ', best name match first' : ', nearest first'}. Tap yours.` + (haveOurs ? '' : addOwn), 'ok');
    }

    places.forEach((pl) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.innerHTML = '<b>' + esc(pl.name) + '</b><span>' + esc(pl.address || 'No address listed') + '</span>';
      b.addEventListener('click', () => choosePlace(pl, b));
      add(b);
    });
    addTownRow();
  }).catch(() => { if ($('manual')) $('manual').hidden = false; }).finally(() => { $('s-go').disabled = false; });
}

// Jump the map to the town (no pin yet) so the corper can tap the PPA on the map.
function openTown(centre, town, state) {
  pickMap.setView(centre.lat, centre.lon, 15);
  if (state && NG_STATES.includes(state)) $('p-state').value = state;
  if (!$('p-town').value.trim()) $('p-town').value = town;
  showDetails(true);
  pickMap.el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  say('pin-notice', `Showing ${town}. Tap your PPA on the map to drop the pin (use the Satellite switch if it helps), then fill in the PPA name below.`, 'ok');
}

function choosePlace(pl, button) {
  document.querySelectorAll('#s-results button').forEach((x) => x.classList.remove('chosen'));
  button.classList.add('chosen');
  $('p-name').value = pl.name;
  if (pl.address) $('p-addr').value = pl.address.split(',')[0] === pl.town ? '' : pl.address.split(',')[0];
  if (pl.state && NG_STATES.includes(pl.state)) $('p-state').value = pl.state;
  if (pl.lga && !$('p-lga').value.trim()) $('p-lga').value = pl.lga.replace(/ (Local Government( Area)?|LGA)$/i, '');
  if (pl.town && !$('p-town').value.trim()) $('p-town').value = pl.town;
  setPin(pl.lat, pl.lon, 18);
  userTyped = false;
  showDetails(false);
  if (!$('p-state').value || !$('p-lga').value.trim()) {
    NYSC_MAP.whereIs(pl.lat, pl.lon).then((w) => {
      if (!w) return;
      if (!$('p-state').value && NG_STATES.includes(w.state)) $('p-state').value = w.state;
      if (!$('p-lga').value.trim() && w.lga) $('p-lga').value = w.lga.replace(/ (Local Government( Area)?|LGA)$/i, '');
      if (!$('p-town').value.trim() && w.town) $('p-town').value = w.town;
      refreshSummary();
      if (!userTyped && !missingDetails()) openFields(false);   // everything is known now: tidy the fields away
    }).catch(() => { /* the corper can fill these in by hand */ });
  }
  pickMap.el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  say('pin-notice', `Showing ${pl.name}. If the pin is not on your building, drag it, or use the Satellite button on the map.`, 'ok');
}

$('s-go').addEventListener('click', runSearch);
$('s-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); runSearch(); } });

// ---------- the photo ----------
function showPhoto(src) {
  $('photo-box').hidden = !src;
  if (src) $('photo-preview').src = src;
}

$('p-photo').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    newPhoto = await shrinkPhoto(file);
    removePhoto = false;
    showPhoto(newPhoto);
  } catch (err) {
    say('ppa-notice', err.message, 'bad');
  }
  e.target.value = '';
});

$('photo-remove').addEventListener('click', () => {
  newPhoto = null;
  removePhoto = !!savedPhoto;
  showPhoto('');
});

// ---------- load the saved PPA ----------
async function loadSavedPpa() {
  try {
    const home = await api('GET', '/api/home');
    if (home && home.ppa) {
      const p = home.ppa;
      $('p-name').value = p.ppa_name || '';
      $('p-addr').value = p.address || '';
      $('p-state').value = p.state || '';
      $('p-lga').value = p.lga || '';
      $('p-town').value = p.town || '';
      $('view-map').hidden = false;
      showDetails(false);
      if (p.lat != null && p.lon != null) { hadPin = true; setPin(p.lat, p.lon, 17); }
      if (p.photo) { savedPhoto = p.photo; showPhoto('/uploads/ppa/' + encodeURIComponent(p.photo)); }
    }
  } catch (err) {
    $('load-error').textContent = 'Could not load your saved PPA: ' + err.message;
    $('load-error').hidden = false;
  }
}

// Start: make the map, then load the saved PPA onto it.
(async function start() {
  try {
    pickMap = await NYSC_MAP.createMap('pick-map', { lat: 9.08, lon: 8.68, zoom: 6 });   // all of Nigeria
    pickMap.onClick((la, lo) => setPin(la, lo));
  } catch (err) {
    $('load-error').textContent = 'The map could not start: ' + err.message;
    $('load-error').hidden = false;
  }
  loadSavedPpa();
})();

// ---------- save ----------
$('ppa-form').addEventListener('submit', async (e) => {
  e.preventDefault();

  const body = {
    ppa_name: $('p-name').value.trim(),
    address: $('p-addr').value.trim(),
    state: $('p-state').value,
    lga: $('p-lga').value.trim(),
    town: $('p-town').value.trim(),
  };

  if (missingDetails()) {
    showDetails(true);
    if (!$('p-name').value.trim() && !userTyped) { say('ppa-notice', 'Search for your PPA above and tap it, or enter the details yourself.', 'warn'); }
  }
  // setBad marks a field red and returns true when something is wrong.
  const problems = [
    setBad('f-name', !body.ppa_name),
    setBad('f-state', !body.state),
    setBad('f-lga', !body.lga),
  ];
  if (problems.some(Boolean)) return;

  body.share = $('p-share').checked;
  if (pin) { body.lat = pin.lat; body.lon = pin.lon; }
  else if (hadPin) { body.clear_pin = true; }
  if (newPhoto) body.photo = newPhoto;
  else if (removePhoto) body.remove_photo = true;

  $('ppa-save').disabled = true;
  say('ppa-notice', 'Saving…', 'warn');
  try {
    await api('PUT', '/api/ppa', body);
    say('ppa-notice', pin && body.share ? '✅ PPA saved and shared. Opening the map…' : '✅ PPA saved. Opening the map…', 'ok');
    window.location.href = '/ppa-route';
  } catch (err) {
    say('ppa-notice', err.message, 'bad');
    $('ppa-save').disabled = false;
  }
});
