// The Issue 26 screen below the map: scroll, swipe or tap to move between them.
(function () {
  'use strict';
  var body = document.body;
  var stack = document.querySelector('.vstack');
  var issue = document.getElementById('issue');
  var main = document.querySelector('.screen-main');
  var seamTab = document.querySelector('.seam-tab');
  var seam = document.querySelector('.seam');
  var locked = false;

  function at() { return body.classList.contains('at-issue'); }
  function go(where) {
    var down = where === 'issue';
    if (down === at()) return;
    stack.style.transform = '';
    seam.style.transform = '';
    body.classList.toggle('at-issue', down);
    issue.inert = !down;
    main.inert = down;
    seamTab.setAttribute('aria-label', down ? 'Back to the map' : 'Inside Issue 26');
    // Ignore the tail of a trackpad fling so one gesture moves one screen
    locked = true;
    setTimeout(function () { locked = false; }, 1100);
  }
  // Natural mode: the page just scrolls. The divider's label follows what's in view,
  // and the tab glides there. None of the screen-at-a-time handling below applies.
  if (body.classList.contains('natural')) {
    issue.inert = false;
    new IntersectionObserver(function (entries) {
      var down = entries[0].isIntersecting;
      if (down === at()) return;
      body.classList.toggle('at-issue', down);
      seamTab.setAttribute('aria-label', down ? 'Back to the map' : 'Inside Issue 26');
    }, { threshold: 0.45 }).observe(issue);
    seamTab.addEventListener('click', function () {
      (at() ? main : issue).scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    });
    measureSoon();
    return;
  }
  seamTab.addEventListener('click', function () { go(at() ? 'main' : 'issue'); });

  // Scroll wheel / trackpad: a firm push down or up turns the page
  var acc = 0, accTimer;
  window.addEventListener('wheel', function (e) {
    if (Math.abs(e.deltaY) < Math.abs(e.deltaX) || e.ctrlKey) return;
    // Over the map, scrolling zooms the map instead
    if (e.target.closest && e.target.closest('#map') && !body.classList.contains('listing') && !at()) return;
    // Let the stockist list scroll on its own
    var list = e.target.closest('.stock-list');
    if (list && body.classList.contains('listing')) {
      var atEnd = list.scrollTop + list.clientHeight >= list.scrollHeight - 2;
      var atTop = list.scrollTop <= 0;
      if ((e.deltaY > 0 && !atEnd) || (e.deltaY < 0 && !atTop)) return;
    }
    if (locked) return;
    acc += e.deltaY;
    clearTimeout(accTimer);
    accTimer = setTimeout(function () { acc = 0; }, 200);
    if (acc > 60 && !at()) { acc = 0; go('issue'); }
    else if (acc < -60 && at()) { acc = 0; go('main'); }
  }, { passive: true });

  document.addEventListener('keydown', function (e) {
    if (e.target.matches('input')) return;
    if ((e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === ' ') && !at()) { e.preventDefault(); go('issue'); }
    if ((e.key === 'ArrowUp' || e.key === 'PageUp') && at()) { e.preventDefault(); go('main'); }
  });

  // Touch: drag up or down; the page follows the finger, then settles
  var start = null;
  window.addEventListener('touchstart', function (e) {
    if (e.touches.length !== 1 || e.target.closest('#map, .stock-list, input')) { start = null; return; }
    start = { x: e.touches[0].clientX, y: e.touches[0].clientY, moved: false };
  }, { passive: true });
  window.addEventListener('touchmove', function (e) {
    if (!start) return;
    var dx = e.touches[0].clientX - start.x, dy = e.touches[0].clientY - start.y;
    if (!start.moved) {
      if (Math.abs(dy) < 10 || Math.abs(dy) < Math.abs(dx)) return;
      start.moved = true;
      stack.classList.add('dragging');
    }
    var h = window.innerHeight;
    var y = Math.max(-h, Math.min(0, (at() ? -h : 0) + dy));
    stack.style.transform = 'translateY(' + y + 'px)';
    // The divider follows along, easing from just above the seam to just below it
    seam.style.transform = 'translateY(' + (-32 + 64 * (-y / h)) + 'px)';
  }, { passive: true });
  window.addEventListener('touchend', function (e) {
    if (!start) return;
    var moved = start.moved, dy = (e.changedTouches[0].clientY - start.y);
    start = null;
    stack.classList.remove('dragging');
    if (!moved) return;
    var flick = window.innerHeight * 0.15;
    if (!at() && dy < -flick) go('issue');
    else if (at() && dy > flick) go('main');
    else { stack.style.transform = ''; seam.style.transform = ''; }
  });

  function measureSoon() {
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
    window.addEventListener('resize', measure);
    document.addEventListener('transitionend', function (e) { if (e.target.closest && e.target.closest('.screen-issue')) measure(); });
    measure();
  }
  // Where each contents line's words start, so the hover star sits just before them
  function measure() {
    document.querySelectorAll('.contents li').forEach(function (li) {
      var r = document.createRange();
      r.selectNodeContents(li);
      li.style.setProperty('--tx', (r.getBoundingClientRect().left - li.getBoundingClientRect().left) + 'px');
    });
  }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
  window.addEventListener('resize', measure);
  document.addEventListener('transitionend', function (e) { if (e.target.closest && e.target.closest('.screen-issue')) measure(); });
  measure();
})();
