'use strict';

(function () {
  // ── Build DOM ──────────────────────────────────────
  const lb = document.createElement('div');
  lb.className = 'lb';
  lb.setAttribute('role', 'dialog');
  lb.setAttribute('aria-label', 'Image lightbox');
  lb.innerHTML = `
    <button class="lb-close" aria-label="Close lightbox">&#x2715;</button>
    <div class="lb-stage">
      <button class="lb-prev" aria-label="Previous image">&#x2039;</button>
      <img class="lb-img" alt="" draggable="false"/>
      <button class="lb-next" aria-label="Next image">&#x203A;</button>
    </div>
    <div class="lb-strip"></div>
    <div class="lb-counter"></div>
  `;
  document.body.appendChild(lb);

  const lbEl      = lb;
  const imgEl     = lb.querySelector('.lb-img');
  const prevBtn   = lb.querySelector('.lb-prev');
  const nextBtn   = lb.querySelector('.lb-next');
  const closeBtn  = lb.querySelector('.lb-close');
  const counter   = lb.querySelector('.lb-counter');
  const strip     = lb.querySelector('.lb-strip');

  let images  = [];   // [{src, fullSrc, alt}]
  let current = 0;

  // ── Collect .thumb-item elements (car pages) ──────────────
  function initThumbGallery() {
    const thumbs = document.querySelectorAll('.thumb-item');
    if (!thumbs.length) return;

    images = Array.from(thumbs).map((t, i) => {
      t.dataset.lbIndex = i;
      return {
        src:     t.dataset.src     || t.querySelector('img')?.src || '',
        fullSrc: t.dataset.fullSrc || t.dataset.src || t.querySelector('img')?.src || '',
        alt:     t.dataset.alt     || t.querySelector('img')?.alt || '',
      };
    });

    // Build film strip
    buildStrip();

    // Click on any thumb → open lightbox
    thumbs.forEach(t => {
      t.addEventListener('click', () => open(parseInt(t.dataset.lbIndex, 10)));
    });
  }

  // ── Collect [data-lightbox] elements (grouped galleries) ──────────────
  function initDataLightboxGallery() {
    const lightboxItems = document.querySelectorAll('[data-lightbox]');
    if (!lightboxItems.length) return;

    // Group by data-lightbox value
    const groups = {};
    lightboxItems.forEach(item => {
      const group = item.dataset.lightbox;
      if (!groups[group]) groups[group] = [];
      groups[group].push(item);
    });

    // Set up click handlers for each group
    Object.keys(groups).forEach(groupName => {
      const items = groups[groupName];
      items.forEach((item, i) => {
        item.dataset.lbGroup = groupName;
        item.dataset.lbIndex = i;

        item.addEventListener('click', (e) => {
          e.preventDefault();
          openGroup(groupName, i);
        });
      });
    });
  }

  // ── Open lightbox for a specific group ───────────────────────────────
  function openGroup(groupName, index) {
    const items = document.querySelectorAll(`[data-lightbox="${groupName}"]`);

    images = Array.from(items).map(item => ({
      src:     item.dataset.src || item.querySelector('img')?.src || '',
      fullSrc: item.dataset.fullSrc || item.dataset.src || item.querySelector('img')?.src || '',
      alt:     item.querySelector('img')?.alt || '',
    }));

    buildStrip();
    open(index);
  }

  // ── Build film strip ─────────────────────────────────────
  function buildStrip() {
    strip.innerHTML = '';
    images.forEach((img, i) => {
      const el = document.createElement('img');
      el.src            = img.src;
      el.alt            = img.alt;
      el.className      = 'lb-strip-item';
      el.dataset.index  = i;
      strip.appendChild(el);
    });
  }

  // ── Open / close ───────────────────────────────────
  function open(index) {
    current = index;
    lbEl.classList.add('lb-open');
    document.body.style.overflow = 'hidden';
    showImage(current);
  }

  function close() {
    lbEl.classList.remove('lb-open');
    document.body.style.overflow = '';
  }

  // ── Show image ─────────────────────────────────────
  function showImage(index) {
    if (!images.length) return;
    current = (index + images.length) % images.length;
    const { fullSrc, alt } = images[current];

    imgEl.classList.add('lb-loading');
    imgEl.alt = alt;

    const tmp = new Image();
    tmp.onload = () => {
      imgEl.src = fullSrc;
      imgEl.classList.remove('lb-loading');
    };
    tmp.onerror = () => {
      // fallback to thumb src
      imgEl.src = images[current].src;
      imgEl.classList.remove('lb-loading');
    };
    tmp.src = fullSrc;

    // Counter
    counter.textContent = `${current + 1} / ${images.length}`;

    // Prev/next
    prevBtn.disabled = images.length <= 1;
    nextBtn.disabled = images.length <= 1;

    // Film strip
    strip.querySelectorAll('.lb-strip-item').forEach((el, i) => {
      el.classList.toggle('active', i === current);
    });

    // Scroll strip to active thumb
    const activeStrip = strip.querySelector('.lb-strip-item.active');
    if (activeStrip) activeStrip.scrollIntoView({ inline: 'nearest', behavior: 'smooth' });
  }

  // ── Events ─────────────────────────────────────────
  closeBtn.addEventListener('click', close);
  prevBtn.addEventListener('click', () => showImage(current - 1));
  nextBtn.addEventListener('click', () => showImage(current + 1));

  strip.addEventListener('click', e => {
    const el = e.target.closest('.lb-strip-item');
    if (el) showImage(parseInt(el.dataset.index, 10));
  });

  // Click backdrop to close (not the image itself)
  lbEl.addEventListener('click', e => {
    if (e.target === lbEl || e.target.classList.contains('lb-stage')) close();
  });

  // Keyboard
  document.addEventListener('keydown', e => {
    if (!lbEl.classList.contains('lb-open')) return;
    if (e.key === 'Escape')      close();
    if (e.key === 'ArrowLeft')   showImage(current - 1);
    if (e.key === 'ArrowRight')  showImage(current + 1);
  });

  // Touch swipe
  let touchStartX = 0;
  lbEl.addEventListener('touchstart', e => {
    touchStartX = e.touches[0].clientX;
  }, { passive: true });

  lbEl.addEventListener('touchend', e => {
    const diff = touchStartX - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) showImage(current + (diff > 0 ? 1 : -1));
  }, { passive: true });

  // ── Init ───────────────────────────────────────────
  function init() {
    // Support both patterns:
    // 1. .thumb-item (car build pages)
    // 2. [data-lightbox] (open-houses, grouped galleries)
    initThumbGallery();
    initDataLightboxGallery();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
