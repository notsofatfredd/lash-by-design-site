/* Lash by Design: site behaviour. External file only (the host's CSP blocks inline scripts). */
(function () {
  'use strict';
  document.documentElement.classList.remove('no-js');

  window.LBD = window.LBD || {};
  LBD.studio = function () {
    if (!LBD._studio) LBD._studio = fetch('studio.json', { cache: 'no-cache' }).then(function (r) { return r.json(); });
    return LBD._studio;
  };
  LBD.hrs = function (m) {
    var h = Math.floor(m / 60), r = m % 60;
    if (!h) return r + ' min';
    return h + (r ? '.' + (r === 30 ? '5' : String(r)) : '') + (h === 1 && !r ? ' hr' : ' hrs');
  };
  LBD.rand = function (n) { return 'R' + Number(n).toLocaleString('en-ZA'); };
  LBD.el = function (tag, attrs, kids) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (attrs[k] == null || attrs[k] === false) return;
      if (k === 'text') n.textContent = attrs[k];
      else if (k === 'html') n.innerHTML = attrs[k];
      else n.setAttribute(k, attrs[k] === true ? '' : attrs[k]);
    });
    (kids || []).forEach(function (c) { if (c) n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return n;
  };
  var ARROW = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 17L17 7M8 7h9v9"/></svg>';

  document.addEventListener('DOMContentLoaded', function () {
    var top = document.getElementById('top');
    if (top && !document.body.classList.contains('book-page')) {
      var onScroll = function () { top.classList.toggle('is-solid', window.scrollY > 30); };
      onScroll(); window.addEventListener('scroll', onScroll, { passive: true });
    }
    var burger = document.querySelector('.burger');
    if (burger) {
      burger.addEventListener('click', function () {
        var open = document.body.classList.toggle('menu-open');
        burger.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
      document.querySelectorAll('.nav a').forEach(function (a) {
        a.addEventListener('click', function () { document.body.classList.remove('menu-open'); burger.setAttribute('aria-expanded', 'false'); });
      });
    }
    var rv = document.querySelectorAll('.rv');
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (es) {
        es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
      }, { rootMargin: '0px 0px -8% 0px' });
      rv.forEach(function (n) { io.observe(n); });
    } else rv.forEach(function (n) { n.classList.add('in'); });
    setTimeout(function () { rv.forEach(function (n) { n.classList.add('in'); }); }, 4000);

    var grid = document.getElementById('set-grid');
    if (!grid) return;
    LBD.studio().then(function (s) {
      var anyPrice = false;
      s.services.forEach(function (sv, i) {
        if (sv.price != null) anyPrice = true;
        var meta = LBD.el('div', { class: 'set-meta' }, [LBD.el('b', { text: sv.price != null ? LBD.rand(sv.price) : LBD.hrs(sv.minutes) }), sv.price != null ? LBD.hrs(sv.minutes) : 'About']);
        var book = LBD.el('a', { class: 'set-book', href: 'book.html?set=' + encodeURIComponent(sv.id), 'aria-label': 'Book ' + sv.name, html: ARROW });
        var body = [LBD.el('div', { class: 'set-group', text: sv.group }), LBD.el('h3', { text: sv.name }), LBD.el('p', { text: sv.blurb }), LBD.el('div', { class: 'set-foot' }, [meta, book])];
        var card;
        if (i === 2) {
          card = LBD.el('article', { class: 'set is-feature rv' }, [
            LBD.el('img', { src: grid.getAttribute('data-feature-img'), alt: '', loading: 'lazy', width: 1067, height: 1600 }),
            LBD.el('div', { class: 'in' }, body)]);
        } else card = LBD.el('article', { class: 'set rv' }, body);
        grid.appendChild(card);
        setTimeout(function () { card.classList.add('in'); }, 80 * i + 100);
      });
      if (!anyPrice) document.getElementById('price-note').hidden = false;

      var row = document.getElementById('contact-row');
      if (s.whatsapp) row.appendChild(LBD.el('a', { href: 'https://wa.me/' + s.whatsapp.replace(/\D/g, ''), target: '_blank', rel: 'noopener', text: 'WhatsApp' }));
      if (s.phone) row.appendChild(LBD.el('a', { href: 'tel:' + s.phone.replace(/\s/g, ''), text: s.phone }));
      if (s.email) row.appendChild(LBD.el('a', { href: 'mailto:' + s.email, text: s.email }));
      if (s.instagram) {
        var ig = 'https://instagram.com/' + s.instagram.replace(/^@/, '');
        row.appendChild(LBD.el('a', { href: ig, target: '_blank', rel: 'noopener', text: '@' + s.instagram.replace(/^@/, '') }));
        var f = document.getElementById('footer-ig'); f.href = ig; f.hidden = false;
      }
      if (s.area) document.getElementById('footer-sub').textContent = 'Lash studio · ' + s.area + ' · Est. ' + s.established;
      if (s.depositRands) {
        document.getElementById('faq-deposit').hidden = false;
        document.getElementById('faq-deposit-copy').textContent = 'Yes. A ' + LBD.rand(s.depositRands) + ' deposit holds your booking and comes off the price of your set on the day.';
      }
      if (s.cancellationHours) {
        document.getElementById('faq-cancel-copy').textContent = 'Let us know at least ' + s.cancellationHours + ' hours before and we’ll move you to a new time. Late cancellations and no-shows may lose their deposit.';
      }
    }).catch(function () {});
  });
})();
