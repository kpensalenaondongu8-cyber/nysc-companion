let home = null;

fillSelect('p-state', NG_STATES, 'Choose state');

function renderHome() {
  const { user, ppa } = home;
  $('hello').textContent = 'Hello, ' + user.first_name;

  // PPA: show the form when none is saved, otherwise the summary card.
  $('ppa-form-panel').hidden = !!ppa && !editing;
  $('ppa-card-panel').hidden = !ppa || editing;
  $('ppa-cancel').hidden = !ppa;
  if (ppa) {
    $('ppa-title').textContent = ppa.ppa_name;
    $('ppa-where').textContent = [ppa.address, ppa.town, ppa.lga, ppa.state].filter(Boolean).join(', ');
    $('hello-sub').textContent = `Showing what is around ${ppa.town || ppa.lga}, ${ppa.state}.`;
    $('n-houses').textContent = home.houses_nearby;
    $('n-agents').textContent = home.agents_nearby;
    $('p-houses').textContent = `Listings in ${ppa.lga} LGA. Tap to search the rest of ${ppa.state}.`;
    $('p-agents').textContent = `Agents in ${ppa.lga} LGA, with phone and WhatsApp.`;
  } else {
    $('hello-sub').textContent = 'Start by saving your PPA so we can show you what is around it.';
  }
  $('n-money').textContent = home.remaining === null ? 'Set up' : naira(home.remaining);
  $('p-money').textContent = home.remaining === null ? 'Set your monthly allowance and track what you spend.' : 'Balance left from your monthly allowance.';
}

let editing = false;
function fillForm() {
  const p = home.ppa || {};
  $('p-name').value = p.ppa_name || '';
  $('p-addr').value = p.address || '';
  $('p-state').value = p.state || '';
  $('p-lga').value = p.lga || '';
  $('p-town').value = p.town || '';
}

$('ppa-edit').addEventListener('click', () => { editing = true; fillForm(); renderHome(); });
$('ppa-cancel').addEventListener('click', () => { editing = false; renderHome(); });

$('ppa-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = {
    ppa_name: $('p-name').value.trim(), address: $('p-addr').value.trim(),
    state: $('p-state').value, lga: $('p-lga').value.trim(), town: $('p-town').value.trim(),
  };
  const bad = [setBad('f-name', !body.ppa_name), setBad('f-state', !body.state), setBad('f-lga', !body.lga)];
  if (bad.some(Boolean)) return;

  e.submitter.disabled = true;
  try {
    home = await api('PUT', '/api/ppa', body);
    editing = false;
    renderHome();
  } catch (err) {
    say('ppa-notice', err.message, 'bad');
  }
  e.submitter.disabled = false;
});

(async function load() {
  try {
    home = await api('GET', '/api/home');
    fillForm();
    renderHome();
  } catch (err) {
    $('load-error').textContent = err.message;
    $('load-error').hidden = false;
  }
})();
