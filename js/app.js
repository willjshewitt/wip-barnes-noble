(function () {
  'use strict';

  var W = 975, H = 610;
  var STATE_NAMES = {
    AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut',
    DE: 'Delaware', DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois',
    IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
    MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana',
    NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York',
    NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania',
    RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah',
    VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming'
  };
  // Bounding boxes [west, south, east, north]
  var REGIONS = {
    bay: [-123.1, 37.1, -121.5, 38.35],
    dc: [-77.6, 38.6, -76.7, 39.25],
    sea: [-122.5, 47.3, -121.95, 47.9],
    aus: [-98.1, 30.0, -97.4, 30.75]
  };

  var stores = window.STORES.map(function (s, i) {
    s.id = i;
    s.copies = s.n || 1; // number of B&N shops at this address
    return s;
  });
  var TOTAL = stores.reduce(function (n, s) { return n + s.copies; }, 0);

  var $ = function (s) { return document.querySelector(s); };
  var svg = d3.select('#map');
  var frame = document.querySelector('.map-frame');
  var projection = d3.geoAlbersUsa();
  var path = d3.geoPath(projection);
  var topo = window.US_TOPO;
  var statesGeo = topojson.feature(topo, topo.objects.states).features;
  var nationGeo = topojson.feature(topo, topo.objects.nation);

  var mapped;
  var k = 1; // current zoom scale
  var g = svg.append('g');
  var statePaths = g.append('g').selectAll('path').data(statesGeo).join('path').attr('class', 'state');
  var nationPath = g.append('path').attr('class', 'nation');
  var meLayer = g.append('g');
  var labelLayer;
  project();
  mapped = stores.filter(function (s) { return s.x != null; });
  var dots = g.append('g').selectAll('circle')
    .data(mapped.slice().sort(function (a, b) { return b.lat - a.lat; }))
    .join('circle')
    .attr('class', 'store')
    .attr('cx', function (d) { return d.x; })
    .attr('cy', function (d) { return d.y; })
    .attr('r', dotR())
    .attr('tabindex', 0)
    .attr('role', 'button')
    .attr('aria-label', function (d) { return 'Barnes & Noble, ' + d.a + ', ' + d.c + ', ' + d.s; });
  var clusterLayer = g.append('g').attr('class', 'clusters');
  labelLayer = g.append('g').attr('class', 'labels').attr('aria-hidden', 'true');
  var resultIds = {}; // stores in the current result list are never grouped

  // Group stores that sit close together on screen into one counted circle.
  // Recomputed as you zoom, so groups split apart as you get closer.
  var CLUSTER_PX = 34; // grouping radius on screen, in px
  var MAXK = 60;
  // Groups only change at fixed zoom steps (every half doubling), not on every frame,
  // so circles hold still while you zoom and split cleanly as you pass each step
  function zoomLevel(kk) { return Math.floor(Math.log2(kk) * 2 + 1e-6); }
  var groupLevel = null;
  function cluster() {
    groupLevel = zoomLevel(k);
    var kq = Math.pow(2, groupLevel / 2);
    var r = CLUSTER_PX / kq, cells = {}, groups = [], taken = {};
    var pts = mapped.filter(function (s) { return !resultIds[s.id]; });
    pts.forEach(function (s) {
      var key = Math.floor(s.x / r) + ',' + Math.floor(s.y / r);
      (cells[key] = cells[key] || []).push(s);
    });
    pts.forEach(function (s) {
      if (taken[s.id]) return;
      var cx = Math.floor(s.x / r), cy = Math.floor(s.y / r), members = [];
      for (var i = -1; i <= 1; i++) for (var j = -1; j <= 1; j++) {
        (cells[(cx + i) + ',' + (cy + j)] || []).forEach(function (o) {
          if (!taken[o.id] && Math.hypot(o.x - s.x, o.y - s.y) <= r) members.push(o);
        });
      }
      if (members.length < 2) return;
      members.forEach(function (o) { taken[o.id] = true; });
      groups.push({
        id: members[0].id,
        members: members,
        n: members.reduce(function (t, o) { return t + o.copies; }, 0),
        x: d3.mean(members, function (o) { return o.x; }),
        y: d3.mean(members, function (o) { return o.y; })
      });
    });
    // Merge groups whose circles would overlap, so the map reads as a few clear clusters
    var f0 = Math.max(0.7, Math.min(1, W / 900));
    function rad(gp) { return (5 + 2.3 * Math.sqrt(gp.n)) * f0 / kq; }
    for (var pass = 0; pass < 4; pass++) {
      var merged = false;
      for (var a = 0; a < groups.length; a++) for (var b = a + 1; b < groups.length; b++) {
        var A = groups[a], B = groups[b];
        if (!A || !B) continue;
        if (Math.hypot(A.x - B.x, A.y - B.y) < (rad(A) + rad(B)) * 1.1) {
          var m = A.members.concat(B.members);
          groups[a] = { id: A.id, members: m, n: A.n + B.n,
            x: d3.mean(m, function (o) { return o.x; }), y: d3.mean(m, function (o) { return o.y; }) };
          groups[b] = null; merged = true;
        }
      }
      groups = groups.filter(Boolean);
      if (!merged) break;
    }
    dots.attr('display', function (d) { return taken[d.id] ? 'none' : null; });
    var c = clusterLayer.selectAll('g.cluster').data(groups, function (d) { return d.id + ':' + d.members.length; })
      .join(function (enter) {
        var e = enter.append('g').attr('class', 'cluster').attr('tabindex', 0).attr('role', 'button');
        e.append('circle');
        e.append('text').attr('dy', '0.35em');
        return e;
      });
    c.attr('transform', function (d) { return 'translate(' + d.x + ',' + d.y + ') scale(' + 1 / k + ')'; })
      .attr('aria-label', function (d) { return d.n + ' stores around ' + d.members[0].c + ', ' + d.members[0].s; });
    var f = Math.max(0.7, Math.min(1, W / 900));
    c.select('circle').attr('r', function (d) { return (5 + 2.3 * Math.sqrt(d.n)) * f; });
    c.select('text').text(function (d) { return d.n; })
      .style('font-size', function (d) { return Math.max(10, (5 + 2.3 * Math.sqrt(d.n)) * f * 0.62) + 'px'; });
  }
  var clusterQueued = false;
  function queueCluster() {
    if (clusterQueued) return;
    clusterQueued = true;
    requestAnimationFrame(function () { clusterQueued = false; cluster(); });
  }
  clusterLayer
    .on('mouseover focusin', function (e) {
      var d = d3.select(e.target.closest('g.cluster')).datum();
      if (!d) return;
      var towns = Array.from(new Set(d.members.map(function (o) { return o.c; })));
      showTipAt(d.x, d.y, '<b>' + d.n + ' stores</b>' + esc(towns.slice(0, 3).join(', ') + (towns.length > 3 ? ' and more' : '')));
    })
    .on('mouseout focusout', hideTip)
    .on('click keydown', function (e) {
      if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return;
      var node = e.target.closest('g.cluster');
      if (!node) return;
      e.preventDefault();
      var d = d3.select(node).datum();
      var pts = d.members.map(function (o) { return [o.x, o.y]; });
      var spread = d3.max(pts, function (p) { return Math.hypot(p[0] - d.x, p[1] - d.y); });
      // Stores sharing a spot can't be split by zooming: list them instead
      if (spread * k < 2 || k >= 13) { showNear(d.members[0], d.members[0].c + ', ' + d.members[0].s); return; }
      lastView = null;
      zoomTo(pts, { minSpan: 6, maxK: 14 });
    });

  // Fit the map to its box, edge to edge, and refit when the box changes size
  function project() {
    W = Math.max(200, frame.clientWidth);
    H = Math.max(160, frame.clientHeight);
    var pad = Math.round(Math.min(W, H) * 0.03);
    // A page can reserve room around the country with data-fit="x0 y0 x1 y1" (fractions)
    var f = (frame.dataset.fit || '').split(/\s+/).map(Number);
    if (f.length === 4 && f.every(isFinite)) {
      projection.fitExtent([[W * f[0], H * f[1]], [W * f[2], H * f[3]]], nationGeo);
    } else {
      projection.fitExtent([[pad, pad], [W - pad, H - pad]], nationGeo);
    }
    svg.attr('viewBox', [0, 0, W, H]);
    stores.forEach(function (s) {
      var p = projection([s.lng, s.lat]);
      s.x = p ? p[0] : null;
      s.y = p ? p[1] : null;
    });
    statePaths.attr('d', path);
    nationPath.attr('d', path(nationGeo));
  }
  function refit() {
    // Remember what the reader is looking at, so a resize doesn't throw them back out
    // Mid-zoom, wait for the zoom to land first
    if (zooming) { refitAfterZoom = true; return; }
    var keep = null;
    if (k > 1.01) {
      var t0 = d3.zoomTransform(svg.node());
      keep = { ll: projection.invert(t0.invert([W / 2, H / 2])), px: k * projection.scale() };
    }
    project();
    dots.attr('cx', function (d) { return d.x; }).attr('cy', function (d) { return d.y; }).attr('r', dotR());
    zoom.translateExtent([[-80, -80], [W + 80, H + 80]]).extent([[0, 0], [W, H]]);
    var p = keep && keep.ll && projection(keep.ll);
    svg.call(zoom.transform, p
      // Same size on screen as before, so the map doesn't jump when its box changes
      ? d3.zoomIdentity.translate(W / 2, H / 2).scale(Math.max(1, Math.min(MAXK, keep.px / projection.scale()))).translate(-p[0], -p[1])
      : d3.zoomIdentity);
    meLayer.selectAll('*').remove();
    if (lastOrigin) drawMe(lastOrigin);
    hideTip();
    cluster();
    // Then glide (not snap) to the best framing for what's being shown
    if (lastView) { settling = !!keep; lastView(!keep); }
    emit('wip:fit');
  }
  var lastOrigin = null, lastView = null;
  var zooming = false, refitAfterZoom = false, settling = false;

  // Small public surface so a page can place things on the map and react to it
  var api = window.WIPMAP = {
    project: function (lng, lat) { return projection([lng, lat]); },
    size: function () { return [W, H]; },
    transform: function () { return d3.zoomTransform(svg.node()); },
    zoomBox: null // optional [x0, y0, x1, y1] fractions of the map to frame results into
  };
  function emit(name, detail) { document.dispatchEvent(new CustomEvent(name, { detail: detail })); }

  // Numbered pins for the current result list, matching the list numbers
  function drawLabels(list) {
    var data = list.length <= 12 ? list.filter(function (r) { return r.s.x != null; }) : [];
    var pin = labelLayer.selectAll('g').data(data, function (r) { return r.s.id; })
      .join(function (enter) {
        var e = enter.append('g').attr('class', 'pin');
        e.append('circle').attr('r', 8);
        e.append('text').attr('class', 'n').attr('dy', '0.35em');
        e.append('text').attr('class', 'place').attr('x', 13).attr('dy', '0.35em');
        return e;
      });
    pin.select('text.n').text(function (r, i) { return i + 1; });
    // Name each town once, beside its first pin
    var named = {};
    pin.select('text.place').text(function (r) {
      var key = r.s.c + r.s.s;
      if (named[key]) return '';
      named[key] = true;
      return r.s.c;
    });
    pin.sort(function (a, b) { return data.indexOf(b) - data.indexOf(a); });
    placeLabels();
  }
  function placeLabels() {
    labelLayer.selectAll('g.pin').attr('transform', function (r) {
      return 'translate(' + r.s.x + ',' + r.s.y + ') scale(' + 1 / k + ')';
    });
    // Hide town names that would collide with one already shown (list order wins)
    var placed = [];
    var pins = labelLayer.selectAll('g.pin').nodes().slice().reverse();
    pins.forEach(function (node) {
      var r = d3.select(node).datum();
      var label = d3.select(node).select('text.place');
      var name = label.text();
      if (!name) return;
      var x = r.s.x * k, y = r.s.y * k;
      var box = [x - 9, y - 10, x + 16 + name.length * 7.2, y + 10];
      var hit = placed.some(function (b) { return box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1]; });
      label.attr('visibility', hit ? 'hidden' : null);
      if (!hit) placed.push(box);
    });
  }

  // Zoom
  var zoom = d3.zoom().scaleExtent([1, MAXK]).translateExtent([[-80, -80], [W + 80, H + 80]])
    .on('zoom', function (e) {
      k = e.transform.k;
      g.attr('transform', e.transform);
      dots.attr('r', dotR()).attr('stroke-width', 0.8);
      meLayer.selectAll('.me').attr('r', 9 / k);
      meLayer.selectAll('.me-dot').attr('r', 2.5 / k);
      placeLabels();
      // Regrouping mid-zoom makes circles flicker. While you zoom they hold still
      // (same size on screen); they regroup once, when you stop.
      clusterLayer.selectAll('g.cluster').attr('transform', function (d) { return 'translate(' + d.x + ',' + d.y + ') scale(' + 1 / k + ')'; });
      hideTip();
      var r = $('#zreset'); if (r && r.dataset.auto) r.hidden = k < 1.05;
      // Once someone has zoomed in, the headline steps back for good
      if (k > 2.2) document.body.classList.add('zoomed');
      emit('wip:zoom');
    })
    .on('start', function (e) {
      zooming = true;
      // A fly-to (search, a click): circles and pins step out while the map moves,
      // then come back regrouped once it lands, instead of piling up mid-flight
      if (!e.sourceEvent && !settling) svg.classed('flying', true);
    })
    .on('end', function () {
      zooming = false; settling = false;
      if (zoomLevel(k) !== groupLevel) queueCluster();
      requestAnimationFrame(function () { svg.classed('flying', false); });
      if (refitAfterZoom) { refitAfterZoom = false; refit(); }
    });
  // Scroll or pinch over the map to zoom (as on a Mac trackpad); a sideways swipe pans
  zoom.filter(function (e) {
    if (e.type === 'wheel') return e.ctrlKey || Math.abs(e.deltaY) >= Math.abs(e.deltaX);
    return !e.ctrlKey && !e.button;
  });
  svg.call(zoom).on('dblclick.zoom', null);
  svg.on('wheel.pan', function (e) {
    if (e.ctrlKey || Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
    e.preventDefault();
    if (k > 1.01) svg.call(zoom.translateBy, -e.deltaX / k, 0);
  });
  cluster();
  var lastW = frame.clientWidth, lastH = frame.clientHeight;
  var refitQueued = false;
  new ResizeObserver(function () {
    if (frame.clientWidth === lastW && frame.clientHeight === lastH) return;
    lastW = frame.clientWidth; lastH = frame.clientHeight;
    clearTimeout(refitQueued);
    refitQueued = setTimeout(refit, 160);
  }).observe(frame);
  // Dots keep a steady on-screen size, growing a little as you zoom in
  function dotR() { return 3.2 * Math.max(0.55, Math.min(1, W / 900)) * Math.min(1.9, 1 + Math.log(k) / 5) / k; }

  function zoomTo(points, opts) {
    opts = opts || {};
    if (!points.length) return;
    var xs = points.map(function (p) { return p[0]; }), ys = points.map(function (p) { return p[1]; });
    var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs);
    var y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
    var minSpan = (opts.minSpan || 40) * W / 975; // same geographic window at any map size
    var dx = Math.max(x1 - x0, minSpan), dy = Math.max(y1 - y0, minSpan * H / W);
    var box = api.zoomBox || [0, 0, 1, 1];
    var bw = box[2] - box[0], bh = box[3] - box[1];
    var s = Math.min(opts.maxK || 16, 0.8 * Math.min(bw * W / dx, bh * H / dy));
    var cx = W * (box[0] + box[2]) / 2, cy = H * (box[1] + box[3]) / 2;
    var t = d3.zoomIdentity.translate(cx, cy).scale(s).translate(-(x0 + x1) / 2, -(y0 + y1) / 2);
    if (opts.instant) svg.call(zoom.transform, t);
    else svg.transition().duration(reduceMotion() ? 0 : 750).call(zoom.transform, t);
  }
  function resetZoom() { svg.transition().duration(reduceMotion() ? 0 : 600).call(zoom.transform, d3.zoomIdentity); }
  function reduceMotion() { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }

  function on(sel, ev, fn) { var el = $(sel); if (el) el.addEventListener(ev, fn); }
  // A small step, so circles stay put (no fade) and regroup when it lands
  on('#zin', 'click', function () { settling = true; svg.transition().duration(350).call(zoom.scaleBy, 2); });
  on('#zout', 'click', function () { settling = true; svg.transition().duration(350).call(zoom.scaleBy, 0.5); });
  on('#zreset', 'click', function () { setPressed(null); lastView = null; resetZoom(); });

  // Tooltip
  var tip = $('#tip');
  function showTip(d) {
    showTipAt(d.x, d.y, '<b>' + esc(d.c) + ', ' + d.s + '</b>' + esc(d.a) + (d.copies > 1 ? ' (' + d.copies + ' shops)' : ''));
  }
  function showTipAt(x, y, html) {
    var t = d3.zoomTransform(svg.node());
    var rect = svg.node().getBoundingClientRect();
    var sx = Math.min(rect.width / W, rect.height / H);
    var ox = (rect.width - W * sx) / 2, oy = (rect.height - H * sx) / 2;
    tip.innerHTML = html;
    tip.style.left = (ox + t.applyX(x) * sx) + 'px';
    tip.style.top = (oy + t.applyY(y) * sx) + 'px';
    tip.hidden = false;
  }
  function hideTip() { tip.hidden = true; }
  dots.on('mouseenter focus', function (e, d) { showTip(d); })
    .on('mouseleave blur', hideTip)
    .on('click keydown', function (e, d) {
      if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      selectStore(d, true);
    });

  // Distance
  function miles(a, b) {
    var R = 3958.8, r = Math.PI / 180;
    var dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  function nearest(origin, n) {
    return stores.map(function (s) { return { s: s, d: miles(origin, s) }; })
      .sort(function (a, b) { return a.d - b.d; }).slice(0, n);
  }

  // Results list
  var resultsEl = $('#results'), statusEl = $('#status');
  function directionsUrl(s) {
    return 'https://www.google.com/maps/search/?api=1&query=' +
      encodeURIComponent('Barnes & Noble, ' + s.a + ', ' + s.c + ', ' + s.s + ' ' + s.z);
  }
  function fmtMiles(d) { return d < 1 ? '< 1 mi' : d < 10 ? d.toFixed(1) + ' mi' : Math.round(d) + ' mi'; }
  function renderResults(list) {
    resultsEl.innerHTML = '';
    var numbered = list.length <= 12;
    list.forEach(function (r, i) {
      var s = r.s;
      var li = document.createElement('li');
      li.innerHTML =
        '<button type="button" class="result" data-id="' + s.id + '">' +
          '<span class="city">' + (numbered ? '<i class="num">' + (i + 1) + '</i>' : '') + esc(s.c) + ', ' + s.s + '</span>' +
          (r.d != null ? '<span class="dist">' + fmtMiles(r.d) + '</span>' : '<span></span>') +
          '<span class="addr">' + esc(s.a) + ' ' + s.z + '</span>' +
        '</button>' +
        '<a class="dir" href="' + directionsUrl(s) + '" target="_blank" rel="noopener">Directions →</a>';
      resultsEl.appendChild(li);
    });
    var ids = {};
    list.forEach(function (r) { ids[r.s.id] = true; });
    resultIds = ids;
    // Results always mean zooming in: step the headline back now, together with the
    // results row appearing, so the map's box only changes once
    if (list.length) document.body.classList.add('zoomed');
    cluster();
    dots.classed('near', function (d) { return !!ids[d.id]; }).classed('active', false);
    drawLabels(list);
    emit('wip:results', list);
  }
  resultsEl.addEventListener('click', function (e) {
    var b = e.target.closest('.result');
    if (!b) return;
    selectStore(stores[+b.dataset.id], false);
  });
  resultsEl.addEventListener('mouseover', function (e) {
    var b = e.target.closest('.result');
    if (b) { var s = stores[+b.dataset.id]; if (s.x != null) showTip(s); }
  });
  resultsEl.addEventListener('mouseleave', hideTip);

  function selectStore(s, fromMap) {
    dots.classed('active', function (d) { return d.id === s.id; });
    document.querySelectorAll('.result').forEach(function (b) {
      b.setAttribute('aria-current', +b.dataset.id === s.id ? 'true' : 'false');
    });
    if (fromMap && !document.querySelector('.result[data-id="' + s.id + '"]')) {
      var list = nearest(s, 6);
      renderResults(list);
      statusEl.textContent = 'Stores near ' + s.c + ', ' + s.s + '.';
      dots.classed('active', function (d) { return d.id === s.id; });
    }
    if (s.x != null) {
      if (k < 6) zoomTo([[s.x, s.y]], { minSpan: 40 });
      setTimeout(function () { showTip(s); }, reduceMotion() ? 0 : 780);
    }
  }

  function showNear(origin, label) {
    var list = nearest(origin, 8);
    renderResults(list);
    var closest = list[0];
    statusEl.textContent = closest.d > 60
      ? 'The nearest store to ' + label + ' is ' + fmtMiles(closest.d) + ' away.'
      : 'The nearest stores to ' + label + '.';
    lastOrigin = origin;
    meLayer.selectAll('*').remove();
    drawMe(origin);
    lastView = function (instant) {
      var pts = list.slice(0, 5).filter(function (r) { return r.s.x != null; }).map(function (r) { return [r.s.x, r.s.y]; });
      var p = projection([origin.lng, origin.lat]);
      if (p) pts.push(p);
      zoomTo(pts, { instant: instant });
    };
    lastView(false);
  }
  function drawMe(origin) {
    var p = projection([origin.lng, origin.lat]);
    if (!p) return;
    meLayer.append('circle').attr('class', 'me').attr('cx', p[0]).attr('cy', p[1]).attr('r', 9 / k);
    meLayer.append('circle').attr('class', 'me-dot').attr('cx', p[0]).attr('cy', p[1]).attr('r', 2.5 / k);
  }

  // Search
  var zipsLoading = null;
  function loadZips() {
    if (window.ZIPS) return Promise.resolve();
    if (!zipsLoading) {
      zipsLoading = new Promise(function (res, rej) {
        var sc = document.createElement('script');
        sc.src = 'data/zips.js';
        sc.onload = res; sc.onerror = rej;
        document.head.appendChild(sc);
      });
    }
    return zipsLoading;
  }
  function norm(t) { return t.toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim(); }

  function search(q) {
    q = q.trim();
    setPressed(null);
    if (!q) return;
    var zip = q.match(/^\d{5}/);
    if (zip) {
      statusEl.textContent = 'Looking up ' + zip[0] + '…';
      loadZips().then(function () {
        var ll = window.ZIPS[zip[0]];
        if (!ll) { statusEl.textContent = "We couldn't find zip code " + zip[0] + '. Try a city instead.'; return; }
        showNear({ lat: ll[0], lng: ll[1] }, zip[0]);
      }, function () { statusEl.textContent = "Zip search isn't available right now. Try a city."; });
      return;
    }
    var parts = q.split(',');
    var city = norm(parts[0]);
    var st = parts[1] ? parts[1].trim().toUpperCase().slice(0, 2) : null;
    var hits = stores.filter(function (s) { return norm(s.c) === city && (!st || s.s === st); });
    if (!hits.length) hits = stores.filter(function (s) { return norm(s.c).indexOf(city) === 0 && (!st || s.s === st); });
    if (hits.length) {
      var lat = d3.mean(hits, function (s) { return s.lat; }), lng = d3.mean(hits, function (s) { return s.lng; });
      showNear({ lat: lat, lng: lng }, hits[0].c + ', ' + hits[0].s);
      return;
    }
    var abbr = Object.keys(STATE_NAMES).filter(function (a) {
      return a.toLowerCase() === city.replace(/ /g, '') || norm(STATE_NAMES[a]) === city;
    })[0];
    if (abbr) { showState(abbr); return; }
    statusEl.textContent = "We don't have a store in “" + q + "”. Try a zip code for the nearest one.";
    resultsEl.innerHTML = '';
  }
  on('#search', 'submit', function (e) { e.preventDefault(); search($('#q').value); });

  function showState(abbr) {
    var inState = stores.filter(function (s) { return s.s === abbr; })
      .sort(function (a, b) { return a.c.localeCompare(b.c); });
    var n = inState.reduce(function (t, s) { return t + s.copies; }, 0);
    statusEl.textContent = n
      ? n + ' store' + (n > 1 ? 's' : '') + ' in ' + STATE_NAMES[abbr] + '.'
      : "We're not in " + STATE_NAMES[abbr] + ' yet.';
    renderResults(inState.map(function (s) { return { s: s, d: null }; }));
    meLayer.selectAll('*').remove();
    lastOrigin = null;
    lastView = function (instant) {
      var pts = inState.filter(function (s) { return s.x != null; }).map(function (s) { return [s.x, s.y]; });
      zoomTo(pts, { minSpan: 60, instant: instant });
    };
    lastView(false);
  }

  // Geolocation
  on('#locate', 'click', function () {
    if (!navigator.geolocation) { statusEl.textContent = "Your browser can't share your location. Try a zip code."; return; }
    statusEl.textContent = 'Finding you…';
    navigator.geolocation.getCurrentPosition(function (pos) {
      showNear({ lat: pos.coords.latitude, lng: pos.coords.longitude }, 'you');
    }, function () {
      statusEl.textContent = "We couldn't get your location. Try a zip code.";
    }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 });
  });

  // Region figures
  function inBox(s, b) { return s.lng >= b[0] && s.lng <= b[2] && s.lat >= b[1] && s.lat <= b[3]; }
  function regionStores(key) {
    if (key === 'ny') return stores.filter(function (s) { return s.s === 'NY'; });
    return stores.filter(function (s) { return inBox(s, REGIONS[key]); });
  }
  function setPressed(btn) {
    document.querySelectorAll('.regions button').forEach(function (b) { b.setAttribute('aria-pressed', b === btn ? 'true' : 'false'); });
  }
  document.querySelectorAll('[data-count="stores"]').forEach(function (el) { el.textContent = TOTAL; });
  document.querySelectorAll('.regions button').forEach(function (btn) {
    var key = btn.dataset.region;
    if (key !== 'all') {
      btn.querySelector('b').textContent = regionStores(key).reduce(function (t, s) { return t + s.copies; }, 0);
    }
    btn.addEventListener('click', function () {
      setPressed(btn);
      document.getElementById('find').scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'start' });
      if (key === 'all') { lastView = null; resetZoom(); return; }
      var list = regionStores(key).sort(function (a, b) { return a.c.localeCompare(b.c); });
      renderResults(list.map(function (s) { return { s: s, d: null }; }));
      statusEl.textContent = btn.querySelector('b').textContent + ' stores ' + btn.querySelector('span').textContent.toLowerCase().replace(/^around/, 'around') + '.';
      meLayer.selectAll('*').remove();
      lastOrigin = null;
      lastView = function (instant) {
        zoomTo(list.filter(function (s) { return s.x != null; }).map(function (s) { return [s.x, s.y]; }),
          { minSpan: key === 'ny' ? 60 : 20, instant: instant });
      };
      lastView(false);
    });
  });

  // Directory
  var byState = d3.group(stores, function (s) { return s.s; });
  var dir = $('#dir');
  if (dir) Array.from(byState.keys()).sort(function (a, b) { return STATE_NAMES[a].localeCompare(STATE_NAMES[b]); })
    .forEach(function (abbr) {
      var list = byState.get(abbr).slice().sort(function (a, b) { return a.c.localeCompare(b.c) || a.a.localeCompare(b.a); });
      var n = list.reduce(function (t, s) { return t + s.copies; }, 0);
      var det = document.createElement('details');
      det.innerHTML = '<summary>' + STATE_NAMES[abbr] + '<span>' + n + '</span></summary><ul>' +
        list.map(function (s) {
          return '<li><b>' + esc(s.c) + '</b><a href="' + directionsUrl(s) + '" target="_blank" rel="noopener">' + esc(s.a) + '</a></li>';
        }).join('') + '</ul>';
      dir.appendChild(det);
    });

  function esc(t) {
    return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
  }

  // Let other page scripts list stores and jump to one
  api.stores = stores;
  api.stateNames = STATE_NAMES;
  api.directionsUrl = directionsUrl;
  api.select = function (id) {
    var s = stores[id];
    showNear(s, s.c + ', ' + s.s);
    dots.classed('active', function (d) { return d.id === s.id; });
    setTimeout(function () { if (s.x != null) showTip(s); }, reduceMotion() ? 0 : 800);
  };

  // 49 states*: light up the one we're missing
  var wyoming = statePaths.filter(function (d) { return d.id === '56'; });
  document.querySelectorAll('.wy').forEach(function (el) {
    var on = function () { wyoming.classed('sorry', true).raise(); };
    var off = function () { wyoming.classed('sorry', false); };
    el.addEventListener('mouseenter', on); el.addEventListener('focus', on);
    el.addEventListener('mouseleave', off); el.addEventListener('blur', off);
  });

  // Deep link: ?q=10003
  var qp = new URLSearchParams(location.search).get('q');
  // Run after any page scripts have hooked in
  if (qp) setTimeout(function () { $('#q').value = qp; search(qp); }, 0);
})();
