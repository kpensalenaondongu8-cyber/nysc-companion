/* The Home page: /home
   Describes the site and links to its four tools. It only reads /api/home to personalise a few lines. */

(async function load() {
  try {
    const home = await api('GET', '/api/home');
    const { user, ppa } = home;
    $('hello').textContent = 'Welcome, ' + user.first_name;

    if (ppa) {
      $('hero-main').textContent = 'Open my route';
      $('hero-main').href = '/ppa-route';
      $('ppa-strip').hidden = false;
      $('ppa-title').textContent = ppa.ppa_name;
      $('ppa-where').textContent = [ppa.address, ppa.town, ppa.lga, ppa.state].filter(Boolean).join(', ');
      $('t-ppa').textContent = ppa.lat != null ? 'Pinned: ' + ppa.ppa_name : 'Saved. Pin the exact spot next';
      $('t-houses').textContent = home.houses_nearby === 1 ? '1 house near you' : home.houses_nearby + ' houses near you';
      $('t-agents').textContent = home.agents_nearby === 1 ? '1 agent near you' : home.agents_nearby + ' agents near you';
    }
    $('t-money').textContent = home.remaining === null ? 'Set your allowance' : naira(home.remaining) + ' left this month';
  } catch (err) {
    $('load-error').textContent = err.message;
    $('load-error').hidden = false;
  }
})();
