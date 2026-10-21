'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const {
  FirebaseService,
  firebaseService,
  IDENTITY_TOOLKIT_URL,
} = require('../src/main/firebase');

test('Firebase: _normalizeAuthError translates Firebase Identity Toolkit codes accurately', () => {
  const service = new FirebaseService();
  assert.equal(service._normalizeAuthError('EMAIL_EXISTS'), 'This email address is already registered.');
  assert.equal(service._normalizeAuthError('INVALID_LOGIN_CREDENTIALS'), 'Invalid email or password.');
  assert.equal(service._normalizeAuthError('WEAK_PASSWORD : Password should be at least 6 characters'), 'Password should be at least 6 characters.');
  assert.equal(service._normalizeAuthError('EMAIL_NOT_FOUND'), 'Invalid email or password.');
  assert.equal(service._normalizeAuthError('USER_DISABLED'), 'This account has been disabled.');
  assert.equal(service._normalizeAuthError('TOO_MANY_ATTEMPTS_TRY_LATER'), 'Too many attempts. Please try again later.');
});

test('Firebase: Google OAuth endpoint generates valid Google auth URI', async () => {
  // Test createAuthUri with real Google Identity Toolkit API endpoint
  const authRes = await fetch(`${IDENTITY_TOOLKIT_URL}/accounts:createAuthUri?key=${firebaseService.config.apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      providerId: 'google.com',
      continueUri: 'http://localhost:4045/auth/callback',
    }),
  });

  assert.equal(authRes.status, 200, 'Identity Toolkit responds with 200 OK');
  const data = await authRes.json();
  assert.ok(data.authUri, 'Response includes authUri');
  assert.ok(data.authUri.includes('accounts.google.com/o/oauth2/auth'), 'Target is accounts.google.com');
  assert.ok(data.authUri.includes('client_id='), 'Includes configured Google Client ID');
  assert.ok(data.authUri.includes('response_type=id_token'), 'Requests direct id_token for token interception');
  assert.equal(data.providerId, 'google.com');
});

test('Sanitization Check: No hardcoded dummy emails or fake identities in renderer/app.html or home.js', () => {
  const appHtml = fs.readFileSync(path.join(__dirname, '../src/renderer/app.html'), 'utf8');
  const homeJs = fs.readFileSync(path.join(__dirname, '../src/renderer/home.js'), 'utf8');

  // Verify no dummy fromnear emails
  assert.ok(!appHtml.includes('fromnearinstagram@gmail.com'), 'app.html has no dummy email');
  assert.ok(!appHtml.includes('fromneargoogle@gmail.com'), 'app.html has no dummy google email');
  assert.ok(!appHtml.includes('fromnearapple@icloud.com'), 'app.html has no dummy apple email');
  assert.ok(!homeJs.includes('fromneargoogle@gmail.com'), 'home.js has no dummy google email');
  assert.ok(!homeJs.includes('fromnearapple@icloud.com'), 'home.js has no dummy apple email');

  // Verify onboarding modal is not forcibly suppressed by inline display:none !important
  assert.ok(!appHtml.includes('id="node-onboarding-modal" style="display: none !important;"'), 'Onboarding modal not locked out');

  // Verify forgot password button is wired
  assert.ok(appHtml.includes('id="nom-btn-forgot-pass"'), 'Forgot password button present in HTML');
  assert.ok(homeJs.includes('nom-btn-forgot-pass'), 'Forgot password handler wired in home.js');

  // Verify Google OAuth invocation
  assert.ok(homeJs.includes("firebase:google-oauth"), 'home.js invokes real Google OAuth');
});
