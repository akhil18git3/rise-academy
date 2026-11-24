(function () {
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---- Hero headline: word-by-word entrance ----
  var h1 = document.getElementById('heroTitle');
  var words = h1.textContent.trim().split(/\s+/);
  h1.setAttribute('aria-label', h1.textContent.trim());
  h1.innerHTML = words.map(function (w, i) {
    var hl = /^(Successful|futures|tomorrow\.)$/.test(w) ? ' hl' : '';
    return '<span class="w' + hl + '" aria-hidden="true" style="--i:' + i + '">' + w + '</span>';
  }).join(' ');

  // ---- Nav: shrink on scroll, progress bar, active link ----
  var nav = document.getElementById('nav');
  var progress = document.getElementById('progress');
  var linkEls = Array.prototype.slice.call(document.querySelectorAll('.links a[href^="#"]:not(.btn)'));
  var sections = linkEls.map(function (a) { return document.querySelector(a.getAttribute('href')); });
  var parallaxEl = document.querySelector('.parallax');
  function onScroll() {
    var y = window.scrollY, max = document.documentElement.scrollHeight - window.innerHeight;
    nav.classList.toggle('scrolled', y > 30);
    progress.style.width = (max > 0 ? (y / max) * 100 : 0) + '%';
    var cur = -1;
    sections.forEach(function (s, i) { if (s && s.getBoundingClientRect().top < window.innerHeight * 0.4) cur = i; });
    linkEls.forEach(function (a, i) { a.classList.toggle('active', i === cur); });
    if (parallaxEl && !reduce) {
      var r = parallaxEl.getBoundingClientRect();
      var off = (r.top + r.height / 2 - window.innerHeight / 2) * -0.08;
      parallaxEl.querySelector('img').style.transform = 'translateY(' + off.toFixed(1) + 'px)';
    }
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // ---- Mobile menu ----
  var burger = document.getElementById('burger');
  var links = document.getElementById('links');
  function setMenu(open) {
    links.classList.toggle('open', open);
    burger.setAttribute('aria-expanded', String(open));
    burger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  }
  burger.addEventListener('click', function () { setMenu(!links.classList.contains('open')); });
  links.querySelectorAll('a').forEach(function (a) { a.addEventListener('click', function () { setMenu(false); }); });

  // ---- Scroll reveal + counters ----
  function count(el) {
    var target = +el.dataset.count, suffix = el.dataset.suffix || '', t0 = null, dur = 1600;
    function tick(t) {
      if (!t0) t0 = t;
      var p = Math.min((t - t0) / dur, 1), e = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(target * e).toLocaleString('en-IN') + (p === 1 ? suffix : '');
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (en) {
      if (!en.isIntersecting) return;
      en.target.classList.add('in');
      en.target.querySelectorAll('[data-count]').forEach(function (c) { if (!reduce) count(c); });
      io.unobserve(en.target);
    });
  }, { threshold: 0.15 });
  document.querySelectorAll('.reveal,.reveal-left').forEach(function (el) { io.observe(el); });
  // counters sitting outside revealed blocks (hero)
  var cio = new IntersectionObserver(function (entries) {
    entries.forEach(function (en) { if (en.isIntersecting) { if (!reduce) count(en.target); cio.unobserve(en.target); } });
  }, { threshold: 0.5 });
  document.querySelectorAll('.hero [data-count]').forEach(function (c) { cio.observe(c); });

  // ---- 3D tilt on course cards ----
  if (!reduce && window.matchMedia('(hover:hover)').matches) {
    document.querySelectorAll('[data-tilt]').forEach(function (card) {
      card.addEventListener('mousemove', function (e) {
        var r = card.getBoundingClientRect();
        var x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
        card.style.transition = 'box-shadow .3s';
        card.style.transform = 'perspective(900px) rotateY(' + (x * 8) + 'deg) rotateX(' + (-y * 8) + 'deg) translateY(-6px)';
      });
      card.addEventListener('mouseleave', function () {
        card.style.transition = 'transform .5s, box-shadow .3s';
        card.style.transform = '';
      });
    });
  }

  // ---- Call-back form: saves to Google Sheet (Apps Script), falls back to WhatsApp ----
  // Paste your Apps Script Web App URL between the quotes (ends with /exec).
  var SHEET_URL = '';
  var form = document.getElementById('callbackForm');
  var statusEl = document.getElementById('formStatus');
  function say(msg, ok) { statusEl.textContent = msg; statusEl.className = 'form-status ' + (ok ? 'ok' : 'err'); }
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var phone = form.phone.value.trim();
    if (!SHEET_URL) { // not configured yet: open WhatsApp as before
      var text = encodeURIComponent('Hi Rise Academy, please call me back on ' + phone);
      window.open('https://wa.me/917042481547?text=' + text, '_blank', 'noopener');
      return;
    }
    var btn = form.querySelector('button');
    btn.disabled = true; say('Sending…', true);
    fetch(SHEET_URL, {
      method: 'POST',
      mode: 'no-cors', // Apps Script does not send CORS headers; the request still goes through
      body: new URLSearchParams({ phone: phone, website: form.website.value })
    }).then(function () {
      say('Thank you! We will call you back soon.', true);
      form.reset();
    }).catch(function () {
      say('Could not send. Please call 070424 81547 or message us on WhatsApp.', false);
    }).finally(function () { btn.disabled = false; });
  });

  // ---- YouTube click-to-play ----
  document.querySelectorAll('[data-yt]').forEach(function (li) {
    var id = li.dataset.yt, title = li.dataset.title;
    li.innerHTML =
      '<div class="vthumb"><button type="button" aria-label="Play video: ' + title + '">' +
      '<img src="' + li.dataset.thumb + '" alt="" loading="lazy">' +
      '<span class="play" aria-hidden="true">▶</span></button></div><p class="vtitle"></p>';
    li.querySelector('.vtitle').textContent = title;
    li.querySelector('button').addEventListener('click', function () {
      // YouTube blocks embeds on file:// pages (Error 153), so open it on YouTube instead
      if (location.protocol !== 'http:' && location.protocol !== 'https:') {
        window.open('https://www.youtube.com/watch?v=' + id, '_blank', 'noopener');
        return;
      }
      li.querySelector('.vthumb').innerHTML =
        '<iframe src="https://www.youtube.com/embed/' + id + '?autoplay=1&rel=0&playsinline=1" title="' + title +
        '" referrerpolicy="strict-origin-when-cross-origin" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>';
    });
  });

  // ---- Review slider (auto-advance, dots, arrow keys) ----
  var slider = document.getElementById('slider');
  var slides = Array.prototype.slice.call(slider.querySelectorAll('.slide'));
  var dotsBox = document.getElementById('dots');
  var idx = 0, timer = null;
  slides.forEach(function (_, i) {
    var b = document.createElement('button');
    b.type = 'button'; b.setAttribute('aria-label', 'Show review ' + (i + 1));
    b.addEventListener('click', function () { go(i); restart(); });
    dotsBox.appendChild(b);
  });
  function go(n) {
    var prev = slides[idx];
    idx = (n + slides.length) % slides.length;
    prev.classList.remove('active'); prev.classList.add('out');
    setTimeout(function () { prev.classList.remove('out'); }, 600);
    slides.forEach(function (s, i) { s.setAttribute('aria-hidden', i === idx ? 'false' : 'true'); });
    slides[idx].classList.add('active');
    Array.prototype.forEach.call(dotsBox.children, function (d, i) { d.classList.toggle('on', i === idx); });
  }
  function restart() { clearInterval(timer); if (!reduce) timer = setInterval(function () { go(idx + 1); }, 5500); }
  slider.addEventListener('mouseenter', function () { clearInterval(timer); });
  slider.addEventListener('mouseleave', restart);
  slider.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowRight') { e.preventDefault(); go(idx + 1); restart(); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); go(idx - 1); restart(); }
  });
  go(0); restart();

  // ---- FAQ: one open at a time ----
  var items = document.querySelectorAll('.acc details');
  items.forEach(function (d) {
    d.addEventListener('toggle', function () {
      if (d.open) items.forEach(function (o) { if (o !== d) o.open = false; });
    });
  });
})();
