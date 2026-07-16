/**
 * Runs before the Vite module bundle — first executable script on cold boot.
 * Captures Despia stalls where app-*.js downloads but never evaluates.
 */
(function bootFirstBeacon() {
  if (typeof window === 'undefined') return;

  function beacon(event, payload) {
    try {
      fetch('https://us-central1-vybe-daaab.cloudfunctions.net/authQr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: {
            action: 'debug_oauth',
            event: event,
            hypothesisId: 'H-boot',
            location: 'boot-first-beacon.js',
            payload: payload || {},
          },
        }),
        keepalive: true,
      }).catch(function () {});
    } catch (e) {
      /* ignore */
    }
  }

  var ua = (navigator.userAgent || '').toLowerCase();
  var isDespia = /despia|vybeapp|; wv\)|\bwv\b/.test(ua) || !!window.Despia || !!window.__DESPIA__;

  beacon('boot_first_script', {
    host: location.hostname || '',
    path: location.pathname || '',
    despia: isDespia,
  });

  window.addEventListener(
    'error',
    function (e) {
      beacon('boot_js_error', {
        msg: String((e && e.message) || 'error').slice(0, 160),
        file: String((e && e.filename) || '').slice(0, 120),
        line: e && e.lineno,
        col: e && e.colno,
        despia: isDespia,
      });
    },
    true,
  );

  window.addEventListener('unhandledrejection', function (e) {
    var reason = e.reason;
    beacon('boot_promise_rejection', {
      msg: String(reason instanceof Error ? reason.message : reason || 'rejection').slice(0, 160),
      despia: isDespia,
    });
  });

  window.__vybeBootBeacon = beacon;
})();
