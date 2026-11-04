// Slide page: two pages on one screen. Swipe (or use the edge tabs) between the map
// and the full list of stockists.
(function () {
  'use strict';
  var map = window.WIPMAP;
  var body = document.body;
  var stage = document.querySelector('.stage');
  var track = document.querySelector('.track');
  var listPane = document.getElementById('stockists');
  var mapPane = document.querySelector('.pane-map');
  var listEl = document.getElementById('stock-list');
  var empty = document.getElementById('stock-empty');
  var filter = document.getElementById('filter');
  var toList = document.querySelector('.to-list');
  var toMap = document.querySelector('.to-map');

  function esc(t) {
    return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
  }

  // Build the list, grouped by state, in columns that read top to bottom and scroll down
  var cols = document.createElement('div');
  cols.className = 'stock-cols';
  listEl.appendChild(cols);
  var groups = {};
  map.stores.forEach(function (s) { (groups[s.s] = groups[s.s] || []).push(s); });
  Object.keys(groups)
    .sort(function (a, b) { return map.stateNames[a].localeCompare(map.stateNames[b]); })
    .forEach(function (st) {
      var list = groups[st].sort(function (a, b) { return a.c.localeCompare(b.c) || a.a.localeCompare(b.a); });
      var n = list.reduce(function (t, s) { return t + s.copies; }, 0);
      var div = document.createElement('div');
      div.className = 'stock-state';
      div.innerHTML = '<h3>' + map.stateNames[st] + '<span>' + n + '</span></h3><ul>' +
        list.map(function (s) {
          var key = (s.c + ' ' + s.s + ' ' + map.stateNames[st] + ' ' + s.z + ' ' + s.a).toLowerCase();
          return '<li data-key="' + esc(key) + '"><button type="button" data-id="' + s.id + '">' +
            esc(s.c) + '<span>' + esc(s.a) + '</span></button></li>';
        }).join('') + '</ul>';
      cols.appendChild(div);
    });

  filter.addEventListener('input', function () {
    var q = filter.value.trim().toLowerCase();
    var shown = 0;
    listEl.querySelectorAll('.stock-state').forEach(function (g) {
      var any = false;
      g.querySelectorAll('li').forEach(function (li) {
        var hit = !q || li.dataset.key.indexOf(q) !== -1;
        li.hidden = !hit;
        if (hit) { any = true; shown++; }
      });
      g.hidden = !any;
    });
    empty.hidden = shown > 0;
  });

  // Moving between the two pages
  function listing() { return body.classList.contains('listing'); }
  function go(where) {
    var to = where === 'list';
    track.style.transform = '';
    body.classList.toggle('listing', to);
    listPane.inert = !to;
    mapPane.inert = to;
    toList.tabIndex = to ? -1 : 0;
    toMap.tabIndex = to ? 0 : -1;
    if (to) setTimeout(function () { filter.focus({ preventScroll: true }); }, 700);
  }
  toList.addEventListener('click', function () { go('list'); });
  document.querySelectorAll('.map-all').forEach(function (b) { b.addEventListener('click', function () { go('list'); }); });

  // Fade the list's top and bottom only where there is more to scroll to
  function edges() {
    var y = listEl.scrollTop, max = listEl.scrollHeight - listEl.clientHeight;
    listEl.classList.toggle('more-up', y > 2);
    listEl.classList.toggle('more-down', y < max - 2);
  }
  listEl.addEventListener('scroll', edges, { passive: true });
  window.addEventListener('resize', edges);
  filter.addEventListener('input', function () { setTimeout(edges, 0); });
  edges();
  toMap.addEventListener('click', function () { go('map'); });
  document.addEventListener('keydown', function (e) {
    if (e.target.matches('input')) { if (e.key === 'Escape' && listing()) go('map'); return; }
    if (e.key === 'Escape' && listing()) go('map');
    if (e.key === 'ArrowRight' && !listing() && e.altKey) go('list');
    if (e.key === 'ArrowLeft' && listing() && e.altKey) go('map');
  });

  // Drag to swipe. The page follows your finger, then settles either way.
  // Map panning wins inside the map, so swipes start anywhere else.
  var start = null;
  stage.addEventListener('pointerdown', function (e) {
    if (e.button !== 0 || e.target.closest('#map, input, button, a')) return;
    start = { x: e.clientX, y: e.clientY, id: e.pointerId, moved: false };
  });
  stage.addEventListener('pointermove', function (e) {
    if (!start || e.pointerId !== start.id) return;
    var dx = e.clientX - start.x, dy = e.clientY - start.y;
    if (!start.moved) {
      if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(dy)) return;
      start.moved = true;
      track.classList.add('dragging');
      stage.setPointerCapture(e.pointerId);
    }
    var w = stage.clientWidth;
    var base = listing() ? -w : 0;
    var x = Math.max(-w, Math.min(0, base + dx));
    track.style.transform = 'translateX(' + x + 'px)';
  });
  function endDrag(e) {
    if (!start || e.pointerId !== start.id) return;
    var dx = e.clientX - start.x, moved = start.moved;
    start = null;
    track.classList.remove('dragging');
    if (!moved) return;
    var flick = stage.clientWidth * 0.18;
    if (!listing() && dx < -flick) go('list');
    else if (listing() && dx > flick) go('map');
    else track.style.transform = '';
  }
  stage.addEventListener('pointerup', endDrag);
  stage.addEventListener('pointercancel', endDrag);

  // Two-finger sideways swipe on a trackpad
  var wheelX = 0, wheelTimer;
  stage.addEventListener('wheel', function (e) {
    if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
    if (e.target.closest('.map-frame')) return; // sideways on the map pans it
    wheelX += e.deltaX;
    clearTimeout(wheelTimer);
    wheelTimer = setTimeout(function () { wheelX = 0; }, 180);
    if (wheelX > 90 && !listing()) { wheelX = 0; go('list'); }
    else if (wheelX < -90 && listing()) { wheelX = 0; go('map'); }
  }, { passive: true });

  // Pick a store: swipe back and show it on the map
  listEl.addEventListener('click', function (e) {
    var b = e.target.closest('button[data-id]');
    if (!b) return;
    go('map');
    setTimeout(function () { map.select(+b.dataset.id); }, 650);
  });
})();
