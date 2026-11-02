/* The top bar shared by every logged-in page. Put <div id="topbar"></div> in the page. */
if (!Session.token()) window.location.href = '/login';

(function () {
  let user = {};
  try { user = JSON.parse(localStorage.getItem('nysc_user') || sessionStorage.getItem('nysc_user')) || {}; } catch (e) { /* ignore */ }
  const first = user.first_name || 'Corps';
  const last = user.last_name || 'Member';

  const links = [['/home', 'Home'], ['/houses', 'Houses for rent'], ['/agents', 'House agents'], ['/expenses', 'Expenses']];
  const nav = links.map(([href, label]) =>
    `<a href="${href}"${location.pathname === href ? ' aria-current="page"' : ''}>${label}</a>`).join('');

  $('topbar').outerHTML = `
    <header class="topbar">
      <a class="brand" href="/home" style="color:inherit;text-decoration:none">
        <span class="logo-chip"><img src="/frontend/nysc-logo.png" alt="National Youth Service Corps logo"></span>
        <div><b>NYSC Companion</b><small>Your PPA, your home, your allowance</small></div>
      </a>
      <nav class="topnav" aria-label="Main">${nav}</nav>
      <div class="topbar-actions">
        <div class="who"><span>${esc(first + ' ' + last)}</span><small>Corps member</small></div>
        <div class="avatar" aria-hidden="true">${esc((first[0] + last[0]).toUpperCase())}</div>
        <button class="btn sm light" type="button" id="logout">Log out</button>
      </div>
    </header>`;

  $('logout').addEventListener('click', async () => {
    try { await api('POST', '/api/logout'); } catch (err) { /* leave anyway */ }
    Session.clear();
    window.location.href = '/login';
  });
})();
