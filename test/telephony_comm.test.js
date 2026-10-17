'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  CallScreeningHub,
  getCallScreeningHub,
} = require('../src/main/telephony/call_screening_hub');

const telephonyPlugins = require('../src/main/plugins/builtin/telephony_comm');

test('CallScreeningHub identifies VIP calls and allows direct bypass', () => {
  const tmpFile = path.join(os.tmpdir(), `test_telephony_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.json`);
  const hub = new CallScreeningHub(tmpFile);

  // VIP call from spouse (+15551234567)
  const res = hub.screenCall({
    callerNumber: '+1 (555) 123-4567',
    callerName: 'Sarah',
  });

  assert.equal(res.action, 'ring_user_immediately');
  assert.equal(res.disposition, 'VIP Call Allowed');
  assert.match(res.message, /Sarah/i);

  try { if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile); } catch {}
});

test('CallScreeningHub blocks telemarketer and robocall spam', () => {
  const tmpFile = path.join(os.tmpdir(), `test_telephony_spam_${Date.now()}.json`);
  const hub = new CallScreeningHub(tmpFile);

  const res = hub.screenCall({
    callerNumber: '+18005559999',
    callerName: 'Toll Free Info',
    speechTranscript: 'We are calling about your car extended warranty final notice',
  });

  assert.equal(res.action, 'block_and_disconnect');
  assert.equal(res.disposition, 'Spam Auto-Blocked');

  try { if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile); } catch {}
});

test('CallScreeningHub transcribes unknown calls into voicemails', () => {
  const tmpFile = path.join(os.tmpdir(), `test_telephony_vm_${Date.now()}.json`);
  const hub = new CallScreeningHub(tmpFile);

  const res = hub.screenCall({
    callerNumber: '+14155558888',
    callerName: 'Package Courier',
    speechTranscript: 'Hi, I have a package delivery from DHL that needs a signature at your door.',
  });

  assert.equal(res.action, 'take_voicemail');
  assert.equal(res.disposition, 'Voicemail Transcribed');

  const vms = hub.getVoicemails();
  assert.ok(vms.length >= 1);
  assert.match(vms[0].transcript, /DHL/i);

  try { if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile); } catch {}
});

test('CallScreeningHub triages emails accurately', () => {
  const hub = getCallScreeningHub();
  const sampleEmails = [
    { sender: 'bank@chase.com', subject: 'Urgent: Security Alert on Your Card', body: 'We noticed unusual activity.' },
    { sender: 'billing@aws.amazon.com', subject: 'Invoice Payment Due for September', body: 'Please review invoice #9923.' },
    { sender: 'newsletter@techcrunch.com', subject: 'Daily Tech Roundup', body: 'Here are today top stories.' },
  ];

  const triaged = hub.triageEmails(sampleEmails);
  assert.equal(triaged.totalTriaged, 3);
  assert.equal(triaged.urgentCount, 1);
  assert.equal(triaged.actionCount, 1);
  assert.match(triaged.urgent[0].subject, /Security Alert/i);
});

test('Telephony builtin plugin tools export valid schemas and run properly', async () => {
  assert.ok(Array.isArray(telephonyPlugins));
  assert.equal(telephonyPlugins.length, 4);

  const screenTool = telephonyPlugins.find((p) => p.name === 'screen_incoming_call');
  const vmTool = telephonyPlugins.find((p) => p.name === 'list_voicemails');
  const triageTool = telephonyPlugins.find((p) => p.name === 'triage_inbox_emails');
  const vipTool = telephonyPlugins.find((p) => p.name === 'manage_vip_call_contacts');

  assert.ok(screenTool);
  assert.ok(vmTool);
  assert.ok(triageTool);
  assert.ok(vipTool);

  const mockCtx = { log: () => {} };

  const screenRes = await screenTool.run({ caller_number: '+15551234567' }, mockCtx);
  assert.match(screenRes, /CALL SCREENING DISPOSITION/i);

  const vmRes = await vmTool.run({}, mockCtx);
  assert.match(vmRes, /VOICEMAIL/i);

  const vipRes = await vipTool.run({ action: 'list' }, mockCtx);
  assert.match(vipRes, /AUTHORIZED VIP CONTACTS/i);
});
