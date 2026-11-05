/* The PPA settings page: /ppa-locator
   Fill in the form, save it, then go to the map page.
   (The map itself lives on /ppa-route, so there is no map code here.) */

fillSelect('p-state', NG_STATES, 'Choose state');

// If a PPA is already saved, put it back into the form.
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
    }
  } catch (err) {
    $('load-error').textContent = 'Could not load your saved PPA: ' + err.message;
    $('load-error').hidden = false;
  }
})();

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

  e.submitter.disabled = true;
  say('ppa-notice', 'Saving…', 'warn');
  try {
    await api('PUT', '/api/ppa', body);
    say('ppa-notice', '✅ PPA saved. Opening the map…', 'ok');
    window.location.href = '/ppa-route';
  } catch (err) {
    say('ppa-notice', err.message, 'bad');
    e.submitter.disabled = false;
  }
});
