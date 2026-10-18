/* =============================================================================
   REXUS v2.2.3 — result notification (GEN-10).
   One component for the result of every action, shown in the centre of the screen:
     success / info → close by themselves after ~2.5 s (click or Esc closes earlier)
     error / warning → stay until OK (or an action such as Retry) is chosen
   A new notification replaces the one on screen; they never stack. Errors and warnings
   are announced with role="alert", success and info with role="status".
   Background progress ("Saving…") keeps its small corner indicator (#wmSync) and form
   validation stays at the field — neither goes through this component.
   Usage: REXUSNotify('Task saved')                       → success
          REXUSNotify('Could not save: …', 'error', { action: { label: 'Retry', run: fn } })
          REXUSNotify(text, 'success', { sticky: true })   → stays until OK (e.g. a one-time password)
   Returns a Promise that resolves when the notification closes.
   ========================================================================== */
(function () {
  'use strict';
  var TITLES = { success: 'Success', error: 'Something went wrong', warning: 'Please check', info: 'Information' };
  var ICONS = {
    success: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    error: '<path d="M7 7l10 10M17 7L7 17"/>',
    warning: '<path d="M12 7v6"/><path d="M12 16.5v.5"/>',
    info: '<path d="M12 11v6"/><path d="M12 7.5v.5"/>'
  };
  var AUTO_MS = 2500, current = null;

  function close(n, how) {
    if (!n || n.closed) return; n.closed = true;
    clearTimeout(n.timer); document.removeEventListener('keydown', n.onKey, true);
    n.layer.classList.remove('is-in'); n.layer.classList.add('is-out');
    setTimeout(function () { if (n.layer.parentNode) n.layer.remove(); }, 160);
    if (n.restore && n.restore.isConnected && n.blocking) { try { n.restore.focus({ preventScroll: true }); } catch (e) {} }
    if (current === n) current = null;
    n.resolve(how || 'closed');
  }

  function notify(message, type, opts) {
    opts = opts || {};
    type = type === 'ok' ? 'success' : (TITLES[type] ? type : 'success');
    if (current) close(current, 'replaced');
    var blocking = type === 'error' || type === 'warning' || !!opts.sticky || !!opts.action;
    var layer = document.createElement('div');
    layer.className = 'rx-notify-layer rx-notify-' + type + (blocking ? ' is-blocking' : '');
    layer.innerHTML = '<div class="rx-notify" role="' + (type === 'error' || type === 'warning' ? 'alert' : 'status') + '" aria-live="' + (type === 'error' || type === 'warning' ? 'assertive' : 'polite') + '" aria-atomic="true" tabindex="-1">' +
      '<span class="rx-notify-icon" aria-hidden="true"><svg viewBox="0 0 24 24">' + ICONS[type] + '</svg></span>' +
      '<div class="rx-notify-text"><strong class="rx-notify-title"></strong><p class="rx-notify-msg"></p></div>' +
      (blocking ? '<div class="rx-notify-actions">' + (opts.action ? '<button type="button" class="wm-btn" data-act>' + '</button>' : '') + '<button type="button" class="wm-btn primary" data-ok>OK</button></div>' : '') + '</div>';
    layer.querySelector('.rx-notify-title').textContent = opts.title || TITLES[type];
    layer.querySelector('.rx-notify-msg').textContent = String(message == null ? '' : message);
    if (opts.action) layer.querySelector('[data-act]').textContent = opts.action.label || 'Retry';
    var n = { layer: layer, blocking: blocking, restore: document.activeElement, closed: false };
    var p = new Promise(function (res) { n.resolve = res; });
    n.onKey = function (e) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(n, 'dismissed'); }
      else if (blocking && e.key === 'Tab') {   // keep focus on the notification's buttons while it waits for OK
        var b = [].slice.call(layer.querySelectorAll('button')); var i = b.indexOf(document.activeElement);
        e.preventDefault(); b[(i + (e.shiftKey ? b.length - 1 : 1)) % b.length].focus();
      }
    };
    document.addEventListener('keydown', n.onKey, true);
    layer.addEventListener('click', function (e) {
      if (e.target.closest('[data-ok]')) return close(n, 'ok');
      if (e.target.closest('[data-act]')) { close(n, 'action'); try { opts.action.run(); } catch (x) { console.error(x); } return; }
      if (!blocking) close(n, 'dismissed');
    });
    document.body.appendChild(layer);
    requestAnimationFrame(function () { layer.classList.add('is-in'); });
    if (blocking) setTimeout(function () { var ok = layer.querySelector('[data-ok]'); if (ok && !n.closed) ok.focus({ preventScroll: true }); }, 0);
    else n.timer = setTimeout(function () { close(n, 'timeout'); }, opts.duration || AUTO_MS);
    current = n; notify.last = { type: type, text: String(message == null ? '' : message), at: Date.now() };   // last result, for diagnostics/tests
    return p;
  }
  notify.close = function () { if (current) close(current, 'dismissed'); };
  notify.current = function () { return current ? { type: (current.layer.className.match(/rx-notify-(success|error|warning|info)/) || [])[1], text: current.layer.querySelector('.rx-notify-msg').textContent } : null; };
  window.REXUSNotify = notify;
})();
