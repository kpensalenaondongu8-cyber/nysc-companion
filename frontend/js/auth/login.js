// Already logged in? Skip straight to the tracker.
if (Session.token()) window.location.href = '/home';

if (new URLSearchParams(location.search).has('expired')) {
  say('notice', 'Your session has ended. Please log in again.', 'warn');
}

$('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();

  const phone = $('phone').value;
  const password = $('pw').value;

  // Check the boxes first; only talk to the server if both are fine.
  const phoneBad = setBad('f-phone', !phoneOk(phone));
  const pwBad = setBad('f-pw', !password);
  if (phoneBad || pwBad) return;

  $('submit').disabled = true;
  say('notice', '', '');
  try {
    const data = await api('POST', '/api/login', { number: phone, password });
    Session.save(data.token, data.user, $('remember').checked);
    window.location.href = '/home';
  } catch (err) {
    say('notice', err.message, 'bad');
    $('submit').disabled = false;
  }
});
