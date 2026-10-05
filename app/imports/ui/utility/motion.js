/**
 * Motion tokens for animations started from scripts (Web Animations, timers):
 * the values of stylesheets/motion.css, which CSS reads as variables. Keep
 * the two in step (DESIGN_SYSTEM.md, "Motion").
 */
export const DURATION = Object.freeze({
  short: 150,
  medium: 250,
  long: 400,
});

export const EASING = Object.freeze({
  standard: 'cubic-bezier(0.2, 0, 0, 1)',
  emphasizedDecelerate: 'cubic-bezier(0.05, 0.7, 0.1, 1)',
  emphasizedAccelerate: 'cubic-bezier(0.3, 0, 0.8, 0.15)',
});

// A wait on the server shows a spinner only once it has lasted this long: a
// quicker answer changes the value without one
export const SLOW_MS = 600;
