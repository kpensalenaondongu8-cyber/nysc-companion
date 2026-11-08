/* CDS and community project: /cds */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const niceDate = (iso) => { const [y, m, d] = iso.split('-').map(Number); return d + ' ' + MONTHS[m - 1] + ' ' + y; };
const todayIso = () => { const n = new Date(); return n.getFullYear() + '-' + String(n.getMonth() + 1).padStart(2, '0') + '-' + String(n.getDate()).padStart(2, '0'); };
const STATUS_TEXT = { present: 'Present', absent: 'Absent', excused: 'Excused' };
const PROJECT_TEXT = { planned: 'Planned', ongoing: 'Ongoing', done: 'Done' };

let data = null;
let newPhoto = null;

function say(id, text, kind) { const el = $(id); el.textContent = text; el.className = 'notice show ' + (kind || 'bad'); }
function clear(id) { $(id).className = 'notice'; }
const uploadUrl = (name) => '/uploads/cds/' + encodeURIComponent(name);

async function load() {
  try {
    data = await api('GET', '/api/cds');
    $('load-error').hidden = true;
  } catch (err) {
    $('load-error').textContent = err.message;
    $('load-error').hidden = false;
    return;
  }
  const { profile, sessions, updates, stats } = data;

  // Fill the group and project forms only when the person is not typing in them.
  if (!load.filled) {
    $('g-name').value = profile.group_name;
    $('g-day').value = profile.meet_day;
    $('g-leader').value = profile.leader;
    $('p-title').value = profile.project_title;
    $('p-about').value = profile.project_about;
    $('p-status').value = profile.project_status;
    load.filled = true;
  }
  $('proj-pill').textContent = PROJECT_TEXT[profile.project_status] || '';
  $('proj-pill').hidden = !profile.project_title;

  $('stats').innerHTML = [
    ['Present', stats.present, 'good'],
    ['Absent', stats.absent, stats.absent ? 'warn' : ''],
    ['Excused', stats.excused, ''],
    ['Attendance', stats.rate === null ? '–' : stats.rate + '%', stats.rate !== null && stats.rate >= 75 ? 'good' : ''],
  ].map(([label, n, cls]) => `<div class="stat ${cls}"><b>${n}</b><small>${label}</small></div>`).join('');

  $('att-list').innerHTML = sessions.length ? sessions.map((s) => `
    <li><span class="d">${esc(niceDate(s.day))}</span>
      <span><span class="tag ${esc(s.status)}">${esc(STATUS_TEXT[s.status])}</span><span class="n">${esc(s.note)}</span></span>
      <button type="button" class="x" data-sdel="${s.id}">Delete</button></li>`).join('')
    : '<li class="empty" style="border:0;display:block;padding:0">No CDS days logged yet. Add the first one above.</li>';

  $('upd-list').innerHTML = updates.length ? updates.map((u) => `
    <li><span class="d">${esc(niceDate(u.day))}</span><p>${esc(u.note)}</p>
      ${u.photo ? `<img src="${uploadUrl(u.photo)}" alt="Photo from ${esc(niceDate(u.day))}" loading="lazy">` : ''}
      <button type="button" class="x" data-udel="${u.id}">Delete</button></li>`).join('')
    : '<li class="empty" style="border:0;display:block;padding:0">Nothing recorded yet. Add what you do for the project, with a photo if you can.</li>';

  buildReport();
}

