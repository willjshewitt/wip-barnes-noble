// Duo screen: pick the cover or the photo; it swings to its side and shows its story.
(function () {
  'use strict';
  var duo = document.querySelector('.duo');
  var cards = duo.querySelectorAll('.card');

  function show(which) {
    duo.dataset.focus = which;
    cards.forEach(function (c) { c.setAttribute('aria-expanded', String(c.dataset.show === which)); });
  }
  // Which card the pointer means. The resting pair overlaps, so going by whichever is on
  // top makes them flip back and forth as they move; instead, the half you're on decides.
  // The area is both cards' boxes plus a margin, so a card leaning out never drops you.
  function setLean(v) { if (v) duo.dataset.lean = v; else delete duo.dataset.lean; }
  duo.addEventListener('pointermove', function (e) {
    if (e.pointerType === 'touch') return;
    if (duo.dataset.focus === 'none') {
      var a = cards[0].getBoundingClientRect(), b = cards[1].getBoundingClientRect(), m = 24;
      var inside = e.clientX > Math.min(a.left, b.left) - m && e.clientX < Math.max(a.right, b.right) + m &&
                   e.clientY > Math.min(a.top, b.top) - m && e.clientY < Math.max(a.bottom, b.bottom) + m;
      var mid = duo.getBoundingClientRect().left + duo.clientWidth / 2;
      setLean(inside ? (e.clientX < mid ? 'issue' : 'tote') : null);
    } else {
      var c = e.target.closest('.card');
      setLean(c ? c.dataset.show : null);
    }
  });
  duo.addEventListener('pointerleave', function () { setLean(null); });

  cards.forEach(function (c) {
    c.addEventListener('click', function (e) {
      // With a mouse at rest, pick the one leaning out (even if the other is on top there)
      var which = duo.dataset.focus === 'none' && e.detail && duo.dataset.lean ? duo.dataset.lean : c.dataset.show;
      // Picking the open one again puts the pair back together
      show(duo.dataset.focus === which ? 'none' : which);
    });
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && duo.dataset.focus !== 'none') show('none');
  });
  // The badge turns slowly. Click it and it whizzes round, then settles back.
  // Drawn frame by frame in the SVG itself, so it stays sharp at any zoom.
  var badge = duo.querySelector('.badge');
  var ring = badge.querySelector('.badge-ring');
  var star = badge.querySelector('.badge-star');
  var still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var angle = 0, base = 360 / 28, speed = base, last = 0;
  function turn(t) {
    var dt = last ? Math.min((t - last) / 1000, .05) : 0;
    last = t;
    speed = base + (speed - base) * Math.pow(.25, dt);
    angle = (angle + speed * dt) % 360;
    ring.setAttribute('transform', 'rotate(' + angle.toFixed(2) + ' 50 50)');
    star.setAttribute('transform', 'rotate(' + (-2 * angle).toFixed(2) + ' 50 50)');
    requestAnimationFrame(turn);
  }
  if (!still) requestAnimationFrame(turn);
  badge.addEventListener('click', function (e) {
    if (duo.dataset.focus !== 'tote') return;
    e.stopPropagation();
    speed += 900;
  });

  // Leaving the screen resets it, so it deals in fresh next time
  new MutationObserver(function () {
    if (!document.body.classList.contains('at-issue')) setTimeout(function () { show('none'); }, 900);
  }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
})();
