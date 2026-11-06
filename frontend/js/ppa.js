/* The PPA settings page: /ppa-locator
   1. Fill in the details from your posting letter.
   2. Pin the exact spot on a map (satellite or street view).
   3. Optionally add a photo of the gate or signboard.
   Then save, and the map page shows the route from where you are standing to your PPA. */

fillSelect('p-state', NG_STATES, 'Choose state');

let pin = null;            // { lat, lon } or null
let hadPin = false;        // was a pin already saved?
let pinMarker = null;
let newPhoto = null;       // a photo chosen now (data URL)
let savedPhoto = '';       // the photo already saved (file name)
let removePhoto = false;

// ---------- the map ----------
const layers = NYSC_MAP.baseLayers();
const pickMap = L.map('pick-map', { layers: [layers.satellite] }).setView([9.08, 8.68], 6);   // all of Nigeria
NYSC_MAP.addLayerSwitch(pickMap, layers);

function showReadout() {
  $('pin-readout').textContent = pin
    ? `📍 Pinned at ${pin.lat.toFixed(5)}, ${pin.lon.toFixed(5)}. Drag the pin or tap the map to move it.`
    : 'No pin yet.';
  $('pin-clear').hidden = !pin;
}

function setPin(lat, lon, zoom) {
  pin = { lat, lon };
  if (!pinMarker) {
    pinMarker = L.marker([lat, lon], { draggable: true }).addTo(pickMap);
    pinMarker.on('dragend', () => {
      const p = pinMarker.getLatLng();
      pin = { lat: p.lat, lon: p.lng };
      showReadout();
    });
  } else {
    pinMarker.setLatLng([lat, lon]);
  }
  if (zoom) pickMap.setView([lat, lon], Math.max(pickMap.getZoom(), zoom));
  showReadout();
}

pickMap.on('click', (e) => setPin(e.latlng.lat, e.latlng.lng));

$('pin-clear').addEventListener('click', () => {
  if (pinMarker) { pickMap.removeLayer(pinMarker); pinMarker = null; }
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
      say('pin-notice', `We could only find the ${hit.precision === 'town' ? 'town' : 'LGA'} centre. Zoom in on the satellite view and tap your PPA building.`, 'warn');
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
(async function loadSavedPpa() {
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
      if (p.lat != null && p.lon != null) { hadPin = true; setPin(p.lat, p.lon, 17); }
      if (p.photo) { savedPhoto = p.photo; showPhoto('/uploads/ppa/' + encodeURIComponent(p.photo)); }
    }
  } catch (err) {
    $('load-error').textContent = 'Could not load your saved PPA: ' + err.message;
    $('load-error').hidden = false;
  }
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

  // setBad marks a field red and returns true when something is wrong.
  const problems = [
    setBad('f-name', !body.ppa_name),
    setBad('f-state', !body.state),
    setBad('f-lga', !body.lga),
  ];
  if (problems.some(Boolean)) return;

  if (pin) { body.lat = pin.lat; body.lon = pin.lon; }
  else if (hadPin) { body.clear_pin = true; }
  if (newPhoto) body.photo = newPhoto;
  else if (removePhoto) body.remove_photo = true;

  $('ppa-save').disabled = true;
  say('ppa-notice', 'Saving…', 'warn');
  try {
    await api('PUT', '/api/ppa', body);
    say('ppa-notice', '✅ PPA saved. Opening the map…', 'ok');
    window.location.href = '/ppa-route';
  } catch (err) {
    say('ppa-notice', err.message, 'bad');
    $('ppa-save').disabled = false;
  }
});