function buildReport() {
  const { profile, sessions, updates, stats } = data;
  let user = {};
  try { user = JSON.parse(localStorage.getItem('nysc_user') || sessionStorage.getItem('nysc_user')) || {}; } catch (e) { /* ignore */ }
  const name = [user.first_name, user.last_name].filter(Boolean).join(' ') || 'Corps member';
  const rows = sessions.slice().reverse();
  $('report').innerHTML = `
    <h1>CDS and community project summary</h1>
    <div>${esc(name)} · printed ${esc(niceDate(todayIso()))}</div>
    <h2>CDS group</h2>
    <div>${esc(profile.group_name || 'Not entered')}${profile.meet_day ? ' · meets on ' + esc(profile.meet_day) + 's' : ''}${profile.leader ? ' · leader: ' + esc(profile.leader) : ''}</div>
    <h2>Attendance</h2>
    <div>Present ${stats.present} · Absent ${stats.absent} · Excused ${stats.excused}${stats.rate === null ? '' : ' · Attendance ' + stats.rate + '%'}</div>
    ${rows.length ? `<table><thead><tr><th>Date</th><th>Status</th><th>Note</th></tr></thead><tbody>${rows.map((s) =>
      `<tr><td>${esc(niceDate(s.day))}</td><td>${esc(STATUS_TEXT[s.status])}</td><td>${esc(s.note)}</td></tr>`).join('')}</tbody></table>` : '<div>No days logged.</div>'}
    <h2>Community project</h2>
    <div><b>${esc(profile.project_title || 'Not entered')}</b>${profile.project_title ? ' (' + esc(PROJECT_TEXT[profile.project_status]) + ')' : ''}</div>
    ${profile.project_about ? `<div>${esc(profile.project_about)}</div>` : ''}
    ${updates.length ? '<h2>What we did</h2>' + updates.slice().reverse().map((u) =>
      `<div class="u"><b>${esc(niceDate(u.day))}</b> · ${esc(u.note)}${u.photo ? `<br><img src="${uploadUrl(u.photo)}" alt="">` : ''}</div>`).join('') : ''}
    <h2>Signed</h2>
    <div style="margin-top:28px">Leader: ____________________ &nbsp;&nbsp; Date: ______________</div>`;
}

async function run(fn) {
  try { await fn(); } catch (err) { $('load-error').textContent = err.message; $('load-error').hidden = false; return; }
  await load();
}

$('group-form').addEventListener('submit', async (e) => {
  e.preventDefault(); clear('g-notice');
  try {
    await api('PUT', '/api/cds/profile', { ...data.profile, group_name: $('g-name').value, meet_day: $('g-day').value, leader: $('g-leader').value });
    load.filled = false; await load();
    say('g-notice', 'Group saved.', 'ok');
  } catch (err) { say('g-notice', err.message); }
});

$('proj-form').addEventListener('submit', async (e) => {
  e.preventDefault(); clear('p-notice');
  try {
    await api('PUT', '/api/cds/profile', { ...data.profile, project_title: $('p-title').value, project_about: $('p-about').value, project_status: $('p-status').value });
    load.filled = false; await load();
    say('p-notice', 'Project saved.', 'ok');
  } catch (err) { say('p-notice', err.message); }
});

$('att-form').addEventListener('submit', async (e) => {
  e.preventDefault(); clear('a-notice');
  if (!$('a-day').value) return say('a-notice', 'Pick the date of the CDS day.');
  try {
    await api('POST', '/api/cds/session', { day: $('a-day').value, status: $('a-status').value, note: $('a-note').value });
    $('a-note').value = '';
    await load();
    say('a-notice', 'Logged.', 'ok');
  } catch (err) { say('a-notice', err.message); }
});

$('att-list').addEventListener('click', (e) => {
  const b = e.target.closest('[data-sdel]');
  if (!b || !confirm('Delete this day from your attendance log?')) return;
  run(() => api('DELETE', '/api/cds/session/' + b.dataset.sdel));
});

function showPhoto(src) {
  $('u-photo-box').hidden = !src;
  if (src) $('u-photo-preview').src = src;
}
$('u-photo').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try { newPhoto = await shrinkPhoto(file); showPhoto(newPhoto); } catch (err) { say('u-notice', err.message); }
  e.target.value = '';
});
$('u-photo-remove').addEventListener('click', () => { newPhoto = null; showPhoto(''); });

$('upd-form').addEventListener('submit', async (e) => {
  e.preventDefault(); clear('u-notice');
  const note = $('u-note').value.trim();
  if (!$('u-day').value) return say('u-notice', 'Pick the date.');
  if (!note) return say('u-notice', 'Write what you did.');
  try {
    const body = { day: $('u-day').value, note };
    if (newPhoto) body.photo = newPhoto;
    await api('POST', '/api/cds/update', body);
    $('u-note').value = ''; newPhoto = null; showPhoto('');
    await load();
    say('u-notice', 'Added to your record.', 'ok');
  } catch (err) { say('u-notice', err.message); }
});

$('upd-list').addEventListener('click', (e) => {
  const b = e.target.closest('[data-udel]');
  if (!b || !confirm('Delete this update and its photo?')) return;
  run(() => api('DELETE', '/api/cds/update/' + b.dataset.udel));
});

$('print-btn').addEventListener('click', () => window.print());

$('a-day').value = todayIso();
$('a-day').max = todayIso();
$('u-day').value = todayIso();
$('u-day').max = todayIso();
load();
