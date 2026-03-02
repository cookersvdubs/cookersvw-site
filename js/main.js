'use strict';

// ── Mobile nav toggle ──────────────────────────────
const hamburger = document.querySelector('.hamburger');
const mobileNav = document.querySelector('.mobile-nav');

if (hamburger && mobileNav) {
  hamburger.addEventListener('click', () => {
    hamburger.classList.toggle('open');
    mobileNav.classList.toggle('open');
  });

  // Mobile sub-menu toggles
  mobileNav.querySelectorAll('.has-sub > a').forEach(a => {
    a.addEventListener('click', e => {
      e.preventDefault();
      const sub = a.nextElementSibling;
      if (sub && sub.classList.contains('mobile-sub')) {
        sub.classList.toggle('open');
      }
    });
  });

  // Close nav on regular link click (not sub-toggle)
  mobileNav.querySelectorAll('a:not(.has-sub > a)').forEach(link => {
    link.addEventListener('click', () => {
      hamburger.classList.remove('open');
      mobileNav.classList.remove('open');
    });
  });
}

// ── Desktop dropdown hover delay support ───────────
let dropdownTimer = null;

document.querySelectorAll('.nav-item.has-dropdown').forEach(item => {
  // Handle hover with delay
  item.addEventListener('mouseenter', () => {
    if (dropdownTimer) clearTimeout(dropdownTimer);
    item.classList.add('open');
  });

  item.addEventListener('mouseleave', () => {
    dropdownTimer = setTimeout(() => {
      item.classList.remove('open');
    }, 250); // 250ms delay before hiding
  });

  // Touch device click support
  item.addEventListener('click', e => {
    // Only intercept direct clicks on the parent link on touch devices
    if (e.target.closest('.nav-dropdown')) return;
    if (window.matchMedia('(hover: none)').matches) {
      e.preventDefault();
      const isOpen = item.classList.contains('open');
      document.querySelectorAll('.nav-item.has-dropdown').forEach(i => i.classList.remove('open'));
      if (!isOpen) item.classList.add('open');
    }
  });
});

// Close dropdowns when clicking outside
document.addEventListener('click', e => {
  if (!e.target.closest('.nav-item.has-dropdown')) {
    if (dropdownTimer) clearTimeout(dropdownTimer);
    document.querySelectorAll('.nav-item.has-dropdown').forEach(i => i.classList.remove('open'));
  }
});

// ── Header scroll shadow ───────────────────────────
const header = document.querySelector('header');
if (header) {
  window.addEventListener('scroll', () => {
    header.classList.toggle('scrolled', window.scrollY > 20);
  }, { passive: true });
}

// ── Active nav link ────────────────────────────────
(function () {
  const currentPage = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('nav a, .mobile-nav a').forEach(a => {
    const href = a.getAttribute('href') || '';
    if (href && href !== '#' && currentPage.includes(href.replace('../', '').replace('.html', ''))) {
      a.classList.add('active');
    }
    if ((currentPage === '' || currentPage === 'index.html') && (href === 'index.html' || href === '../index.html')) {
      a.classList.add('active');
    }
  });
})();

// ── Lazy-load iframes (videos page) ───────────────
if ('IntersectionObserver' in window) {
  const iframes = document.querySelectorAll('iframe[data-src]');
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const iframe = entry.target;
        iframe.src = iframe.dataset.src;
        observer.unobserve(iframe);
      }
    });
  }, { rootMargin: '200px' });

  iframes.forEach(iframe => observer.observe(iframe));
} else {
  document.querySelectorAll('iframe[data-src]').forEach(iframe => {
    iframe.src = iframe.dataset.src;
  });
}

// ── Scroll-reveal fade-in ──────────────────────────
if ('IntersectionObserver' in window) {
  const revealEls = document.querySelectorAll('.reveal');
  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('revealed');
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1 });

  revealEls.forEach(el => revealObserver.observe(el));
}
