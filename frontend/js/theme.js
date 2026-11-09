/* Light / dark theme. Loaded in <head> on every page so there is no white flash.
   The choice ("light", "dark" or "auto" = follow the phone) is kept on this device. */
(function () {
  var KEY = 'nysc_theme';
  function pref() { try { return localStorage.getItem(KEY) || 'auto'; } catch (e) { return 'auto'; } }
  function dark(p) { return p === 'dark' || (p === 'auto' && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches); }
  function apply() {
    var d = dark(pref());
    document.documentElement.dataset.theme = d ? 'dark' : 'light';
    var m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute('content', d ? '#0e1612' : '#014a21');
  }
  window.Theme = {
    get: pref,
    set: function (p) { try { localStorage.setItem(KEY, p); } catch (e) { /* ignore */ } apply(); },
  };
  apply();
  document.addEventListener('DOMContentLoaded', apply);
  if (window.matchMedia) {
    var q = matchMedia('(prefers-color-scheme: dark)');
    (q.addEventListener ? q.addEventListener.bind(q, 'change') : q.addListener.bind(q))(apply);
  }
})();
