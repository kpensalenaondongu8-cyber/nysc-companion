/* The Home page: /home
   Describes the site and links to its four tools. It only reads /api/home to personalise a few lines. */

(async function load() {
  try {
    const home = await api('GET', '/api/home');
    const { user, ppa } = home;
    $('hello').textContent = 'Welcome, ' + user.first_name;

    if (ppa) {
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
  try {
    const c = await api('GET', '/api/checklist');
    const a = c.attention || [];
    if (a.length) {
      const late = a.filter((r) => r.due < new Date().toISOString().slice(0, 10)).length;
      $('remind-h').textContent = a.length === 1 ? '1 reminder needs you' : a.length + ' reminders need you';
      $('remind-t').textContent = a[0].title + (a.length > 1 ? ' and ' + (a.length - 1) + ' more' : '') + (late ? ' (overdue)' : ' (due this week)');
      $('remind').hidden = false;
    }
    $('t-check').textContent = c.progress.done + ' of ' + c.progress.total + ' steps done';
  } catch (err) { /* the tile still works without the count */ }
  try {
    const d = await api('GET', '/api/cds');
    const n = d.stats.total;
    if (n) $('t-cds').textContent = n + (n === 1 ? ' CDS day logged' : ' CDS days logged') + (d.stats.rate === null ? '' : ' · ' + d.stats.rate + '% attendance');
    else if (d.profile.group_name) $('t-cds').textContent = d.profile.group_name;
  } catch (err) { /* the tile still works without the count */ }
  try {
    const b = await api('GET', '/api/board');
    const n = b.posts.length;
    $('t-board').textContent = (n === 0 ? 'Be the first to post in ' : n + (n === 1 ? ' post in ' : ' posts in ')) + b.place.lga;
  } catch (err) { /* no PPA saved yet: the tile keeps its default line */ }
})();
