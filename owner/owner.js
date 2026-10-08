/* The Lash Bed: owner app. Live: ../api/owner.php. Preview links (no PHP): sample data held in memory only. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var STUDIO = null, DEMO = false, day = today();
  var SITE = 'https://lashbydesign.co.za';
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function today() { var d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function shift(s, n) { var p = s.split('-'), d = new Date(+p[0], p[1] - 1, +p[2] + n); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function dLabel(s, o) { var p = s.split('-'); return new Date(+p[0], p[1] - 1, +p[2]).toLocaleDateString('en-ZA', o || { weekday: 'long', day: 'numeric', month: 'long' }); }
  function first(n) { return String(n || '').split(' ')[0]; }
  function el(tag, a, kids) {
    var n = document.createElement(tag);
    Object.keys(a || {}).forEach(function (k) {
      if (a[k] == null || a[k] === false) return;
      if (k === 'text') n.textContent = a[k]; else if (k === 'on') Object.keys(a.on).forEach(function (e) { n.addEventListener(e, a.on[e]); });
      else n.setAttribute(k, a[k] === true ? '' : a[k]);
    });
    (kids || []).forEach(function (c) { if (c) n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return n;
  }
  function toast(t) { var e = $('toast'); e.textContent = t; e.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(function () { e.hidden = true; }, 2600); }
  function wa(phone, text) { return 'https://wa.me/' + String(phone).replace(/\D/g, '') + '?text=' + encodeURIComponent(text); }
  function lashMap(c) { try { return JSON.parse(c.lash_map || '{}') || {}; } catch (e) { return { notes: c.lash_map }; } }

  /* ---------- API (or the in-memory sample) ---------- */
  function call(a, params, body) {
    if (DEMO) return Promise.resolve(demo(a, params || {}, body || {}));
    var q = Object.keys(params || {}).map(function (k) { return '&' + k + '=' + encodeURIComponent(params[k]); }).join('');
    return fetch('../api/owner.php?a=' + a + q, {
      method: body ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store',
      headers: body ? { 'X-LBD': '1', 'Content-Type': 'application/json' } : { 'X-LBD': '1' }, body: body ? JSON.stringify(body) : undefined
    }).then(function (r) {
      return r.text().then(function (t) {
        var j; try { j = JSON.parse(t); } catch (e) { throw { network: true }; }
        if (r.status === 401 && a !== 'login') { showLogin(); }
        if (!r.ok || !j.ok) throw { status: r.status, msg: j.error || 'Something went wrong.' };
        return j;
      });
    });
  }

  var D = null;   // sample store
  function seed() {
    var names = [['Sample Client A', '27820000001'], ['Sample Client B', '27820000002'], ['Sample Client C', '27820000003'], ['Sample Client D', '27820000004'],
      ['Sample Client E', '27820000005'], ['Sample Client F', '27820000006'], ['Sample Client G', '27820000007']];
    var svc = function (id) { return STUDIO.services.filter(function (s) { return s.id === id; })[0] || { id: 'patch', name: 'Patch test', minutes: 15 }; };
    D = { id: 1, bookings: [], blocks: [], clients: {} };
    names.forEach(function (n, i) {
      D.clients[n[1]] = { phone: n[1], name: n[0], email: null, patch_tested_at: i === 3 ? null : shift(today(), -40 - i * 9), patch_notes: i === 1 ? 'Slight redness at 24h, cleared. Use sensitive adhesive.' : null,
        lash_map: i % 2 ? JSON.stringify({ style: 'Hybrid', curl: 'C', length: '9–12', thickness: '0.07', notes: 'Cat-eye map, longest at 12 on the outer corner.' }) : null, notes: null, created_at: shift(today(), -90) };
    });
    var add = function (d, t, id, ci, st) {
      var s = svc(id), c = D.clients[names[ci][1]], h = t.split(':'), end = new Date(2000, 0, 1, +h[0], +h[1] + s.minutes);
      D.bookings.push({ id: D.id++, ref: 'LBD-SAMPLE', service_id: s.id, service_name: s.name, minutes: s.minutes, start_at: d + ' ' + t, end_at: d + ' ' + pad(end.getHours()) + ':' + pad(end.getMinutes()),
        phone: c.phone, name: c.name, email: null, notes: null, status: st || 'booked', reminded_at: null });
    };
    add(today(), '09:00', 'volume', 0); add(today(), '11:30', 'infill', 1); add(today(), '13:00', 'patch', 3); add(today(), '14:00', 'classic', 2);
    add(shift(today(), 1), '10:00', 'lift', 4); add(shift(today(), 2), '09:30', 'classic', 3); add(shift(today(), 2), '13:00', 'hybrid', 5);
    add(shift(today(), -18), '10:00', 'hybrid', 6, 'done'); add(shift(today(), -25), '09:00', 'classic', 5, 'done'); add(shift(today(), -16), '12:00', 'volume', 4, 'done');
    add(shift(today(), -3), '10:00', 'infill', 0, 'done');
  }
  function demo(a, p, b) {
    var withClient = function (x) { var c = D.clients[x.phone] || {}; return Object.assign({}, x, { patch_tested_at: c.patch_tested_at, lash_map: c.lash_map }); };
    if (a === 'me' || a === 'login' || a === 'logout') return { ok: true };
    if (a === 'agenda') return { ok: true, bookings: D.bookings.filter(function (x) { return x.start_at.slice(0, 10) >= p.from && x.start_at.slice(0, 10) <= p.to; }).sort(function (x, y) { return x.start_at < y.start_at ? -1 : 1; }).map(withClient),
      blocks: D.blocks.filter(function (x) { return x.start_at.slice(0, 10) <= p.to && x.end_at.slice(0, 10) >= p.from; }) };
    if (a === 'status') { D.bookings.forEach(function (x) { if (x.id === b.id) { x.status = b.status; if (b.status === 'done' && x.service_id === 'patch') D.clients[x.phone].patch_tested_at = x.start_at.slice(0, 10); } }); return { ok: true }; }
    if (a === 'reminded') { D.bookings.forEach(function (x) { if (x.id === b.id) x.reminded_at = today(); }); return { ok: true }; }
    if (a === 'clients') return { ok: true, clients: Object.keys(D.clients).map(function (k) { return D.clients[k]; }).filter(function (c) { return (c.name + c.phone).toLowerCase().indexOf((p.q || '').toLowerCase()) > -1; }).map(function (c) {
      var last = D.bookings.filter(function (x) { return x.phone === c.phone && x.status === 'done'; }).map(function (x) { return x.start_at; }).sort().pop();
      return Object.assign({ last_visit: last || null }, c); }) };
    if (a === 'client' && !b.phone) return { ok: true, client: D.clients[p.phone], history: D.bookings.filter(function (x) { return x.phone === p.phone; }).sort(function (x, y) { return x.start_at < y.start_at ? 1 : -1; }) };
    if (a === 'client') { Object.assign(D.clients[b.phone], { patch_tested_at: b.patch_tested_at || null, patch_notes: b.patch_notes, lash_map: b.lash_map, notes: b.notes }); return { ok: true }; }
    if (a === 'infills') {
      var soon = (STUDIO.infillAfterDays || [14])[0], due = [];
      Object.keys(D.clients).forEach(function (k) {
        var mine = D.bookings.filter(function (x) { return x.phone === k; });
        var last = mine.filter(function (x) { return x.status === 'done' && x.service_id !== 'lift' && x.service_id !== 'patch'; }).map(function (x) { return x.start_at; }).sort().pop();
        var ahead = mine.some(function (x) { return x.start_at.slice(0, 10) >= today() && (x.status === 'booked' || x.status === 'awaiting_deposit'); });
        if (last && !ahead && last.slice(0, 10) <= shift(today(), -soon)) due.push({ phone: k, name: D.clients[k].name, last_at: last, days: Math.round((new Date(today()) - new Date(last.slice(0, 10))) / 864e5) });
      });
      return { ok: true, due: due };
    }
    if (a === 'add') { var s = STUDIO.services.filter(function (x) { return x.id === b.service; })[0] || { id: 'patch', name: 'Patch test', minutes: (STUDIO.patchTest || {}).minutes || 15 }; if (!D.clients[b.phone]) D.clients[b.phone] = { phone: b.phone, name: b.name };
      var h = b.start.slice(11).split(':'), e = new Date(2000, 0, 1, +h[0], +h[1] + s.minutes);
      D.bookings.push({ id: D.id++, ref: 'LBD-SAMPLE', service_id: s.id, service_name: s.name, minutes: s.minutes, start_at: b.start, end_at: b.start.slice(0, 11) + pad(e.getHours()) + ':' + pad(e.getMinutes()), phone: b.phone, name: b.name, notes: b.notes, status: 'booked' }); return { ok: true }; }
    if (a === 'block') { D.blocks.push({ id: D.id++, start_at: b.start, end_at: b.end, reason: b.reason }); return { ok: true }; }
    if (a === 'unblock') { D.blocks = D.blocks.filter(function (x) { return x.id !== b.id; }); return { ok: true }; }
    return { ok: false };
  }

  /* ---------- login ---------- */
  function showLogin() { $('app').hidden = true; $('login').hidden = false; }
  function showApp() {
    $('login').hidden = true; $('app').hidden = false; $('demo-flag').hidden = !DEMO;
    renderDay(); loadInfills(true);
  }

  /* ---------- diary ---------- */
  function renderDay() {
    $('day-label').textContent = day === today() ? 'Today' : day === shift(today(), 1) ? 'Tomorrow' : dLabel(day, { weekday: 'short', day: 'numeric', month: 'short' });
    var list = $('day-list'); list.innerHTML = '';
    call('agenda', { from: day, to: day }).then(function (j) {
      var live = j.bookings.filter(function (b) { return b.status !== 'cancelled' && b.status !== 'no_show'; });
      var mins = live.reduce(function (n, b) { return n + (+b.minutes); }, 0);
      var st = $('day-stats'); st.innerHTML = '';
      [[live.length, 'Bookings'], [Math.round(mins / 6) / 10 + 'h', 'In the chair'], [live.filter(function (b) { return b.service_id === 'patch'; }).length, 'Patch tests']].forEach(function (s) {
        st.appendChild(el('div', { class: 'stat' }, [el('b', { text: String(s[0]) }), el('span', { text: s[1] })]));
      });
      j.blocks.forEach(function (bl) {
        list.appendChild(el('div', { class: 'block' }, [el('span', { text: 'Blocked ' + bl.start_at.slice(11) + '–' + bl.end_at.slice(11) + (bl.reason ? ' · ' + bl.reason : '') }),
          el('button', { type: 'button', text: 'Remove', on: { click: function () { call('unblock', null, { id: bl.id }).then(renderDay); } } })]));
      });
      if (!j.bookings.length) list.appendChild(el('div', { class: 'empty' }, [el('b', { text: 'A quiet day.' }), 'Nothing booked yet.']));
      j.bookings.forEach(function (b) { list.appendChild(card(b)); });
    }).catch(function (e) { list.appendChild(el('div', { class: 'empty', text: e.msg || 'Couldn’t load the diary.' })); });
  }
  function card(b) {
    var patch = b.service_id === 'patch', tags = [];
    if (b.status === 'awaiting_deposit') tags.push(el('span', { class: 'tag warn', text: 'Deposit pending' }));
    if (b.status === 'arrived') tags.push(el('span', { class: 'tag dark', text: 'In the chair' }));
    if (b.status === 'done') tags.push(el('span', { class: 'tag ok', text: 'Done' }));
    if (b.status === 'no_show') tags.push(el('span', { class: 'tag warn', text: 'No-show' }));
    if (b.status === 'cancelled') tags.push(el('span', { class: 'tag', text: 'Cancelled' }));
    if (!patch && b.service_id !== 'lift') tags.push(b.patch_tested_at ? el('span', { class: 'tag ok', text: 'Patch tested' }) : el('span', { class: 'tag warn', text: 'No patch test on file' }));
    if (b.reminded_at) tags.push(el('span', { class: 'tag', text: 'Reminded' }));
    var m = lashMap(b); if (!patch && m.style) tags.push(el('span', { class: 'tag', text: [m.style, m.curl, m.length].filter(Boolean).join(' · ') }));

    var acts = [], set = function (s, label, cls) { acts.push(el('button', { type: 'button', class: 'b ' + (cls || 'b-soft'), text: label, on: { click: function () { status(b, s); } } })); };
    if (b.status === 'booked' || b.status === 'awaiting_deposit') {
      acts.push(el('a', { class: 'b b-wa', target: '_blank', rel: 'noopener', text: 'Remind', href: wa(b.phone, reminder(b)), on: { click: function () { call('reminded', null, { id: b.id }).then(renderDay); } } }));
      set('arrived', 'Arrived', 'b-dark'); set('no_show', 'No-show'); set('cancelled', 'Cancel');
    } else if (b.status === 'arrived') { set('done', patch ? 'Patch test done' : 'Done', 'b-dark'); }
    else if (b.status !== 'done') set('booked', 'Restore');
    return el('article', { class: 'bk s-' + b.status + (patch ? ' is-patch' : ' is-set') }, [
      el('div', { class: 'bk-time' }, [el('b', { text: b.start_at.slice(11) }), el('span', { text: b.minutes + ' min' })]),
      el('div', {}, [el('button', { type: 'button', class: 'bk-who', text: b.name, on: { click: function () { openClient(b.phone); } } }),
        el('div', { class: 'bk-what', text: b.service_name + (b.notes ? ' · ' + b.notes : '') }), el('div', { class: 'tags' }, tags)]),
      acts.length ? el('div', { class: 'acts' }, acts) : null]);
  }
  function reminder(b) {
    var when = dLabel(b.start_at.slice(0, 10), { weekday: 'long', day: 'numeric', month: 'long' }) + ' at ' + b.start_at.slice(11);
    if (b.service_id === 'patch') return 'Hi ' + first(b.name) + ', it’s Lash by Design. Just a reminder of your quick patch test on ' + when + '. It only takes ' + b.minutes + ' minutes. Reply here if you need to move it. See you soon!';
    return 'Hi ' + first(b.name) + ', it’s Lash by Design. A reminder of your ' + b.service_name + ' on ' + when + '. Please come with clean lashes: no mascara or oily cleansers. Reply here if you need to move it. See you soon!';
  }
  function status(b, s) {
    if ((s === 'cancelled' || s === 'no_show') && !confirm((s === 'cancelled' ? 'Cancel ' : 'Mark no-show for ') + b.name + '?')) return;
    call('status', null, { id: b.id, status: s }).then(function () { toast(s === 'done' && b.service_id === 'patch' ? 'Patch test saved to ' + first(b.name) + '’s file' : 'Updated'); renderDay(); if (s === 'done') loadInfills(true); })
      .catch(function (e) { toast(e.msg || 'Couldn’t update'); });
  }

  /* ---------- infills ---------- */
  function loadInfills(quiet) {
    call('infills').then(function (j) {
      $('infill-dot').hidden = !j.due.length;
      if (quiet && !$('v-infills').classList.contains('is-on')) return;
      var list = $('infill-list'); list.innerHTML = '';
      if (!j.due.length) return list.appendChild(el('div', { class: 'empty' }, [el('b', { text: 'Everyone’s booked in.' }), 'No infills overdue right now.']));
      j.due.forEach(function (c) {
        var text = 'Hi ' + first(c.name) + ', it’s Lash by Design! It’s been ' + c.days + ' days since your last appointment, so it’s the perfect time for an infill to keep your set full. Book a time here: ' + SITE + '/book.html?set=infill';
        list.appendChild(el('div', { class: 'row' }, [el('span', { class: 'av', text: c.name.charAt(0) }),
          el('div', { class: 'row-main' }, [el('b', { text: c.name }), el('span', { text: 'Last visit ' + dLabel(c.last_at.slice(0, 10), { day: 'numeric', month: 'short' }) })]),
          el('div', { class: 'days-badge' }, [String(c.days), el('small', { text: 'days' })]),
          el('a', { class: 'b b-wa', target: '_blank', rel: 'noopener', href: wa(c.phone, text), text: 'Nudge' })]));
      });
    }).catch(function () {});
  }

  /* ---------- clients ---------- */
  function loadClients() {
    var list = $('client-list');
    call('clients', { q: $('client-q').value }).then(function (j) {
      list.innerHTML = '';
      if (!j.clients.length) return list.appendChild(el('div', { class: 'empty' }, [el('b', { text: 'No clients yet.' }), 'They appear here after their first booking.']));
      j.clients.forEach(function (c) {
        list.appendChild(el('button', { type: 'button', class: 'row', on: { click: function () { openClient(c.phone); } } }, [el('span', { class: 'av', text: c.name.charAt(0) }),
          el('span', { class: 'row-main' }, [el('b', { text: c.name }), el('span', { text: '+' + c.phone + (c.last_visit ? ' · last in ' + dLabel(c.last_visit.slice(0, 10), { day: 'numeric', month: 'short' }) : '') })]),
          el('span', { class: 'tag ' + (c.patch_tested_at ? 'ok' : 'warn'), text: c.patch_tested_at ? 'Patch ✓' : 'No patch' })]));
      });
    });
  }
  function openClient(phone) {
    call('client', { phone: phone }).then(function (j) {
      var c = j.client, m = lashMap(c), body = $('sheet-body'); body.innerHTML = '';
      $('sheet-title').textContent = c.name;
      var since = c.created_at ? dLabel(c.created_at.slice(0, 10), { month: 'short', year: 'numeric' }) : '–';
      body.appendChild(el('div', { class: 'facts' }, [
        el('div', { class: 'fact' }, [el('span', { text: 'Cell' }), el('b', { text: '+' + c.phone })]),
        el('div', { class: 'fact' }, [el('span', { text: 'Client since' }), el('b', { text: since })]),
        el('div', { class: 'fact' }, [el('span', { text: 'Patch test' }), el('b', { text: c.patch_tested_at ? dLabel(c.patch_tested_at, { day: 'numeric', month: 'short', year: 'numeric' }) : 'None on file' })]),
        el('div', { class: 'fact' }, [el('span', { text: 'Visits' }), el('b', { text: String(j.history.filter(function (h) { return h.status === 'done'; }).length) })])]));
      body.appendChild(el('a', { class: 'b b-wa', target: '_blank', rel: 'noopener', href: wa(c.phone, 'Hi ' + first(c.name) + ', it’s Lash by Design. '), text: 'WhatsApp ' + first(c.name) }));
      var f = el('form', { class: 'card form' }), inp = function (label, name, val, type) { return el('label', {}, [el('span', { text: label }), el('input', { name: name, value: val || '', type: type || 'text' })]); };
      var styles = ['', 'Classic', 'Hybrid', 'Volume', 'Mega volume', 'Lift'], sel = el('select', { name: 'style' }, styles.map(function (s) { return el('option', { value: s, text: s || '–', selected: m.style === s }); }));
      f.appendChild(el('h3', { text: 'Lash map' }));
      f.appendChild(el('div', { class: 'map' }, [el('label', {}, [el('span', { text: 'Style' }), sel]), inp('Curl', 'curl', m.curl), inp('Lengths', 'length', m.length), inp('Thickness', 'thickness', m.thickness)]));
      f.appendChild(el('label', {}, [el('span', { text: 'Map notes' }), el('textarea', { name: 'map_notes', rows: 2, text: m.notes || '' })]));
      f.appendChild(el('h3', { text: 'Patch test' }));
      f.appendChild(el('div', { class: 'row2' }, [inp('Date tested', 'patch_tested_at', c.patch_tested_at, 'date'), inp('Reaction notes', 'patch_notes', c.patch_notes)]));
      f.appendChild(el('label', {}, [el('span', { text: 'Client notes' }), el('textarea', { name: 'notes', rows: 3, text: c.notes || '' })]));
      f.appendChild(el('button', { class: 'b b-dark', type: 'submit', text: 'Save' }));
      f.addEventListener('submit', function (ev) {
        ev.preventDefault(); var e = f.elements;
        var map = { style: e.style.value, curl: e.curl.value, length: e.length.value, thickness: e.thickness.value, notes: e.map_notes.value };
        call('client', null, { phone: c.phone, patch_tested_at: e.patch_tested_at.value, patch_notes: e.patch_notes.value, lash_map: JSON.stringify(map), notes: e.notes.value })
          .then(function () { toast('Saved'); closeSheet(); renderDay(); }).catch(function (er) { toast(er.msg || 'Couldn’t save'); });
      });
      body.appendChild(f);
      body.appendChild(el('h3', { text: 'History' }));
      body.appendChild(el('div', { class: 'hist' }, j.history.map(function (h) {
        return el('div', {}, [el('span', { text: dLabel(h.start_at.slice(0, 10), { day: 'numeric', month: 'short', year: '2-digit' }) + ' · ' + h.service_name }), el('em', { text: h.status.replace('_', '-') })]);
      })));
      $('sheet-bg').hidden = false; $('sheet').hidden = false; $('sheet-x').focus();
    }).catch(function (e) { toast(e.msg || 'Couldn’t open client'); });
  }
  function closeSheet() { $('sheet').hidden = true; $('sheet-bg').hidden = true; }

  /* ---------- start ---------- */
  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('.tabs button').forEach(function (t) {
      t.addEventListener('click', function () {
        document.querySelectorAll('.tabs button').forEach(function (x) { x.classList.toggle('is-on', x === t); });
        document.querySelectorAll('.view').forEach(function (v) { v.classList.toggle('is-on', v.id === t.getAttribute('data-view')); });
        var v = t.getAttribute('data-view');
        if (v === 'v-infills') loadInfills(); if (v === 'v-clients') loadClients(); if (v === 'v-day') renderDay();
        window.scrollTo(0, 0);
      });
    });
    $('day-prev').addEventListener('click', function () { day = shift(day, -1); renderDay(); });
    $('day-next').addEventListener('click', function () { day = shift(day, 1); renderDay(); });
    $('day-label').addEventListener('click', function () { day = today(); renderDay(); });
    $('client-q').addEventListener('input', function () { clearTimeout(loadClients.t); loadClients.t = setTimeout(loadClients, 200); });
    $('sheet-x').addEventListener('click', closeSheet); $('sheet-bg').addEventListener('click', closeSheet);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeSheet(); });
    $('logout').addEventListener('click', function () { call('logout', null, {}).finally(function () { DEMO = false; showLogin(); }); });

    $('login-form').addEventListener('submit', function (ev) {
      ev.preventDefault();
      call('login', null, { password: ev.target.elements.password.value }).then(function () { ev.target.reset(); showApp(); })
        .catch(function (e) { var er = $('login-err'); er.textContent = e.network ? 'The studio system isn’t reachable from here.' : e.msg; er.hidden = false; });
    });
    $('demo-btn').addEventListener('click', function () { DEMO = true; seed(); showApp(); });

    $('add-form').addEventListener('submit', function (ev) {
      ev.preventDefault(); var e = ev.target.elements;
      call('add', null, { service: e.service.value, start: e.day.value + ' ' + e.time.value, name: e.name.value, phone: e.phone.value, notes: e.notes.value })
        .then(function () { toast('Booking added'); day = e.day.value; ev.target.reset(); document.querySelector('[data-view="v-day"]').click(); })
        .catch(function (er) { toast(er.msg || 'Couldn’t add'); });
    });
    $('block-form').addEventListener('submit', function (ev) {
      ev.preventDefault(); var e = ev.target.elements;
      call('block', null, { start: e.start.value.replace('T', ' '), end: e.end.value.replace('T', ' '), reason: e.reason.value })
        .then(function () { toast('Time blocked'); day = e.start.value.slice(0, 10); ev.target.reset(); document.querySelector('[data-view="v-day"]').click(); })
        .catch(function (er) { toast(er.msg || 'Couldn’t block'); });
    });

    fetch('../studio.json', { cache: 'no-cache' }).then(function (r) { return r.json(); }).then(function (s) {
      STUDIO = s;
      var sel = $('add-service');
      s.services.concat([{ id: 'patch', name: 'Patch test' }]).forEach(function (sv) { sel.appendChild(el('option', { value: sv.id, text: sv.name })); });
      return call('me');
    }).then(showApp).catch(function (e) {
      showLogin();
      if (e && e.network) { $('demo-btn').hidden = false; $('demo-note').hidden = false; }
    });
  });
})();
