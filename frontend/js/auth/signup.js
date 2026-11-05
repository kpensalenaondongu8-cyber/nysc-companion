// Where each kind of account starts.
function landing(role) { return role === 'agent' ? '/agent-hub' : '/home'; }
if (Session.token()) {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem('nysc_user') || sessionStorage.getItem('nysc_user')) || {}; } catch (e) { /* ignore */ }
  window.location.href = landing(saved.role);
}

// Password strength bar: 1 point each for length, mixed case, a digit, a symbol.
function strength(p) {
  let s = 0;
  if (p.length >= 8) s++;
  if (/[A-Z]/.test(p) && /[a-z]/.test(p)) s++;
  if (/\d/.test(p)) s++;
  if (/[^A-Za-z0-9]/.test(p)) s++;
  return p ? Math.max(1, s) : 0;
}
$('pw').addEventListener('input', (e) => { $('meter').dataset.s = strength(e.target.value); });

$('signup-form').addEventListener('submit', async (e) => {
  e.preventDefault();

  const first = $('first').value.trim();
  const mid = $('mid').value.trim();
  const last = $('last').value.trim();
  const phone = $('phone').value;
  const email = $('email').value.trim();
  const pw = $('pw').value;
  const role = document.querySelector('input[name="role"]:checked').value;

  // Every check runs (no early exit) so all bad fields turn red at once.
  const problems = [
    setBad('f-first', !first),
    setBad('f-last', !last),
    setBad('f-phone', !phoneOk(phone)),
    setBad('f-email', !/^\S+@\S+\.\S+$/.test(email)),
    setBad('f-pw', pw.length < 8),
    setBad('f-pw2', !$('pw2').value || $('pw2').value !== pw),
    setBad('f-terms', !$('terms').checked),
  ];
  if (problems.some(Boolean)) return;

  $('submit').disabled = true;
  say('notice', '', '');
  try {
    const data = await api('POST', '/api/register', {
      first_name: first, middle_name: mid, last_name: last,
      number: phone, email, password: pw, role,
    });
    Session.save(data.token, data.user, true);   // the server logs the new user in
    window.location.href = landing(data.user.role);
  } catch (err) {
    say('notice', err.message, 'bad');
    $('submit').disabled = false;
  }
});
