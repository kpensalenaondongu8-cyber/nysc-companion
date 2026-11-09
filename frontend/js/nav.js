/* The top bar shared by every logged-in page. Put <div id="topbar"></div> in the page.
   It also keeps each kind of account on its own pages:
     corper  -> Home, Houses for rent, House agents, Reviews, Expenses
     agent   -> My listings, Dashboard, Reviews
     admin   -> Overview, Approvals, Reviews                                                   */
if (!Session.token()) window.location.href = '/login';

(function () {
  let user = {};
  try { user = JSON.parse(localStorage.getItem('nysc_user') || sessionStorage.getItem('nysc_user')) || {}; } catch (e) { /* ignore */ }
  const first = user.first_name || 'Corps';
  const last = user.last_name || 'Member';
  const isAgent = user.role === 'agent';          // older logins have no role: they are corpers
  const isAdmin = user.role === 'admin';

  // Send people to the right place if they open a page that is not for them.
  const path = location.pathname;
  const allowed = isAdmin ? ['/admin-overview', '/admin', '/reviews', '/settings']
                : isAgent ? ['/agent-hub', '/agent-dash', '/reviews', '/house', '/settings']
                : null;                                   // corpers: everything except the two pages below
  const home = isAdmin ? '/admin-overview' : isAgent ? '/agent-hub' : '/home';
  if (allowed && !allowed.includes(path)) window.location.replace(home);
  if (!allowed && ['/agent-hub', '/agent-dash', '/admin', '/admin-overview'].includes(path)) window.location.replace(home);

  const links = isAdmin
    ? [['/admin-overview', 'Overview'], ['/admin', 'Approvals'], ['/reviews', 'Reviews']]
    : isAgent
      ? [['/agent-hub', 'My listings'], ['/agent-dash', 'Dashboard'], ['/reviews', 'Reviews']]
      : [['/home', 'Home'], ['/houses', 'Houses'], ['/agents', 'Agents'], ['/board', 'Board'], ['/reviews', 'Reviews'], ['/expenses', 'Expenses'], ['/checklist', 'Checklist'], ['/cds', 'CDS']];
  const nav = links.map(([href, label]) =>
    `<a href="${href}"${path === href ? ' aria-current="page"' : ''}>${label}</a>`).join('');

  $('topbar').outerHTML = `
    <header class="topbar">
      <a class="brand" href="${home}" style="color:inherit;text-decoration:none">
        <span class="logo-chip"><img src="/frontend/nysc-logo.png" alt="National Youth Service Corps logo"></span>
        <div><b>NYSC Companion</b><small>${isAdmin ? 'Admin' : isAgent ? 'House agent portal' : 'Your PPA, your home, your allowance'}</small></div>
      </a>
      <nav class="topnav" id="topnav" aria-label="Main">${nav}<a class="menu-only" href="/settings"${path === '/settings' ? ' aria-current="page"' : ''}>Settings</a><button class="menu-logout" type="button" id="logout2">Log out</button></nav>
      <div class="topbar-actions">
        <div class="who"><span>${esc(first + ' ' + last)}</span><small>${isAdmin ? 'Administrator' : isAgent ? 'House agent' : 'Corps member'}</small></div>
        <a class="avatar" href="/settings" aria-label="Settings and profile"${path === '/settings' ? ' aria-current="page"' : ''}>${user.photo ? `<img src="/uploads/avatars/${encodeURIComponent(user.photo)}" alt="">` : esc((first[0] + last[0]).toUpperCase())}</a>
        <button class="btn sm light" type="button" id="logout">Log out</button>
        <button class="menu-btn" type="button" id="menu-btn" aria-label="Menu" aria-expanded="false" aria-controls="topnav">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>
        </button>
      </div>
    </header>`;

  // Phones: the links live in a menu so the top bar stays on one line.
  const bar = document.querySelector('.topbar');
  $('menu-btn').addEventListener('click', () => {
    const open = bar.classList.toggle('open');
    $('menu-btn').setAttribute('aria-expanded', String(open));
  });

  const logOut = async () => {
    try { await api('POST', '/api/logout'); } catch (err) { /* leave anyway */ }
    Session.clear();
    window.location.href = '/login';
  };
  $('logout').addEventListener('click', logOut);
  $('logout2').addEventListener('click', logOut);
})();
