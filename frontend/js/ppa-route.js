/* The map page: /ppa-route
   Shows where you are, where your PPA is, and the road between them.
   All the map work is in map.js. */

(async function () {
  // 1. Which PPA? Prefer the one saved in the database; fall back to the web address.
  let ppa = null;
  try {
    const home = await api('GET', '/api/home');
    ppa = home.ppa;
  } catch (err) {
    say('live-distance-badge', err.message, 'bad');
    return;
  }

  if (!ppa) {
    const q = new URLSearchParams(window.location.search);
    if (q.get('name') && q.get('lga') && q.get('state')) {
      ppa = { ppa_name: q.get('name'), lga: q.get('lga'), state: q.get('state'), address: '', town: '' };
    }
  }

  if (!ppa) {
    say('live-distance-badge', 'You have not saved a PPA yet. Go back to PPA settings and save it first.', 'warn');
    return;
  }

  if (ppa.photo) {
    $('ppa-photo-img').src = '/uploads/ppa/' + encodeURIComponent(ppa.photo);
    $('photo-panel').hidden = false;
  }
  $('route-map-title').textContent = '📍 Route to ' + ppa.ppa_name;

  // 2. Find the PPA, get your position, draw everything.
  await NYSC_MAP.showPpa({
    canvasId: 'map-viewport-canvas',
    badgeId: 'live-distance-badge',
    ppa,
    refreshButtonId: 'refresh-loc',
  });
})();
