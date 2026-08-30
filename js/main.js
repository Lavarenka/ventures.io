import { state } from './state.js';
import { initScene } from './scene.js';

document.getElementById('year').textContent = new Date().getFullYear();

// ---------------- pointer parallax ----------------
addEventListener('pointermove', (e) => {
  state.pointerNDC.x = (e.clientX / innerWidth - 0.5) * 2;
  state.pointerNDC.y = (e.clientY / innerHeight - 0.5) * 2;
}, { passive: true });

// ---------------- scroll progress (hero-relative, 0..1 across the hero's own height) ----------------
const heroEl = document.getElementById('hero');
const heroTextEl = document.getElementById('heroText');

function updateScroll() {
  const heroHeight = heroEl.offsetHeight || innerHeight;
  state.scrollFraction = Math.min(1, Math.max(0, scrollY / heroHeight));
  heroTextEl.style.opacity = String(1 - Math.min(1, state.scrollFraction / 0.4));
}
addEventListener('scroll', updateScroll, { passive: true });
updateScroll();

// ---------------- header background on scroll ----------------
const header = document.getElementById('siteHeader');
function updateHeader() {
  header.classList.toggle('scrolled', scrollY > 40);
}
addEventListener('scroll', updateHeader, { passive: true });
updateHeader();

// ---------------- mobile menu toggle ----------------
const menuToggle = document.getElementById('menuToggle');
const navMenu = document.getElementById('navMenu');
menuToggle.addEventListener('click', () => {
  navMenu.classList.toggle('open');
});
navMenu.querySelectorAll('a').forEach((a) => {
  a.addEventListener('click', () => navMenu.classList.remove('open'));
});

// ---------------- active nav link tracking ----------------
const sections = [...document.querySelectorAll('section[id]')];
const navLinks = [...navMenu.querySelectorAll('a')];
const sectionObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      const id = entry.target.id;
      navLinks.forEach((a) => a.classList.toggle('active', a.getAttribute('href') === `#${id}`));
    }
  });
}, { rootMargin: '-40% 0px -50% 0px', threshold: 0 });
sections.forEach((s) => sectionObserver.observe(s));

// ---------------- panel reveal on scroll ----------------
const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      revealObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.2 });
document.querySelectorAll('.panel').forEach((p) => revealObserver.observe(p));

// ---------------- application form ----------------
const form = document.getElementById('applyForm');
const formNote = document.getElementById('formNote');
const submitBtn = form.querySelector('.submit-btn');

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const name = form.name.value.trim();
  const email = form.email.value.trim();

  if (!name || !email) {
    formNote.textContent = 'Please fill in your name and email.';
    formNote.classList.remove('success');
    return;
  }
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailPattern.test(email)) {
    formNote.textContent = 'That email address doesn’t look right.';
    formNote.classList.remove('success');
    return;
  }

  // No backend is wired up in this concept — this simply confirms the intent
  // to submit, so the flow can be dropped behind a real endpoint later.
  submitBtn.disabled = true;
  submitBtn.textContent = 'Sending…';
  setTimeout(() => {
    formNote.textContent = 'Received. We’ll be in touch.';
    formNote.classList.add('success');
    submitBtn.textContent = 'Submitted';
    form.reset();
  }, 700);
});

// ---------------- boot the scene ----------------
const canvas = document.getElementById('scene');
const fpsValueEl = document.getElementById('fpsValue');
initScene(canvas, { onFps: (fps) => { if (fpsValueEl) fpsValueEl.textContent = fps; } });
