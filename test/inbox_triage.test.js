'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { InboxZeroTriage } = require('../src/main/communication/inbox_triage');
const inboxPlugin = require('../src/main/plugins/builtin/inbox_triage');

test('InboxZeroTriage accurately classifies urgent emails and extracts deadlines', () => {
  const triage = new InboxZeroTriage();
  const result = triage.triageEmail({
    sender: 'investor@sequoia.com',
    subject: 'Urgent: Term Sheet signature required by 5pm today',
    body: 'Please review the updated governance clause and sign by 5pm today.'
  });

  assert.equal(result.category, 'URGENT_ACTION');
  assert.equal(result.urgencyScore, 9);
  assert.equal(result.requiresAction, true);
  assert.ok(result.deadline.includes('5pm'));
  assert.equal(result.quickReplies.length, 3);
  assert.ok(result.quickReplies.some(r => r.label === 'Acknowledge & Confirm'));
});

test('InboxZeroTriage identifies VIP senders and promotional spam with unsubscribe links', () => {
  const triage = new InboxZeroTriage({
    vipSenders: ['ceo@openai.com']
  });

  // VIP
  const vipRes = triage.triageEmail({
    sender: 'ceo@openai.com',
    subject: 'Catch up over coffee',
    body: 'Hey, let us do a quick sync this week.'
  });
  assert.equal(vipRes.isVip, true);
  assert.equal(vipRes.category, 'VIP_PERSONAL');
  assert.equal(vipRes.urgencyScore, 8);

  // Spam
  const spamRes = triage.triageEmail({
    sender: 'promo@store.com',
    subject: 'Massive Summer Sale!',
    body: 'Get 40% off. If you wish to opt out, click https://store.com/unsubscribe?user=123'
  });
  assert.equal(spamRes.category, 'PROMOTIONAL_SPAM');
  assert.equal(spamRes.urgencyScore, 1);
  assert.equal(spamRes.recommendedAction, 'AUTO_ARCHIVE_OR_UNSUBSCRIBE');
  assert.ok(spamRes.unsubscribeLink.includes('store.com/unsubscribe'));
});

test('InboxZeroTriage generates executive daily digests', () => {
  const triage = new InboxZeroTriage();
  const digest = triage.summarizeDailyInbox([
    { sender: 'hr@work.com', subject: 'Urgent: Benefits election deadline tomorrow', body: 'Please elect benefits.' },
    { sender: 'stripe@stripe.com', subject: 'Invoice #1002 payment received', body: 'Total: $299.00' },
    { sender: 'newsletter@tech.com', subject: 'Tech Daily Digest', body: 'Top stories today' },
    { sender: 'ads@retail.com', subject: 'Special discount inside', body: 'Unsubscribe here' }
  ]);

  assert.equal(digest.totalEmails, 4);
  assert.equal(digest.urgentCount, 1);
  assert.equal(digest.receiptCount, 1);
  assert.equal(digest.spamCount, 1);
  assert.equal(digest.inboxHealthRating, 'MANAGEABLE');
});

test('Inbox Triage builtin plugin tools run properly', async () => {
  const singleTool = inboxPlugin.find(t => t.name === 'inbox_triage_single_email');
  const digestTool = inboxPlugin.find(t => t.name === 'inbox_generate_daily_digest');

  assert.ok(singleTool);
  assert.ok(digestTool);

  const mockCtx = { log: () => {} };
  const singleOut = await singleTool.run({
    sender: 'colleague@company.com',
    subject: 'Quick question about API deployment',
    body: 'Could you review the PR?'
  }, mockCtx);
  assert.ok(singleOut.includes('INBOX TRIAGE REPORT'));
  assert.ok(singleOut.includes('Executive 1-Click Quick Replies'));

  const digestOut = await digestTool.run({}, mockCtx);
  assert.ok(digestOut.includes('DAILY EXECUTIVE INBOX DIGEST'));
});
