(function () {
  var $ = function (id) { return document.getElementById(id); };
  var vid = $('pbv'), ph = $('pbph'), cdn = $('pbcd'), fl = $('pbfl'), msg = $('pbmsg');
  if (!vid) return;
  var bStart = $('pbstart'), bShoot = $('pbshoot'), bDl = $('pbdl'), bAgain = $('pbagain');
  var res = $('pbres'), out = $('pbout'), cap = $('pbcap'), delaySel = $('pbdelay');
  var PW = 520, PH = 390, PAD = 36, GAP = 18, CAPH = 110;
  var LAYOUTS = { strip: { n: 4, cols: 1 }, trio: { n: 3, cols: 1 }, grid: { n: 4, cols: 2 }, single: { n: 1, cols: 1 } };
  var CSSF = {
    none: 'none',
    bw: 'grayscale(1) contrast(1.1)',
    sepia: 'sepia(.85) contrast(1.05)',
    vivid: 'saturate(1.5) contrast(1.1)',
    vintage: 'sepia(.35) saturate(1.2) contrast(.95) brightness(1.05)',
    cool: 'hue-rotate(-12deg) saturate(1.1) brightness(1.03)'
  };
  var stream = null, busy = false, shots = [], filter = 'none', layout = 'strip', frame = '#ffffff';

  function say(t) { msg.textContent = t; }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function pressed(group, btn) {
    var bs = group.querySelectorAll('button');
    for (var i = 0; i < bs.length; i++) bs[i].setAttribute('aria-pressed', bs[i] === btn ? 'true' : 'false');
  }

  function stopCam() {
    if (stream) { stream.getTracks().forEach(function (t) { t.stop(); }); }
    stream = null; vid.srcObject = null; ph.hidden = false;
    bStart.textContent = 'Start camera'; bShoot.disabled = true;
  }

  function startCam() {
    if (stream) { stopCam(); say('Camera is off.'); return; }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      say('Your browser cannot open a camera here. Use a current browser over HTTPS.'); return;
    }
    say('Waiting for camera permission…');
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false })
      .then(function (s) {
        stream = s; vid.srcObject = s; vid.play();
        ph.hidden = true; bStart.textContent = 'Stop camera'; bShoot.disabled = false;
        say('Camera ready. Press “Take photos” when you are.');
      })
      .catch(function (e) {
        var n = e && e.name;
        say(n === 'NotAllowedError' ? 'Camera access was blocked. Allow it in your browser’s site settings and try again.'
          : n === 'NotFoundError' ? 'No camera was found on this device.'
          : 'The camera could not start. Close other apps using it and try again.');
      });
  }

  function applyFilter(d, name) {
    var p = d.data, i, r, g, b, l;
    if (name === 'none') return;
    for (i = 0; i < p.length; i += 4) {
      r = p[i]; g = p[i + 1]; b = p[i + 2]; l = .299 * r + .587 * g + .114 * b;
      if (name === 'bw') { l = (l - 128) * 1.1 + 128; r = g = b = l; }
      else if (name === 'sepia') {
        r = .393 * p[i] + .769 * p[i + 1] + .189 * p[i + 2];
        g = .349 * p[i] + .686 * p[i + 1] + .168 * p[i + 2];
        b = .272 * p[i] + .534 * p[i + 1] + .131 * p[i + 2];
        r = p[i] * .15 + r * .85; g = p[i + 1] * .15 + g * .85; b = p[i + 2] * .15 + b * .85;
      }
      else if (name === 'vivid') {
        r = l + (r - l) * 1.5; g = l + (g - l) * 1.5; b = l + (b - l) * 1.5;
        r = (r - 128) * 1.1 + 128; g = (g - 128) * 1.1 + 128; b = (b - 128) * 1.1 + 128;
      }
      else if (name === 'vintage') {
        var sr = .393 * r + .769 * g + .189 * b, sg = .349 * r + .686 * g + .168 * b, sb = .272 * r + .534 * g + .131 * b;
        r = r * .65 + sr * .35; g = g * .65 + sg * .35; b = b * .65 + sb * .35;
        r = r * .9 + 22; g = g * .9 + 20; b = b * .9 + 16;
      }
      else if (name === 'cool') { r *= .93; b *= 1.08; g *= 1.02; }
      p[i] = r; p[i + 1] = g; p[i + 2] = b;
    }
  }

  function capture() {
    var c = document.createElement('canvas'); c.width = PW; c.height = PH;
    var x = c.getContext('2d'), vw = vid.videoWidth || 640, vh = vid.videoHeight || 480;
    var sw = vw, sh = vw * 3 / 4, sx = 0, sy = 0;
    if (sh > vh) { sh = vh; sw = vh * 4 / 3; sx = (vw - sw) / 2; } else { sy = (vh - sh) / 2; }
    x.translate(PW, 0); x.scale(-1, 1);
    x.drawImage(vid, sx, sy, sw, sh, 0, 0, PW, PH);
    return c;
  }

  function isDark(hex) {
    var n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    return (.299 * r + .587 * g + .114 * b) < 140;
  }

  function compose() {
    var L = LAYOUTS[layout];
    if (!shots.length || shots.length !== L.n) return;
    var rows = Math.ceil(L.n / L.cols);
    var W = PAD * 2 + L.cols * PW + (L.cols - 1) * GAP;
    var H = PAD * 2 + rows * PH + (rows - 1) * GAP + CAPH;
    out.width = W; out.height = H;
    var x = out.getContext('2d');
    x.fillStyle = frame; x.fillRect(0, 0, W, H);
    for (var i = 0; i < shots.length; i++) {
      var col = i % L.cols, row = Math.floor(i / L.cols);
      var px = PAD + col * (PW + GAP), py = PAD + row * (PH + GAP);
      var t = document.createElement('canvas'); t.width = PW; t.height = PH;
      var tx = t.getContext('2d'); tx.drawImage(shots[i], 0, 0);
      var d = tx.getImageData(0, 0, PW, PH); applyFilter(d, filter); tx.putImageData(d, 0, 0);
      x.drawImage(t, px, py);
    }
    var text = (cap.value || '').trim() || 'photoboothonline.xyz';
    var date = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    x.fillStyle = isDark(frame) ? '#ffffff' : '#1f1528'; x.textAlign = 'center';
    x.font = '700 34px Georgia, serif'; x.fillText(text.slice(0, 36), W / 2, H - CAPH + 54);
    x.font = '22px system-ui, sans-serif'; x.globalAlpha = .7; x.fillText(date, W / 2, H - CAPH + 90); x.globalAlpha = 1;
    res.hidden = false; bDl.disabled = false;
  }

  async function run() {
    if (busy || !stream) return;
    busy = true; bShoot.disabled = true; shots = []; res.hidden = true;
    var n = LAYOUTS[layout].n, secs = parseInt(delaySel.value, 10) || 3;
    for (var i = 0; i < n; i++) {
      say('Photo ' + (i + 1) + ' of ' + n + ' – get ready!');
      for (var s = secs; s > 0; s--) { cdn.textContent = s; await sleep(1000); }
      cdn.textContent = '';
      fl.classList.add('on'); shots.push(capture());
      setTimeout(function () { fl.classList.remove('on'); }, 60);
      await sleep(600);
    }
    busy = false; bShoot.disabled = !stream;
    compose(); say('Done! Download your photo strip or take it again.');
    res.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function download() {
    out.toBlob(function (b) {
      if (!b) return;
      var a = document.createElement('a'), u = URL.createObjectURL(b);
      a.href = u; a.download = 'photobooth-' + layout + '-' + Date.now() + '.png';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(u); }, 2000);
    }, 'image/png');
  }

  function bind(id, fn) {
    var g = $(id);
    g.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b || busy) return;
      pressed(g, b); fn(b);
    });
  }

  bind('pbfilters', function (b) {
    filter = b.getAttribute('data-f'); vid.style.filter = CSSF[filter]; compose();
  });
  bind('pblayouts', function (b) {
    layout = b.getAttribute('data-l'); shots = []; res.hidden = true; bDl.disabled = true;
    say('Layout set to ' + b.textContent.trim() + '. Take new photos to build it.');
  });
  bind('pbframes', function (b) { frame = b.getAttribute('data-c'); compose(); });
  cap.addEventListener('input', compose);
  bStart.addEventListener('click', startCam);
  bShoot.addEventListener('click', run);
  bAgain.addEventListener('click', run);
  bDl.addEventListener('click', download);
  window.addEventListener('pagehide', stopCam);
})();

(function () {
  var v = document.getElementById('ytv');
  if (!v) return;
  v.addEventListener('click', function () {
    var id = v.getAttribute('data-id'), f = document.createElement('iframe');
    f.src = 'https://www.youtube-nocookie.com/embed/' + id + '?autoplay=1&rel=0';
    f.title = v.getAttribute('data-title');
    f.allow = 'accelerometer; autoplay; encrypted-media; picture-in-picture; fullscreen';
    f.setAttribute('allowfullscreen', '');
    f.referrerPolicy = 'strict-origin-when-cross-origin';
    v.parentNode.replaceChild(f, v);
  });
})();
