/* Lash by Design: booking flow. Talks to api/*.php on the live host; anywhere else (e.g. a preview link) it runs in preview mode with sample times and saves nothing. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var S = { studio: null, live: false, set: null, visit: null, day: null, time: null, pday: null, ptime: null };
  var ORDER = ['set', 'visit', 'when', 'patch', 'details'];
  var pad = function (n) { return (n < 10 ? '0' : '') + n; };
  var iso = function (d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  var parse = function (s) { var p = s.split('-'); return new Date(+p[0], p[1] - 1, +p[2]); };
  var at = function (day, time) { var d = parse(day), t = time.split(':'); d.setHours(+t[0], +t[1], 0, 0); return d; };
  var fmtDay = function (s, opts) { return parse(s).toLocaleDateString('en-ZA', opts || { weekday: 'short', day: 'numeric', month: 'short' }); };
  var nice = function (day, time) { return fmtDay(day, { weekday: 'long', day: 'numeric', month: 'long' }) + ', ' + time; };
  var needsPatch = function () { return S.visit === 'new' && S.set && !S.set.noPatchTest; };
  var patchSv = function () { return { id: 'patch', name: 'Patch test', minutes: (S.studio.patchTest || {}).minutes || 15 }; };

  /* ---------- availability (API, or computed from studio.json in preview) ---------- */
  function previewTimes(minutes, day) {
    var s = S.studio, key = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][parse(day).getDay()], h = s.hours[key];
    if (!h) return [];
    var out = [], open = at(day, h[0]), close = at(day, h[1]), earliest = Date.now() + 3600e3 * (s.minNoticeHours || 12);
    for (var t = open.getTime(); t + minutes * 6e4 <= close.getTime(); t += (s.slotStepMinutes || 30) * 6e4) {
      if (t >= earliest) { var d = new Date(t); out.push(pad(d.getHours()) + ':' + pad(d.getMinutes())); }
    }
    return out;
  }
  function getDays(sv) {
    if (S.live) return api('api/slots.php?days=1&service=' + sv.id).then(function (j) { return j.days; });
    var out = [], d = new Date(); d.setHours(0, 0, 0, 0);
    for (var i = 0; i <= (S.studio.bookAheadDays || 42); i++) {
      var day = iso(d); if (previewTimes(sv.minutes, day).length) out.push(day); d.setDate(d.getDate() + 1);
    }
    return Promise.resolve(out);
  }
  function getTimes(sv, day) {
    if (S.live) return api('api/slots.php?service=' + sv.id + '&date=' + day).then(function (j) { return j.times; });
    return Promise.resolve(previewTimes(sv.minutes, day));
  }
  function api(url, body) {
    return fetch(url, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : { cache: 'no-store' })
      .then(function (r) {
        return r.text().then(function (t) {
          var j; try { j = JSON.parse(t); } catch (e) { throw { network: true }; }
          if (!r.ok || !j.ok) throw { status: r.status, msg: j.error || 'Something went wrong.' };
          return j;
        });
      });
  }

  /* ---------- steps ---------- */
  function step(name) { return document.querySelector('.bk-step[data-step="' + name + '"]'); }
  function open(name) {
    ORDER.forEach(function (n) { step(n).classList.toggle('is-open', n === name); });
    var s = step(name);
    if (s.getBoundingClientRect().top < 70 || s.getBoundingClientRect().top > innerHeight * .6) {
      window.scrollTo({ top: s.getBoundingClientRect().top + scrollY - 96, behavior: 'smooth' });
    }
  }
  function done(name, text) { step(name).classList.add('is-done'); $('ch-' + name).textContent = text; }
  function undone(name) { step(name).classList.remove('is-done'); }
  function next(after) {
    var i = ORDER.indexOf(after) + 1;
    while (ORDER[i] === 'patch' && !needsPatch()) i++;
    open(ORDER[i]);
  }

  function renderSets() {
    var box = $('bk-sets'), anyPrice = false;
    S.studio.services.forEach(function (sv) {
      if (sv.price != null) anyPrice = true;
      var b = LBD.el('button', { type: 'button', class: 'bk-set', role: 'radio', 'aria-checked': 'false', 'data-id': sv.id }, [
        LBD.el('small', { text: sv.group }), LBD.el('b', { text: sv.name }),
        LBD.el('span', { text: (sv.price != null ? LBD.rand(sv.price) + ' · ' : '') + 'About ' + LBD.hrs(sv.minutes) })]);
      b.addEventListener('click', function () { pickSet(sv); });
      box.appendChild(b);
    });
    $('bk-price-note').hidden = anyPrice;
  }
  function pickSet(sv) {
    var changed = S.set !== sv; S.set = sv;
    document.querySelectorAll('.bk-set').forEach(function (b) { b.setAttribute('aria-checked', b.getAttribute('data-id') === sv.id ? 'true' : 'false'); });
    done('set', sv.name + ' · about ' + LBD.hrs(sv.minutes));
    if (changed) { S.day = S.time = S.pday = S.ptime = null; undone('when'); undone('patch'); }
    if (sv.infill && !S.visit) pickVisit('back', true);
    summary();
    if (S.visit) { loadDays(); next('visit'); } else next('set');
  }
  function pickVisit(v, quiet) {
    S.visit = v;
    document.querySelectorAll('[data-visit]').forEach(function (b) { b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', b.getAttribute('data-visit') === v ? 'true' : 'false'); });
    done('visit', v === 'new' ? 'First visit, with a patch test' : 'I’ve been before');
    step('patch').hidden = !needsPatch();
    $('n-details').textContent = needsPatch() ? '5' : '4';
    summary();
    if (quiet) return;
    if (!S.day) { loadDays(); next('visit'); } else if (needsPatch() && !S.ptime) { loadPatchDays(); open('patch'); } else open('details');
  }

  function dayButtons(box, days, picked, onPick) {
    box.innerHTML = '';
    if (!days.length) { box.appendChild(LBD.el('p', { class: 'bk-empty', text: 'No openings online right now. Please message the studio.' })); return; }
    days.forEach(function (d) {
      var b = LBD.el('button', { type: 'button', class: 'bk-day', 'aria-pressed': d === picked ? 'true' : 'false', 'aria-label': fmtDay(d, { weekday: 'long', day: 'numeric', month: 'long' }) }, [
        LBD.el('small', { text: fmtDay(d, { weekday: 'short' }) }), LBD.el('b', { text: String(parse(d).getDate()) }), LBD.el('em', { text: fmtDay(d, { month: 'short' }) })]);
      b.addEventListener('click', function () { box.querySelectorAll('.bk-day').forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); }); onPick(d); });
      box.appendChild(b);
    });
  }
  function timeButtons(box, times, picked, onPick) {
    box.innerHTML = '';
    if (!times.length) { box.appendChild(LBD.el('p', { class: 'bk-empty', text: 'That day just filled up. Try another day.' })); return; }
    times.forEach(function (t) {
      var b = LBD.el('button', { type: 'button', class: 'bk-time', 'aria-pressed': t === picked ? 'true' : 'false', text: t });
      b.addEventListener('click', function () { onPick(t); });
      box.appendChild(b);
    });
  }
  function loading(box) { box.innerHTML = ''; box.appendChild(LBD.el('p', { class: 'bk-empty', text: 'Finding openings…' })); }

  function loadDays() {
    var sv = S.set; loading($('bk-days')); $('bk-times').innerHTML = '';
    getDays(sv).then(function (days) {
      if (sv !== S.set) return;
      dayButtons($('bk-days'), days, S.day, function (d) { S.day = d; S.time = null; loadTimes(); });
      if (S.day && days.indexOf(S.day) > -1) loadTimes();
    }).catch(apiDown);
  }
  function loadTimes() {
    var sv = S.set, day = S.day; loading($('bk-times'));
    getTimes(sv, day).then(function (times) {
      if (sv !== S.set || day !== S.day) return;
      timeButtons($('bk-times'), times, S.time, function (t) {
        S.time = t; done('when', nice(S.day, t)); summary();
        if (S.ptime && at(S.pday, S.ptime) > patchLatest()) { S.pday = S.ptime = null; undone('patch'); summary(); }
        if (needsPatch() && !S.ptime) { loadPatchDays(); open('patch'); } else open('details');
      });
    }).catch(apiDown);
  }
  function patchLatest() { return new Date(at(S.day, S.time).getTime() - 3600e3 * ((S.studio.patchTest || {}).hoursBefore || 24)); }
  function loadPatchDays() {
    var latest = patchLatest(); loading($('bk-pdays')); $('bk-ptimes').innerHTML = '';
    getDays(patchSv()).then(function (days) {
      days = days.filter(function (d) { return parse(d) <= latest; });
      dayButtons($('bk-pdays'), days, S.pday, function (d) { S.pday = d; S.ptime = null; loadPatchTimes(); });
      if (!days.length) $('bk-pdays').firstChild.textContent = 'There’s no patch test opening before that day. Please pick a later day for your set.';
    }).catch(apiDown);
  }
  function loadPatchTimes() {
    var day = S.pday, latest = patchLatest(); loading($('bk-ptimes'));
    getTimes(patchSv(), day).then(function (times) {
      if (day !== S.pday) return;
      times = times.filter(function (t) { return at(day, t) <= latest; });
      timeButtons($('bk-ptimes'), times, S.ptime, function (t) { S.ptime = t; done('patch', nice(S.pday, t)); summary(); open('details'); });
    }).catch(apiDown);
  }
  function apiDown(e) {
    if (e && e.network && S.live) { S.live = false; $('bk-preview').hidden = false; loadDays(); return; }
    banner(e && e.msg ? e.msg : 'We couldn’t load times just now. Please try again.');
  }
  function banner(t) { var b = $('bk-banner'); b.textContent = t; b.hidden = !t; }

  function summary() {
    var s = S.studio;
    $('sum-set').textContent = S.set ? S.set.name : 'Not chosen yet';
    $('sum-when').textContent = S.time ? fmtDay(S.day) + ', ' + S.time : 'Not chosen yet';
    $('sum-patch-row').hidden = !needsPatch();
    $('sum-patch').textContent = S.ptime ? fmtDay(S.pday) + ', ' + S.ptime : 'Not chosen yet';
    $('sum-price-row').hidden = !S.set;
    if (S.set) $('sum-price').textContent = S.set.price != null ? LBD.rand(S.set.price) : 'Confirmed when you book';
    $('sum-dep-row').hidden = !s.depositRands;
    if (s.depositRands) $('sum-dep').textContent = LBD.rand(s.depositRands) + ' to hold your time';
  }

  /* ---------- submit ---------- */
  function submit(ev) {
    ev.preventDefault();
    var f = $('bk-form'), err = $('bk-error'); err.hidden = true;
    if (!S.set) return open('set');
    if (!S.visit) return open('visit');
    if (!S.time) return open('when');
    if (needsPatch() && !S.ptime) return open('patch');
    var bad = null;
    [['name', function (v) { return v.trim().length >= 2; }], ['phone', function (v) { return v.replace(/\D/g, '').length >= 9; }],
     ['email', function (v) { return !v || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v); }]].forEach(function (c) {
      var inp = f.elements[c[0]], ok = c[1](inp.value);
      inp.setAttribute('aria-invalid', ok ? 'false' : 'true'); if (!ok && !bad) bad = inp;
    });
    if (bad) { bad.focus(); return showErr('Please check the highlighted details.'); }
    if (!f.elements.consent.checked) return showErr('Please tick the booking terms to continue.');

    var data = {
      service: S.set.id, start: S.day + ' ' + S.time, patchStart: needsPatch() ? S.pday + ' ' + S.ptime : '',
      name: f.elements.name.value, phone: f.elements.phone.value, email: f.elements.email.value,
      notes: f.elements.notes.value, consent: true, website: f.elements.website.value
    };
    if (!S.live) return finish({ ref: 'PREVIEW', preview: true });
    var btn = $('bk-submit'); btn.disabled = true; btn.textContent = 'Booking…';
    api('api/book.php', data).then(function (j) {
      if (j.redirect) { btn.textContent = 'Taking you to Yoco…'; location.href = j.redirect; return; }
      finish(j);
    }).catch(function (e) {
      btn.disabled = false; btn.textContent = 'Confirm booking';
      if (e.status === 422 && /patch test/i.test(e.msg) && S.visit !== 'new') {
        pickVisit('new', true); loadPatchDays(); open('patch'); return banner('We don’t have a patch test on record for that number, so please pick a quick patch test time first.');
      }
      if (e.status === 409) { S.time = null; undone('when'); if (/patch/i.test(e.msg)) { S.ptime = null; undone('patch'); } summary(); loadDays(); open('when'); return banner(e.msg); }
      showErr(e.network ? 'We couldn’t reach the booking system. Please try again, or message the studio.' : e.msg);
    });
  }
  function showErr(t) { var e = $('bk-error'); e.textContent = t; e.hidden = false; }

  function finish(j) {
    var s = S.studio;
    $('bk-form').hidden = true; $('bk-preview').hidden = !j.preview; banner('');
    var list = $('done-list'), row = function (k, v) { list.appendChild(LBD.el('div', {}, [LBD.el('dt', { text: k }), LBD.el('dd', { text: v })])); };
    row('Set', S.set.name); row('When', nice(S.day, S.time));
    if (needsPatch()) row('Patch test', nice(S.pday, S.ptime));
    row('Reference', j.ref);
    $('done-copy').textContent = j.preview ? 'This was a preview, so nothing was saved. On the live site this books your time and the studio gets your details straight away.'
      : 'Your time is booked and the studio has your details. Keep your reference handy in case you need to move your appointment.';
    var cta = $('done-cta');
    cta.appendChild(LBD.el('a', { class: 'btn btn-solid', href: ics(j.ref), download: 'lash-by-design-' + S.day + '.ics', text: 'Add to calendar' }));
    if (s.whatsapp) cta.appendChild(LBD.el('a', { class: 'btn btn-line', target: '_blank', rel: 'noopener', text: 'WhatsApp the studio',
      href: 'https://wa.me/' + s.whatsapp.replace(/\D/g, '') + '?text=' + encodeURIComponent('Hi! I just booked ' + S.set.name + ' for ' + nice(S.day, S.time) + ' (ref ' + j.ref + ').') }));
    cta.appendChild(LBD.el('a', { class: 'btn btn-line', href: './', text: 'Back to the site' }));
    $('bk-done').hidden = false; $('bk-done').focus();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function ics(ref) {
    var stamp = function (d) { return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + 'T' + pad(d.getHours()) + pad(d.getMinutes()) + '00'; };
    var ev = function (name, day, time, min) {
      var a = at(day, time);
      return ['BEGIN:VEVENT', 'UID:' + ref + '-' + stamp(a) + '@lashbydesign.co.za', 'DTSTAMP:' + stamp(new Date()), 'DTSTART;TZID=Africa/Johannesburg:' + stamp(a),
        'DTEND;TZID=Africa/Johannesburg:' + stamp(new Date(a.getTime() + min * 6e4)), 'SUMMARY:' + name + ' at Lash by Design',
        S.studio.address ? 'LOCATION:' + S.studio.address.replace(/,/g, '\\,') : '', 'DESCRIPTION:Booking ref ' + ref, 'END:VEVENT'].filter(Boolean);
    };
    var lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Lash by Design//Booking//EN'].concat(ev(S.set.name, S.day, S.time, S.set.minutes));
    if (needsPatch()) lines = lines.concat(ev('Patch test', S.pday, S.ptime, patchSv().minutes));
    lines.push('END:VCALENDAR');
    return URL.createObjectURL(new Blob([lines.join('\r\n')], { type: 'text/calendar' }));
  }

  /* ---------- start ---------- */
  document.addEventListener('DOMContentLoaded', function () {
    var q = new URLSearchParams(location.search);
    LBD.studio().then(function (s) {
      S.studio = s;
      if (s.cancellationHours) $('bk-terms').textContent = 'I agree to the booking terms: please give us at least ' + s.cancellationHours + ' hours’ notice to move or cancel.';
      var pt = s.patchTest || {};
      $('bk-patch-copy').textContent = 'A ' + (pt.minutes || 15) + '-minute patch test, at least ' + (pt.hoursBefore || 24) + ' hours before your set, so we know the adhesive suits you.';
      renderSets(); summary();
      document.querySelectorAll('[data-visit]').forEach(function (b) { b.addEventListener('click', function () { pickVisit(b.getAttribute('data-visit')); }); });
      document.querySelectorAll('[data-edit]').forEach(function (b) {
        b.addEventListener('click', function () {
          var n = b.getAttribute('data-edit'); open(n);
          if (n === 'when') loadDays(); if (n === 'patch') loadPatchDays();
        });
      });
      $('bk-form').addEventListener('submit', submit);
      if (q.get('paid')) {
        $('bk-form').hidden = true; $('done-copy').textContent = 'Your deposit came through and your time is booked. Your reference is ' + q.get('paid') + '.';
        $('bk-done').hidden = false; return;
      }
      if (q.get('unpaid')) banner('Your deposit didn’t go through, so that time wasn’t held and nothing was charged. Please choose a time again.');
      return api('api/slots.php?days=1&service=patch').then(function () { S.live = true; }, function (e) { S.live = !e.network; })
        .then(function () {
          $('bk-preview').hidden = S.live;
          var pre = q.get('set') && s.services.filter(function (x) { return x.id === q.get('set'); })[0];
          if (pre) pickSet(pre);
        });
    }).catch(function () { banner('The booking page couldn’t load. Please refresh, or message the studio.'); });
  });
})();
