/* Shared map code for the Home page, the PPA route page and the PPA pin picker.

   Two map "engines" with the same small set of functions:
     google  - used when the server has a Google Maps key (see SETUP-GOOGLE.txt). Google place search + Google map.
     leaflet - the free OpenStreetMap map and search, used when there is no key.
   Pages never talk to Google or Leaflet directly. They call NYSC_MAP.createMap(...) and friends.

   Load order in the HTML: leaflet.js, api.js, ui.js, map.js
*/

const NYSC_MAP = (function () {
  const handles = {};     // one map per container id: { map, draws }
  let engine = null;      // Leaf or Goog
  let engineName = '';
  let G = {};             // Google libraries once loaded
  let initPromise = null;

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

  // =====================================================================
  //  ENGINE 1: Leaflet + OpenStreetMap (free, no key)
  // =====================================================================
  const STREET_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
  // NOTE: check the provider's terms (Esri World Imagery) before you launch to the public.
  const SATELLITE_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';

  const Leaf = {
    create(elId, o) {
      const street = L.tileLayer(STREET_URL, { maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' });
      const satellite = L.tileLayer(SATELLITE_URL, { maxZoom: 19, maxNativeZoom: 18,
        attribution: 'Imagery &copy; Esri, Maxar, Earthstar Geographics and the GIS User Community' });
      const map = L.map(elId, { layers: [o.satellite ? satellite : street] }).setView([o.lat, o.lon], o.zoom);
      L.control.layers({ 'Street map': street, 'Satellite': satellite }, null, { position: 'topright' }).addTo(map);
      const group = L.layerGroup().addTo(map);
      return {
        el: map.getContainer(),
        setView: (la, lo, z) => map.setView([la, lo], z),
        getZoom: () => map.getZoom(),
        fit: (pts) => map.fitBounds(L.latLngBounds(pts).pad(0.25)),
        onClick: (fn) => map.on('click', (e) => fn(e.latlng.lat, e.latlng.lng)),
        addMarker(la, lo, opt = {}) {
          const m = L.marker([la, lo], { draggable: !!opt.draggable }).addTo(group);
          if (opt.popup) m.bindPopup(opt.popup);
          if (opt.onDrag) m.on('dragend', () => { const p = m.getLatLng(); opt.onDrag(p.lat, p.lng); });
          return { setPos: (a, b) => m.setLatLng([a, b]), openPopup: () => m.openPopup(), remove: () => group.removeLayer(m) };
        },
        addCircle(la, lo, r) {
          const c = L.circle([la, lo], { radius: r, color: '#1d6fd8', weight: 1, fillOpacity: 0.12 }).addTo(group);
          return { remove: () => group.removeLayer(c) };
        },
        addLine(pts, s) {
          const l = L.polyline(pts, { color: s.color, weight: s.weight, opacity: s.opacity, dashArray: s.dashed ? '8, 10' : null }).addTo(group);
          return { remove: () => group.removeLayer(l) };
        },
        clearOverlays: () => group.clearLayers(),
        resize: () => map.invalidateSize(),
      };
    },
  };

  // =====================================================================
  //  ENGINE 2: Google Maps (needs the key from /api/config)
  // =====================================================================
  function loadGoogleScript(key) {
    return new Promise((resolve, reject) => {
      if (window.google && window.google.maps && window.google.maps.importLibrary) return resolve();
      window.__nyscGoogleReady = () => resolve();
      window.gm_authFailure = () => {          // Google calls this when the key or its restrictions are wrong
        const bar = document.createElement('div');
        bar.className = 'notice show bad';
        bar.setAttribute('role', 'alert');
        bar.textContent = 'Google Maps refused the key. In Google Cloud, check that billing is on, that "Maps JavaScript API" is enabled, and that the key allows this website address (' + location.origin + '/*).';
        document.body.insertBefore(bar, document.body.firstChild);
      };
      const s = document.createElement('script');
      s.src = 'https://maps.googleapis.com/maps/api/js?key=' + encodeURIComponent(key) + '&loading=async&callback=__nyscGoogleReady&v=weekly';
      s.async = true;
      s.onerror = () => reject(new Error('Google Maps could not load. Check your internet.'));
      document.head.appendChild(s);
    });
  }

  const Goog = {
    create(elId, o) {
      const el = document.getElementById(elId);
      const map = new G.maps.Map(el, {
        center: { lat: o.lat, lng: o.lon }, zoom: o.zoom,
        mapTypeId: o.satellite ? 'hybrid' : 'roadmap',            // hybrid = satellite WITH road and place names
        mapTypeControl: true, mapTypeControlOptions: { mapTypeIds: ['roadmap', 'hybrid'] },
        streetViewControl: false, fullscreenControl: true, gestureHandling: 'greedy',
      });
      const stuff = [];      // everything we drew, so clearOverlays can remove it
      const keep = (o2) => { stuff.push(o2); return o2; };
      return {
        el,
        setView: (la, lo, z) => { map.setCenter({ lat: la, lng: lo }); map.setZoom(z); },
        getZoom: () => map.getZoom(),
        fit(pts) {
          const b = new G.core.LatLngBounds();
          pts.forEach((p) => b.extend({ lat: p[0], lng: p[1] }));
          map.fitBounds(b, 60);
        },
        onClick: (fn) => map.addListener('click', (e) => fn(e.latLng.lat(), e.latLng.lng())),
        addMarker(la, lo, opt = {}) {
          const m = new G.marker.Marker({ position: { lat: la, lng: lo }, map, draggable: !!opt.draggable,
            icon: opt.you ? { path: G.core.SymbolPath.CIRCLE, scale: 8, fillColor: '#1d6fd8', fillOpacity: 1, strokeColor: '#ffffff', strokeWeight: 2 } : undefined });
          let iw = null;
          if (opt.popup) {
            iw = new G.maps.InfoWindow({ content: opt.popup });
            m.addListener('click', () => iw.open({ map, anchor: m }));
          }
          if (opt.onDrag) m.addListener('dragend', (e) => opt.onDrag(e.latLng.lat(), e.latLng.lng()));
          keep({ setMap: (x) => m.setMap(x) });
          return { setPos: (a, b) => m.setPosition({ lat: a, lng: b }), openPopup: () => iw && iw.open({ map, anchor: m }), remove: () => m.setMap(null) };
        },
        addCircle(la, lo, r) {
          const c = new G.maps.Circle({ map, center: { lat: la, lng: lo }, radius: r, strokeColor: '#1d6fd8', strokeWeight: 1, fillColor: '#1d6fd8', fillOpacity: 0.12 });
          keep(c); return { remove: () => c.setMap(null) };
        },
        addLine(pts, s) {
          const opts = { map, path: pts.map((p) => ({ lat: p[0], lng: p[1] })), strokeColor: s.color, strokeOpacity: s.opacity, strokeWeight: s.weight };
          if (s.dashed) {
            opts.strokeOpacity = 0;
            opts.icons = [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: s.opacity, scale: 3, strokeColor: s.color }, offset: '0', repeat: '14px' }];
          }
          const l = new G.maps.Polyline(opts);
          keep(l); return { remove: () => l.setMap(null) };
        },
        clearOverlays() { stuff.splice(0).forEach((x) => x.setMap(null)); },
        resize: () => window.google.maps.event.trigger(map, 'resize'),
      };
    },
  };

  // Decide which engine to use (once per page). Safe to call many times.
  function init() {
    if (!initPromise) {
      initPromise = (async () => {
        let key = '';
        try {
          const r = await fetch('/api/config');
          if (r.ok) key = ((await r.json()).google_maps_key || '').trim();
        } catch (e) { /* no config: free map */ }
        if (key) {
          try {
            await loadGoogleScript(key);
            const lib = (n) => window.google.maps.importLibrary(n);
            G = { maps: await lib('maps'), core: await lib('core'), marker: await lib('marker'), places: await lib('places') };
            engine = Goog; engineName = 'google';
            return;
          } catch (e) { console.warn('Google Maps unavailable, using the free map:', e.message); }
        }
        engine = Leaf; engineName = 'leaflet';
      })();
    }
    return initPromise;
  }

  async function createMap(elId, o) {
    await init();
    return engine.create(elId, o);
  }

  // ---------- 1. finding the PPA ----------
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

  // 1. If the corper pinned the exact spot, use it (no searching needed).
  // 2. Otherwise search: most exact text first, then less exact until something is found.
  // "precision" tells the page how much to trust the pin.
  async function findPpa(ppa) {
    if (ppa.lat != null && ppa.lon != null) {
      return { lat: ppa.lat, lon: ppa.lon, precision: 'pinned' };
    }
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

  // ---------- search for your PPA by the name on the posting letter ----------
  // The corper types the name (e.g. "Govt Secondary School" or "Primary Health Centre") and a town.
  // We list every named school / clinic / office / police station etc. around that town,
  // and put the ones whose NAME is most like what was typed first.
  function cleanState(s) {
    s = (s || '').replace(/ State$/i, '');
    return /federal capital/i.test(s) ? 'FCT' : s;
  }

  // Short forms and spelling variants, so "GSS" matches "Government Secondary School".
  const WORD_FIX = {
    govt: 'government', gov: 'government', gsss: 'government secondary school', gss: 'government secondary school',
    gjss: 'government junior secondary school', gdss: 'government day secondary school', gdsc: 'government day secondary school',
    phc: 'primary health centre', pry: 'primary', pri: 'primary', sec: 'secondary', sch: 'school', schl: 'school',
    hosp: 'hospital', ctr: 'centre', cntr: 'centre', center: 'centre', centers: 'centre', centres: 'centre', clinic: 'clinic',
    hc: 'health centre', nur: 'nursery', jnr: 'junior', snr: 'senior', comp: 'comprehensive', cmd: 'command', psy: 'police',
    lg: 'local government', lga: 'local government', st: 'saint', saints: 'saint',
  };
  const SKIP = new Set(['the', 'of', 'and', 'in', 'at', 'for', 'a']);

  function words(text) {
    const out = [];
    (text || '').toLowerCase().replace(/[.,'’]/g, '').split(/[^a-z0-9]+/).filter(Boolean).forEach((w) => {
      (WORD_FIX[w] || w).split(' ').forEach((x) => { if (!SKIP.has(x)) out.push(x); });
    });
    return out;
  }

  function editDistance(a, b) {
    if (Math.abs(a.length - b.length) > 2) return 3;
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    return d[a.length][b.length];
  }

  // 0..1: how much of what the corper typed shows up (roughly) in this place's name.
  function nameScore(typed, name) {
    const q = words(typed), n = words(name);
    if (!q.length) return 0;
    let sum = 0;
    for (const w of q) {
      let best = 0;
      for (const x of n) {
        if (x === w) { best = 1; break; }
        if (w.length >= 3 && (x.startsWith(w) || w.startsWith(x)) && Math.min(w.length, x.length) >= 3) best = Math.max(best, 0.8);
        else if (w.length >= 4 && editDistance(w, x) <= 1) best = Math.max(best, 0.7);
        else if (w.length >= 7 && editDistance(w, x) <= 2) best = Math.max(best, 0.55);
      }
      sum += best;
    }
    return sum / q.length;
  }

  function fromNominatim(data) {
    const seen = new Set();
    const list = [];
    for (const r of data) {
      const a = r.address || {};
      const name = r.name || a.school || a.college || a.university || a.hospital || a.amenity || a.office || (r.display_name || '').split(',')[0];
      const town = a.suburb || a.neighbourhood || a.village || a.town || a.city || a.hamlet || '';
      const address = [a.road, town, a.county || a.state_district, a.state].filter(Boolean).join(', ');
      const id = name + '|' + r.lat + '|' + r.lon;
      if (!name || seen.has(id)) continue;
      seen.add(id);
      list.push({ name, address, lat: parseFloat(r.lat), lon: parseFloat(r.lon), state: cleanState(a.state), lga: a.county || a.state_district || '', town });
    }
    return list;
  }

  async function nominatimList(q) {
    const url = 'https://nominatim.openstreetmap.org/search?format=json&limit=12&addressdetails=1&countrycodes=ng&q=' + encodeURIComponent(q);
    const response = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error('The map search service said ' + response.status + '. Try again in a moment.');
    return fromNominatim(await response.json());
  }

  // Every named place of the usual PPA kinds within 10 km of the town centre.
  async function overpassAround(centre, townName, state) {
    const near = '(around:10000,' + centre.lat + ',' + centre.lon + ')';
    const amenities = 'school|college|university|kindergarten|hospital|clinic|doctors|pharmacy|police|townhall|courthouse|bank|post_office|fire_station|community_centre|library|social_facility';
    const ql = '[out:json][timeout:25];(' +
      'nwr["amenity"~"^(' + amenities + ')$"]["name"]' + near + ';' +
      'nwr["office"]["name"]' + near + ';' +
      'nwr["healthcare"]["name"]' + near + ';' +
      ');out center 400;';
    // Several public Overpass servers: if one is busy, try the next.
    const SERVERS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter'];
    let response = null;
    for (const server of SERVERS) {
      try {
        const r = await fetch(server, {
          method: 'POST', body: 'data=' + encodeURIComponent(ql),
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        });
        if (r.ok) { response = r; break; }
      } catch (e) { /* try the next server */ }
    }
    if (!response) throw new Error('The nearby-places service is busy or not reachable');
    const data = await response.json();
    const list = [];
    for (const e of data.elements || []) {
      const tg = e.tags || {};
      const lat = e.lat != null ? e.lat : (e.center && e.center.lat);
      const lon = e.lon != null ? e.lon : (e.center && e.center.lon);
      if (lat == null || lon == null || !tg.name) continue;
      const town = tg['addr:suburb'] || tg['addr:city'] || townName || '';
      const street = tg['addr:housenumber'] && tg['addr:street'] ? tg['addr:housenumber'] + ' ' + tg['addr:street'] : tg['addr:street'];
      list.push({ name: tg.name, address: [street, town, state].filter(Boolean).join(', '), lat, lon, state: state || '', lga: '', town,
                  d: haversineKm(centre.lat, centre.lon, lat, lon) });
    }
    return list;
  }

  // Google place search (runs in the browser through the Google Maps library, with the same key).
  // Google's terms: its place results may only be shown on a Google map, and must not be stored,
  // so these are never saved in localStorage.
  async function googleSearch(typedName, town, state) {
    const text = [typedName || 'school', 'in', [town, state].filter(Boolean).join(', ') + ', Nigeria'].join(' ');
    const { places } = await G.places.Place.searchByText({
      textQuery: text, fields: ['displayName', 'formattedAddress', 'location'],
      region: 'ng', language: 'en', maxResultCount: 20,
    });
    return (places || []).map((p, i) => {
      const address = p.formattedAddress || '';
      const st = (typeof NG_STATES !== 'undefined' ? NG_STATES : []).find((s) => new RegExp('\\b' + s + '\\b', 'i').test(address)) || '';
      const name = typeof p.displayName === 'string' ? p.displayName : (p.displayName && p.displayName.text) || '';
      return { name, address: address.replace(/, Nigeria$/, ''), lat: p.location.lat(), lon: p.location.lng(), state: st, lga: '', town: '',
               score: typedName ? nameScore(typedName, name) : 0, order: i };
    }).filter((x) => x.name);
  }

  // typedName: the PPA name as on the letter (may be empty). town: the town to look around.
  // The returned array also carries: .centre (town centre, or null), .problem (text if a service failed),
  // .noMatch, .googleProblem
  async function searchPlaces(typedName, town, state, lga) {
    await init();
    const where = [town || lga, (town && lga && town.toLowerCase() !== lga.toLowerCase()) ? lga : '', state].filter(Boolean).join(', ');
    const key = 'nysc_places3:' + (typedName || '').toLowerCase() + '|' + where.toLowerCase();
    let list = [];
    let centre = null;
    let problem = '';
    let googleProblem = '';

    // 0. Google place search (only when Google Maps is the map)
    if (engineName === 'google') {
      try {
        list = await googleSearch(typedName, town || lga, state);
        list.sort((x, y) => (y.score - x.score) || (x.order - y.order));
      } catch (e) {
        googleProblem = 'Google place search failed: ' + (e && e.message ? e.message : e) + '. Check that "Places API (New)" is enabled for your key.';
        list = [];
      }
      if (list.length) {
        list.centre = { lat: list[0].lat, lon: list[0].lon };
        list.problem = '';
        list.googleProblem = '';
        return list;
      }
    } else {
      try { const saved = localStorage.getItem(key); if (saved) { const c = JSON.parse(saved); c.centre = c.length ? { lat: c[0].lat, lon: c[0].lon } : null; return c; } } catch (e) { /* no cache */ }
    }

    // A. all named places around the town (OpenStreetMap), ranked by how much their name looks like the typed one
    try {
      centre = await geocodeOne(where + ', Nigeria');
    } catch (e) { problem = 'The town search service is not reachable. Check your internet and try again.'; }
    if (centre) {
      try {
        const all = await overpassAround(centre, town || lga, state);
        all.forEach((x) => { x.score = typedName ? nameScore(typedName, x.name) : 0; });
        const close = all.filter((x) => x.score >= 0.34);
        if (!typedName) list = all.sort((x, y) => x.d - y.d).slice(0, 30);
        else if (close.length) list = close.sort((x, y) => (y.score - x.score) || (x.d - y.d)).slice(0, 30);
        else if (all.length) { list = all.sort((x, y) => x.d - y.d).slice(0, 12); list.noMatch = true; }
      } catch (e) { problem = e.message + '.'; }
    }

    // B. ask the search service directly for the name in that town
    if (!list.length || list.noMatch) {
      try {
        await sleep(1100);
        const direct = await nominatimList([typedName, where].filter(Boolean).join(', ') + ', Nigeria');
        if (direct.length) { direct.forEach((x) => { x.score = typedName ? nameScore(typedName, x.name) : 0; }); list = direct; }
      } catch (e) { if (!list.length && !problem) problem = e.message; }
    }
    if (list.length && !list.noMatch && engineName !== 'google') { try { localStorage.setItem(key, JSON.stringify(list)); } catch (e) { /* ignore */ } }
    list.centre = centre || (list.length ? { lat: list[0].lat, lon: list[0].lon } : null);
    list.problem = problem;
    list.googleProblem = googleProblem;
    return list;
  }

  // Which state / LGA / town is this spot in? (Nominatim reverse lookup)
  async function whereIs(lat, lon) {
    const url = 'https://nominatim.openstreetmap.org/reverse?format=json&zoom=14&addressdetails=1&lat=' + lat + '&lon=' + lon;
    const response = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!response.ok) return null;
    const a = (await response.json()).address || {};
    return { state: cleanState(a.state), lga: a.county || a.state_district || '', town: a.suburb || a.neighbourhood || a.village || a.town || a.city || '' };
  }

  // ---------- 2. where you are standing now ----------
  function getUserPosition() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error('This browser cannot share your location.'));
      if (!window.isSecureContext) {
        return reject(new Error('Location only works on https:// or http://127.0.0.1 pages.'));
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude, accuracy: pos.coords.accuracy }),
        (err) => reject(new Error(err.code === 1
          ? 'Location is blocked. Click the padlock next to the web address and allow Location.'
          : 'Could not get your location. Check that GPS or Wi-Fi is on, then try again.')),
        { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
      );
    });
  }

  // ---------- 3. drawing ----------
  // The road line comes from the free OSRM demo server (same for both maps).
  async function getRoadRoute(user, ppa) {
    try {
      const url = 'https://router.project-osrm.org/route/v1/driving/' + user.lon + ',' + user.lat + ';' + ppa.lon + ',' + ppa.lat +
                  '?overview=full&geometries=geojson';
      const r = await fetch(url);
      const j = await r.json();
      if (j.code !== 'Ok' || !j.routes || !j.routes.length) return null;
      return { km: j.routes[0].distance / 1000, pts: j.routes[0].geometry.coordinates.map((c) => [c[1], c[0]]) };
    } catch (e) { return null; }
  }

  const GREEN = '#01652d';

  // user can be null: then only the PPA pin is shown.
  async function draw(canvasId, ppa, label, user, onRoadDistance) {
    let st = handles[canvasId];
    if (!st) {
      st = handles[canvasId] = { map: await createMap(canvasId, { lat: ppa.lat, lon: ppa.lon, zoom: 13 }), run: 0 };
    }
    const { map } = st;
    const run = ++st.run;                       // a newer draw makes older road answers stale
    map.resize();                               // fixes a grey/half map if the box was hidden
    map.clearOverlays();

    const ppaPin = map.addMarker(ppa.lat, ppa.lon, { popup: '<b>🏫 ' + esc(label) + '</b>' });

    if (!user) {
      map.setView(ppa.lat, ppa.lon, (ppa.precision === 'exact' || ppa.precision === 'pinned') ? 17 : 13);
      ppaPin.openPopup();
      return;
    }

    // You: a pin, plus a circle showing how accurate the GPS reading is.
    map.addMarker(user.lat, user.lon, { popup: '<b>👤 You are here</b>', you: true });
    if (user.accuracy && user.accuracy < 3000) map.addCircle(user.lat, user.lon, user.accuracy);
    map.fit([[user.lat, user.lon], [ppa.lat, ppa.lon]]);

    // Straight dashed line straight away; swap it for the road when the road arrives.
    const dashed = map.addLine([[user.lat, user.lon], [ppa.lat, ppa.lon]], { color: GREEN, weight: 4, opacity: 0.8, dashed: true });
    const road = await getRoadRoute(user, ppa);
    if (run !== st.run || !road) return;
    dashed.remove();
    map.addLine(road.pts, { color: '#ffffff', weight: 9, opacity: 0.9 });
    map.addLine(road.pts, { color: GREEN, weight: 5, opacity: 0.95 });
    if (onRoadDistance) onRoadDistance(road.km);
  }

  // ---------- the whole job, used by the pages ----------
  // opts: { canvasId, badgeId, ppa (the saved record), beforeDraw (optional), refreshButtonId (optional) }
  async function showPpa(opts) {
    const { canvasId, badgeId, ppa, beforeDraw, refreshButtonId } = opts;
    const label = ppa.ppa_name;

    say(badgeId, '🔍 Finding ' + label + ' on the map…', 'warn');
    await init();
    let spot;
    try {
      spot = await findPpa(ppa);
    } catch (err) {
      say(badgeId, '⚠️ ' + err.message + ' Check your internet and refresh.', 'bad');
      return;
    }
    if (!spot) {
      say(badgeId, '⚠️ We could not find "' + label + '" or its LGA on the map. Open PPA settings and drop a pin on the exact spot.', 'bad');
      return;
    }

    if (beforeDraw) beforeDraw();               // e.g. un-hide the map box BEFORE the map measures it
    await draw(canvasId, spot, label, null);    // show the PPA straight away

    const where = {
      pinned: '', exact: '', street: ' (street position)',
      town: ' (showing the town centre: pin the exact spot in PPA settings)',
      lga: ' (showing the LGA centre: pin the exact spot in PPA settings)',
    }[spot.precision];

    // Find where you are standing, then draw the route and the distance. Can be repeated.
    async function locateAndDraw() {
      say(badgeId, '📍 Finding where you are standing…', 'warn');
      let user;
      try {
        user = await getUserPosition();
      } catch (err) {
        say(badgeId, '📍 Showing ' + label + where + '. ' + err.message, 'warn');
        return;
      }
      const km = haversineKm(user.lat, user.lon, spot.lat, spot.lon);
      const near = km < 0.15 ? ' You are at your PPA.' : '';
      const base = '🚶 You are about ' + km.toFixed(1) + ' km (straight line) from ' + label + where + '.' + near;
      say(badgeId, base, 'ok');
      await draw(canvasId, spot, label, user, (roadKm) => {
        say(badgeId, base + ' By road: about ' + roadKm.toFixed(1) + ' km.', 'ok');
      });
    }

    if (refreshButtonId && $(refreshButtonId)) {
      $(refreshButtonId).hidden = false;
      $(refreshButtonId).onclick = locateAndDraw;   // "Update my location"
    }
    await locateAndDraw();
  }

  return { haversineKm, findPpa, searchPlaces, whereIs, getUserPosition, draw, showPpa, createMap, init, provider: () => engineName };
})();
