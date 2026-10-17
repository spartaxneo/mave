'use strict';
// Autonomous Anti-Bot & Captcha Management Engine for Bigfoot/Mave.
// Detects Cloudflare Turnstile, Google reCAPTCHA, Arkose Labs, and hCaptcha.
// Provides stealth Bezier curve human-like interaction and Human-In-The-Loop (HITL) resolution.

const CAPTCHA_SIGNATURES = [
  { name: 'Cloudflare Turnstile', selector: 'iframe[src*="cloudflare"], div.cf-turnstile, input[name="cf-turnstile-response"]', type: 'turnstile' },
  { name: 'Google reCAPTCHA v2/v3', selector: 'iframe[src*="google.com/recaptcha"], div.g-recaptcha, #g-recaptcha-response', type: 'recaptcha' },
  { name: 'Arkose Labs FunCaptcha', selector: 'iframe[src*="arkoselabs"], #fc-iframe-wrap, #arkose', type: 'arkose' },
  { name: 'hCaptcha', selector: 'iframe[src*="hcaptcha.com"], div.h-captcha', type: 'hcaptcha' },
];

/**
 * Generate human-like Bezier curve control points between start and end coordinates.
 */
function generateBezierCurve(startX, startY, endX, endY, steps = 15) {
  const points = [];
  // Random control points offset to simulate wrist/arm curves
  const deviation = Math.hypot(endX - startX, endY - startY) * 0.2;
  const cp1X = startX + (endX - startX) * 0.3 + (Math.random() - 0.5) * deviation;
  const cp1Y = startY + (endY - startY) * 0.3 + (Math.random() - 0.5) * deviation;
  const cp2X = startX + (endX - startX) * 0.7 + (Math.random() - 0.5) * deviation;
  const cp2Y = startY + (endY - startY) * 0.7 + (Math.random() - 0.5) * deviation;

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const invT = 1 - t;
    const x = Math.round(invT ** 3 * startX + 3 * invT ** 2 * t * cp1X + 3 * invT * t ** 2 * cp2X + t ** 3 * endX);
    const y = Math.round(invT ** 3 * startY + 3 * invT ** 2 * t * cp1Y + 3 * invT * t ** 2 * cp2Y + t ** 3 * endY);
    // Add realistic 1-2px jitter
    const jitterX = i > 0 && i < steps ? Math.floor(Math.random() * 3) - 1 : 0;
    const jitterY = i > 0 && i < steps ? Math.floor(Math.random() * 3) - 1 : 0;
    points.push({ x: x + jitterX, y: y + jitterY, delayMs: Math.floor(10 + Math.random() * 15) });
  }
  return points;
}

/**
 * Detect if any anti-bot or CAPTCHA element is present on the page HTML or DOM.
 */
function detectCaptchaInHtml(html) {
  if (!html || typeof html !== 'string') return null;
  const lower = html.toLowerCase();
  for (const sig of CAPTCHA_SIGNATURES) {
    if (lower.includes('challenges.cloudflare.com/turnstile') || lower.includes('cf-turnstile')) {
      return { detected: true, type: 'turnstile', name: 'Cloudflare Turnstile', bypassable: true };
    }
    if (lower.includes('recaptcha/api.js') || lower.includes('g-recaptcha')) {
      return { detected: true, type: 'recaptcha', name: 'Google reCAPTCHA', bypassable: false };
    }
    if (lower.includes('arkoselabs') || lower.includes('funcaptcha')) {
      return { detected: true, type: 'arkose', name: 'Arkose Labs FunCaptcha', bypassable: false };
    }
    if (lower.includes('hcaptcha.com')) {
      return { detected: true, type: 'hcaptcha', name: 'hCaptcha', bypassable: false };
    }
  }
  return { detected: false };
}

module.exports = {
  CAPTCHA_SIGNATURES,
  generateBezierCurve,
  detectCaptchaInHtml,
};
