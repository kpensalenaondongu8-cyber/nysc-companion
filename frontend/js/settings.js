/* Settings: /settings */
const store = () => (localStorage.getItem('nysc_token') ? localStorage : sessionStorage);

// Keep the saved copy of "who is logged in" in step with what was just changed (the top bar reads it).
function updateStoredUser(patch) {
  const s = store();
  let u = {};
  try { u = JSON.parse(s.getItem('nysc_user')) || {}; } catch (e) { /* ignore */ }
  const merged = { ...u, ...patch };
  s.setItem('nysc_user', JSON.stringify(merged));
  // Update the top bar now, so the new name or picture shows without a reload.
  const who = document.querySelector('.topbar .who span');
  if (who) who.textContent = (merged.first_name || '') + ' ' + (merged.last_name || '');
  const av = document.querySelector('.topbar .avatar');
  if (av) av.innerHTML = merged.photo
    ? `<img src="/uploads/avatars/${encodeURIComponent(merged.photo)}" alt="">`
    : esc(((merged.first_name || '?')[0] + (merged.last_name || '?')[0]).toUpperCase());
}

const avatarUrl = (name) => '/uploads/avatars/' + encodeURIComponent(name);

function drawAvatar(me) {
  $('big-avatar').innerHTML = me.photo
    ? `<img src="${avatarUrl(me.photo)}" alt="">`
    : esc(((me.first_name || '?')[0] + (me.last_name || '')[0]).toUpperCase());
  $('photo-remove').hidden = !me.photo;
}

// Centre square, 256 px: small to upload and sharp enough for the round picture.
async function squarePhoto(file) {
  const img = await new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const i = new Image();
    i.onload = () => { URL.revokeObjectURL(url); resolve(i); };
    i.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That file is not a picture we can read.')); };
    i.src = url;
  });
  const side = Math.min(img.naturalWidth, img.naturalHeight);
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  c.getContext('2d').drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, 256, 256);
  return c.toDataURL('image/jpeg', 0.85);
}

let me = {};
function fill(m) {
  me = m;
  $('first').value = m.first_name; $('middle').value = m.middle_name || ''; $('last').value = m.last_name; $('email').value = m.email;
  $('cur-number').textContent = m.number;
  drawAvatar(m);
}

$('photo-file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  say('photo-notice', '', '');
  try {
    const r = await api('POST', '/api/me/photo', { photo: await squarePhoto(file) });
    me.photo = r.photo; drawAvatar(me); updateStoredUser({ photo: r.photo });
    say('photo-notice', 'Picture saved.', 'ok');
  } catch (err) { say('photo-notice', err.message, 'bad'); }
});
$('photo-remove').addEventListener('click', async () => {
  try {
    await api('DELETE', '/api/me/photo');
    me.photo = ''; drawAvatar(me); updateStoredUser({ photo: '' });
    say('photo-notice', 'Picture removed.', 'ok');
  } catch (err) { say('photo-notice', err.message, 'bad'); }
});

$('profile-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const first = $('first').value.trim(), last = $('last').value.trim(), email = $('email').value.trim();
  const bad = [setBad('f-first', !first), setBad('f-last', !last), setBad('f-email', !/^\S+@\S+\.\S+$/.test(email))];
  if (bad.some(Boolean)) return;
  say('profile-notice', '', '');
  try {
    const m = await api('PUT', '/api/me/profile', { first_name: first, middle_name: $('middle').value.trim(), last_name: last, email });
    fill(m); updateStoredUser({ first_name: m.first_name, last_name: m.last_name });
    say('profile-notice', 'Details saved.', 'ok');
  } catch (err) { say('profile-notice', err.message, 'bad'); }
});

$('number-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const bad = [setBad('f-number', !phoneOk($('number').value)), setBad('f-numpw', !$('numpw').value)];
  if (bad.some(Boolean)) return;
  say('number-notice', '', '');
  try {
    const m = await api('PUT', '/api/me/number', { number: $('number').value, password: $('numpw').value });
    fill(m); $('number').value = ''; $('numpw').value = '';
    say('number-notice', 'Phone number changed. Log in with the new number next time.', 'ok');
  } catch (err) { say('number-notice', err.message, 'bad'); }
});

$('password-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const bad = [setBad('f-cur', !$('cur').value), setBad('f-new', $('new').value.length < 8), setBad('f-new2', $('new2').value !== $('new').value)];
  if (bad.some(Boolean)) return;
  say('password-notice', '', '');
  try {
    await api('PUT', '/api/me/password', { current: $('cur').value, new: $('new').value });
    $('cur').value = $('new').value = $('new2').value = '';
    say('password-notice', 'Password changed. Your other devices are logged out.', 'ok');
  } catch (err) { say('password-notice', err.message, 'bad'); }
});

document.querySelectorAll('input[name=theme]').forEach((r) => {
  r.checked = r.value === Theme.get();
  r.addEventListener('change', () => Theme.set(r.value));
});

$('logout-all').addEventListener('click', async () => {
  if (!confirm('Log out of every device, including this one?')) return;
  try { await api('POST', '/api/me/logout-all'); } catch (err) { /* leave anyway */ }
  Session.clear();
  window.location.href = '/login';
});

$('delete-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (setBad('f-delpw', !$('delpw').value)) return;
  if (!confirm('Delete your account for good? This cannot be undone.')) return;
  say('delete-notice', '', '');
  try {
    await api('POST', '/api/me/delete', { password: $('delpw').value });
    Session.clear();
    window.location.href = '/login';
  } catch (err) { say('delete-notice', err.message, 'bad'); }
});

(async () => {
  try {
    const me = await api('GET', '/api/me');
    fill(me);
    $('delete-panel').hidden = me.role === 'admin';
    $('agent-del').hidden = me.role !== 'agent';
    $('content').hidden = false;
  } catch (err) {
    $('load-error').textContent = err.message;
    $('load-error').hidden = false;
  }
})();
