// Forgot password: phone + the admin's one-time code + a new password.
$('reset-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const phone = $('phone').value, code = $('code').value.trim(), pw = $('pw').value, pw2 = $('pw2').value;
  const bad = [
    setBad('f-phone', !phoneOk(phone)),
    setBad('f-code', code.replace(/[^A-Za-z0-9]/g, '').length !== 8),
    setBad('f-pw', pw.length < 8),
    setBad('f-pw2', pw2 !== pw),
  ];
  if (bad.some(Boolean)) return;
  $('submit').disabled = true;
  say('notice', '', '');
  try {
    await api('POST', '/api/reset-password', { number: phone, code, password: pw });
    $('reset-form').hidden = true;
    say('notice', 'Your password is changed. You can log in now.', 'ok');
    $('notice').insertAdjacentHTML('beforeend', ' <a class="link" href="/login"><b>Log in</b></a>');
  } catch (err) {
    say('notice', err.message, 'bad');
    $('submit').disabled = false;
  }
});
