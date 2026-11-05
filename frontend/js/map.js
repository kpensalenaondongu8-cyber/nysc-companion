/* Shared map code for the Home page and the PPA route page.
   Load order in the HTML: leaflet.js, leaflet-routing-machine.js (optional), api.js, map.js

   How it works:
   1. geocode  - turn "PPA name, town, LGA, State" into latitude/longitude (OpenStreetMap Nominatim)
   2. position - ask the browser for the user's GPS position
   3. draw     - Leaflet map + OpenStreetMap tiles + two pins + the road route (OSRM)
*/

const NYSC_MAP = (function () {
  const states = {};   // one entry per map container: { map, group, routing }

  // ---------- distance in a straight line (km) ----------
  function haversineKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const rad = (d) => (d * Math.PI) / 180;
    const dLat = rad(lat2 - lat1);
    const dLon = rad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  // ---------- 1. geocoding ----------
  // Asks Nominatim about ONE piece of text. Results are remembered in the browser
  // so the same PPA is only looked up once (Nominatim is free but limited).
  async function geocodeOne(query) {
    const key = 'nysc_geo:' + query.toLowerCase();
    try {
      const saved = localStorage.getItem(key);
      if (saved) return JSON.parse(saved);
    } catch (e) { /* storage blocked: just skip the cache */ }

    const url = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=ng&q=' +
                encodeURIComponent(query);
    const response = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error('The map search service said ' + response.status + '.');
    const data = await response.json();       // an ARRAY: the first hit is data[0]
    if (!data.length) return null;

    const hit = { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
    try { localStorage.setItem(key, JSON.stringify(hit)); } catch (e) { /* ignore */ }
    return hit;
  }

  // Tries the most exact search first, then gets less exact until something is found.
  // "precision" tells the page how much to trust the pin.
  async function findPpa(ppa) {
    const join = (...parts) => parts.map((p) => (p || '').trim()).filter(Boolean).join(', ') + ', Nigeria';
    const attempts = [
      { precision: 'exact', text: join(ppa.ppa_name, ppa.address, ppa.town, ppa.lga, ppa.state) },
      { precision: 'exact', text: join(ppa.ppa_name, ppa.lga, ppa.state) },
      ppa.address ? { precision: 'street', text: join(ppa.address, ppa.town, ppa.lga, ppa.state) } : null,
      ppa.town ? { precision: 'town', text: join(ppa.town, ppa.lga, ppa.state) } : null,
      { precision: 'lga', text: join(ppa.lga, ppa.state) },
    ].filter(Boolean);

    const tried = new Set();
    let first = true;
    for (const attempt of attempts) {
      if (tried.has(attempt.text)) continue;
      tried.add(attempt.text);
      if (!first) await sleep(1100);          // Nominatim allows about 1 request per second
      first = false;
      const hit = await geocodeOne(attempt.text);
      if (hit) return { lat: hit.lat, lon: hit.lon, precision: attempt.precision };
    }
    return null;
  }

  // ---------- 2. the user's GPS position ----------
  function getUserPosition() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error('This browser cannot share your location.'));
      if (!window.isSecureContext) {
        return reject(new Error('Location only works on https:// or http://127.0.0.1 pages.'));
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
        (err) => reject(new Error(err.code === 1
          ? 'Location is blocked. Click the padlock next to the web address and allow Location.'
          : 'Could not get your location. Check that GPS or Wi-Fi is on, then refresh.')),
        { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 }
      );
    });
  }

  // ---------- 3. drawing ----------
  // user can be null: then only the PPA pin is shown.
  function draw(canvasId, ppa, label, user, onRoadDistance) {
    let st = states[canvasId];
    if (!st) {
      const map = L.map(canvasId).setView([ppa.lat, ppa.lon], 13);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map);
      st = states[canvasId] = { map, group: L.layerGroup().addTo(map), routing: null };
    }
    const { map, group } = st;
    map.invalidateSize();                       // fixes a grey/half map if the box was hidden
    group.clearLayers();
    if (st.routing) { map.removeControl(st.routing); st.routing = null; }

    const ppaPin = L.marker([ppa.lat, ppa.lon]).addTo(group)
      .bindPopup('<b>🏫 ' + esc(label) + '</b>');

    if (!user) {
      map.setView([ppa.lat, ppa.lon], ppa.precision === 'exact' ? 16 : 13);
      ppaPin.openPopup();
      return;
    }

    L.marker([user.lat, user.lon]).addTo(group).bindPopup('<b>👤 You are here</b>');
    map.fitBounds(L.latLngBounds([[user.lat, user.lon], [ppa.lat, ppa.lon]]).pad(0.25));

    const straightLine = () => L.polyline([[user.lat, user.lon], [ppa.lat, ppa.lon]],
      { color: '#01652d', weight: 4, opacity: 0.8, dashArray: '8, 10' }).addTo(group);

    if (!L.Routing) { straightLine(); return; }  // routing plugin not loaded

    st.routing = L.Routing.control({
      waypoints: [L.latLng(user.lat, user.lon), L.latLng(ppa.lat, ppa.lon)],
      router: L.Routing.osrmv1({ serviceUrl: 'https://router.project-osrm.org/route/v1' }),
      createMarker: () => null,                 // we already drew our own pins
      addWaypoints: false, draggableWaypoints: false, routeWhileDragging: false,
      show: false, fitSelectedRoutes: false,
      lineOptions: { styles: [{ color: '#01652d', opacity: 0.85, weight: 5 }] },
    })
      .on('routesfound', (e) => {
        if (onRoadDistance) onRoadDistance(e.routes[0].summary.totalDistance / 1000);
      })
      .on('routingerror', straightLine)         // road service busy: still show a line
      .addTo(map);
  }

  // ---------- the whole job, used by the pages ----------
  // opts: { canvasId, badgeId, ppa (the saved record), beforeDraw (optional function) }
  async function showPpa(opts) {
    const { canvasId, badgeId, ppa, beforeDraw } = opts;
    const label = ppa.ppa_name;

    say(badgeId, '🔍 Finding ' + label + ' on the map…', 'warn');
    let spot;
    try {
      spot = await findPpa(ppa);
    } catch (err) {
      say(badgeId, '⚠️ ' + err.message + ' Check your internet and refresh.', 'bad');
      return;
    }
    if (!spot) {
      say(badgeId, '⚠️ We could not find "' + label + '" or its LGA on the map. Check the spelling of the LGA and state.', 'bad');
      return;
    }

    if (beforeDraw) beforeDraw();               // e.g. un-hide the map box BEFORE Leaflet measures it
    draw(canvasId, spot, label, null);          // show the PPA straight away

    const where = { exact: '', street: ' (street position)', town: ' (showing the town centre)', lga: ' (showing the LGA centre, exact spot not found)' }[spot.precision];

    let user;
    try {
      user = await getUserPosition();
    } catch (err) {
      say(badgeId, '📍 Showing ' + label + where + '. ' + err.message, 'warn');
      return;
    }

    const km = haversineKm(user.lat, user.lon, spot.lat, spot.lon);
    const base = '🚶 You are about ' + km.toFixed(1) + ' km (straight line) from ' + label + where + '.';
    say(badgeId, base, 'ok');
    draw(canvasId, spot, label, user, (roadKm) => {
      say(badgeId, base + ' By road: about ' + roadKm.toFixed(1) + ' km.', 'ok');
    });
  }

  return { haversineKm, findPpa, getUserPosition, draw, showPpa };
})();
