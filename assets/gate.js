/* Lobby password gate.
   A soft, client-side gate: every locked room's key is stored below as a
   SHA-256 hash, the visitor's key is hashed in the browser and compared, and
   an unlocked room is remembered for the browser session (per tab). Because
   the site is static and public this keeps casual visitors out but is not
   real security: anyone who reads the page source can bypass it.

   To change a key:  python3 -c "import hashlib;print(hashlib.sha256(b'NEW').hexdigest())"
   and paste the result for that room. All rooms currently share the key 1111. */
(function () {
  'use strict';
  var KEYS = {
    'fin-lab':       '0ffe1abd1a08215353c233d6e009613e95eec4253832a761af28ff37ac5a150c',
    'legal-quarter': '0ffe1abd1a08215353c233d6e009613e95eec4253832a761af28ff37ac5a150c',
    'maiden-hall':   '0ffe1abd1a08215353c233d6e009613e95eec4253832a761af28ff37ac5a150c',
    'library':       '0ffe1abd1a08215353c233d6e009613e95eec4253832a761af28ff37ac5a150c',
    'bedroom':       '0ffe1abd1a08215353c233d6e009613e95eec4253832a761af28ff37ac5a150c',
    'garden':        '0ffe1abd1a08215353c233d6e009613e95eec4253832a761af28ff37ac5a150c'
  };

  // Compact SHA-256 (UTF-8 input, hex output).
  function sha256(input) {
    var ascii = unescape(encodeURIComponent(input));
    function rr(v, a) { return (v >>> a) | (v << (32 - a)); }
    var maxWord = Math.pow(2, 32), i, j, result = '';
    var words = [], asciiBitLength = ascii.length * 8;
    var hash = [], k = [], primeCounter = 0, isComposite = {};
    for (var candidate = 2; primeCounter < 64; candidate++) {
      if (!isComposite[candidate]) {
        for (i = 0; i < 313; i += candidate) isComposite[i] = candidate;
        hash[primeCounter] = (Math.pow(candidate, 0.5) * maxWord) | 0;
        k[primeCounter++] = (Math.pow(candidate, 1 / 3) * maxWord) | 0;
      }
    }
    ascii += '\x80';
    while (ascii.length % 64 - 56) ascii += '\x00';
    for (i = 0; i < ascii.length; i++) {
      j = ascii.charCodeAt(i);
      words[i >> 2] |= j << ((3 - i) % 4) * 8;
    }
    words[words.length] = (asciiBitLength / maxWord) | 0;
    words[words.length] = asciiBitLength;
    for (j = 0; j < words.length;) {
      var w = words.slice(j, j += 16), oldHash = hash;
      hash = hash.slice(0, 8);
      for (i = 0; i < 64; i++) {
        var w15 = w[i - 15], w2 = w[i - 2];
        var a = hash[0], e = hash[4];
        var temp1 = hash[7] + (rr(e, 6) ^ rr(e, 11) ^ rr(e, 25)) + ((e & hash[5]) ^ ((~e) & hash[6])) + k[i] +
          (w[i] = (i < 16) ? w[i] : (w[i - 16] + (rr(w15, 7) ^ rr(w15, 18) ^ (w15 >>> 3)) + w[i - 7] + (rr(w2, 17) ^ rr(w2, 19) ^ (w2 >>> 10))) | 0);
        var temp2 = (rr(a, 2) ^ rr(a, 13) ^ rr(a, 22)) + ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));
        hash = [(temp1 + temp2) | 0].concat(hash);
        hash[4] = (hash[4] + temp1) | 0;
      }
      for (i = 0; i < 8; i++) hash[i] = (hash[i] + oldHash[i]) | 0;
    }
    for (i = 0; i < 8; i++) for (j = 3; j + 1; j--) {
      var b = (hash[i] >> (j * 8)) & 255;
      result += ((b < 16) ? 0 : '') + b.toString(16);
    }
    return result;
  }

  function el(tag, attrs, children) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'class') e.className = attrs[k]; else if (k === 'text') e.textContent = attrs[k]; else e.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) { if (c) e.appendChild(c); });
    return e;
  }

  var Gate = {
    sha256: sha256,
    isLocked: function (room) { return Object.prototype.hasOwnProperty.call(KEYS, room); },
    isOpen: function (room) {
      if (!Gate.isLocked(room)) return true;
      try { return sessionStorage.getItem('lobby-key:' + room) === '1'; } catch (e) { return false; }
    },
    open: function (room) { try { sessionStorage.setItem('lobby-key:' + room, '1'); } catch (e) { /* no storage */ } },
    check: function (room, key) { return !!KEYS[room] && sha256(key) === KEYS[room]; },

    /* Show the gate for one room. opts: name, onOpen, onCancel, backHref. */
    prompt: function (room, opts) {
      opts = opts || {};
      var existing = document.querySelector('.gate-overlay');
      if (existing) existing.remove();
      var input = el('input', { type: 'password', autocomplete: 'off', inputmode: 'numeric', 'aria-label': 'Key', placeholder: '••••' });
      var error = el('div', { class: 'gate-error', 'aria-live': 'polite' });
      var button = el('button', { type: 'submit', text: 'Unlock' });
      var form = el('form', { class: 'gate-form' }, [input, button]);
      var back = el('a', { class: 'gate-back', href: opts.backHref || '#', text: opts.backHref ? '← Back to the Lobby' : 'Cancel' });
      var plate = el('div', { class: 'gate-plate', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'gate-title' }, [
        el('div', { class: 'gate-inner' }, [
          el('div', { class: 'keyhole', 'aria-hidden': 'true' }),
          el('h2', { id: 'gate-title', text: (opts.name || room) }),
          el('p', { text: 'This quarter is locked. Enter the key.' }),
          form, error, back
        ])
      ]);
      var overlay = el('div', { class: 'gate-overlay' }, [plate]);
      document.body.appendChild(overlay);
      setTimeout(function () { input.focus(); }, 30);
      function close() { overlay.remove(); if (opts.onCancel) opts.onCancel(); }
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        if (Gate.check(room, input.value)) {
          Gate.open(room);
          overlay.remove();
          if (opts.onOpen) opts.onOpen();
        } else {
          error.textContent = 'That key does not fit.';
          plate.classList.remove('shake'); void plate.offsetWidth; plate.classList.add('shake');
          input.select();
        }
      });
      if (!opts.backHref) back.addEventListener('click', function (e) { e.preventDefault(); close(); });
      overlay.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !opts.backHref) close(); });
      return overlay;
    },

    /* For a room page: hide the content until the room's key is given. */
    require: function (room, name) {
      if (Gate.isOpen(room)) return;
      document.documentElement.classList.add('gated');
      document.addEventListener('DOMContentLoaded', function () {
        Gate.prompt(room, { name: name || room, backHref: '../', onOpen: function () { document.documentElement.classList.remove('gated'); } });
      });
    }
  };
  window.LobbyGate = Gate;
})();
