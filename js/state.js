export const state = {
  scrollFraction: 0,
  pointerNDC: { x: 2, y: 2 },
  reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches
};
