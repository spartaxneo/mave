'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { CommonSenseEngine } = require('../src/main/intelligence/common_sense');

test('CommonSenseEngine: Spatial & Location Awareness', () => {
  const tmpFile = path.join(os.tmpdir(), `test_cs_spatial_${Date.now()}.json`);
  const engine = new CommonSenseEngine({ storagePath: tmpFile });

  // Update Host location
  const host = engine.updateHostLocation({
    venue: 'WeWork CyberCity',
    city: 'Gurugram',
    contextType: 'pitch_session',
    network: 'WeWork-Guest-5G'
  });

  assert.equal(host.venue, 'WeWork CyberCity');
  assert.equal(host.contextType, 'pitch_session');

  // Record connected remote device (e.g. mobile companion on Cloudflare Tunnel)
  const client = engine.recordClientDevice({
    deviceId: 'iphone_15_pro',
    name: "User's iPhone 15 Pro",
    ip: '104.28.192.1',
    location: 'CyberCity Bay 4',
    isRemote: true,
    connectedVia: 'Cloudflare Tunnel'
  });

  assert.equal(client.isRemote, true);
  assert.equal(client.connectedVia, 'Cloudflare Tunnel');

  const spatial = engine.getSpatialContext();
  assert.equal(spatial.activeClientsCount, 1);
  assert.equal(spatial.isRemoteConnected, true);
  assert.ok(spatial.summary.includes('WeWork CyberCity'));
  assert.ok(spatial.summary.includes("User's iPhone 15 Pro"));

  try { fs.unlinkSync(tmpFile); } catch {}
});

test('CommonSenseEngine: People Profiling & Pitch Briefing Generation', () => {
  const tmpFile = path.join(os.tmpdir(), `test_cs_people_${Date.now()}.json`);
  const engine = new CommonSenseEngine({ storagePath: tmpFile });

  // Verify default seeded Shivam dossier
  const shivam = engine.getPerson('Shivam');
  assert.ok(shivam, 'Shivam dossier should exist');
  assert.equal(shivam.company, 'Vorssaint Technologies');
  assert.ok(shivam.articles.length >= 2);
  assert.ok(shivam.problemsSolved.length >= 2);

  // Generate pitch briefing tailored to Shivam
  const briefing = engine.generatePitchBriefing('Shivam');
  assert.equal(briefing.found, true);
  assert.ok(briefing.pitchSpeech.includes('Shivam'));
  assert.ok(briefing.pitchSpeech.includes('CEO of Vorssaint Technologies'));
  assert.ok(briefing.pitchSpeech.includes('article') || briefing.pitchSpeech.includes('months ago'));
  assert.ok(briefing.talkingPoints.length > 0);

  // Register a new pitch prospect
  const newProspect = engine.registerPerson({
    name: 'Ananya Roy',
    title: 'VP of Engineering',
    company: 'Apex Robotics',
    relation: 'Pitch Meeting Attendee',
    articles: [
      { title: 'Deterministic Edge Inference for Robotics', date: '3 months ago', summary: 'Need for local sub-10ms neural execution.' }
    ],
    problemsSolved: [
      'Eliminates reliance on cloud APIs with local RTX neural execution'
    ]
  });

  assert.equal(newProspect.name, 'Ananya Roy');
  const ananyaBriefing = engine.generatePitchBriefing('Ananya Roy');
  assert.ok(ananyaBriefing.pitchSpeech.includes('VP of Engineering of Apex Robotics'));
  assert.ok(ananyaBriefing.pitchSpeech.includes('Deterministic Edge Inference'));

  try { fs.unlinkSync(tmpFile); } catch {}
});

test('CommonSenseEngine: Social Graph & Relative Recognition', () => {
  const tmpFile = path.join(os.tmpdir(), `test_cs_social_${Date.now()}.json`);
  const engine = new CommonSenseEngine({ storagePath: tmpFile });

  // Lookup seeded relative
  const rajesh = engine.lookupSocialContact('Rajesh');
  assert.ok(rajesh, 'Should find Uncle Rajesh in social graph');
  assert.equal(rajesh.category, 'family');

  // Register a new contact from social followings
  engine.registerSocialContact({
    name: 'Priya Sharma',
    relation: 'Cousin (Maternal)',
    category: 'family',
    socials: { instagram: '@priya_sharma_art' },
    notes: 'Visiting this weekend from Bengaluru.'
  });

  const priya = engine.lookupSocialContact('priya');
  assert.ok(priya);
  assert.equal(priya.relation, 'Cousin (Maternal)');

  try { fs.unlinkSync(tmpFile); } catch {}
});

test('CommonSenseEngine: Ambient Observation & Curiosity "Gossip" Loop', () => {
  const tmpFile = path.join(os.tmpdir(), `test_cs_gossip_${Date.now()}.json`);
  const engine = new CommonSenseEngine({ storagePath: tmpFile });

  // 1. Known person quote tracking
  const obs1 = engine.observeUtterance('Hey Shivam, we are talking about your AI infrastructure today.');
  assert.equal(obs1.recognized, true);
  const shivam = engine.getPerson('Shivam');
  assert.ok(shivam.heardQuotes.length > 0);

  // 2. Unknown person introduced in meeting/pitch
  const obs2 = engine.observeUtterance('I would like you to meet Dr Vikram from Quantum Labs.');
  assert.equal(obs2.recognized, false);
  assert.equal(engine.gossipQueue.length, 1);
  assert.equal(engine.gossipQueue[0].candidateName, 'Dr Vikram');

  // 3. Debrief question generation
  const debrief = engine.getNextGossipDebrief();
  assert.ok(debrief);
  assert.ok(debrief.question.includes('Dr Vikram'));

  // 4. User says: "leave it he is not that important"
  const dismissedResult = engine.resolveGossip('Dr Vikram', 'Leave it, he is not that important.');
  assert.equal(dismissedResult.status, 'dismissed');
  assert.equal(engine.gossipQueue.length, 0);

  // Verify Dr Vikram is registered as dismissed and not prompted again
  const vikram = engine.getPerson('Dr Vikram');
  assert.ok(vikram);
  assert.equal(vikram.importance, 'dismissed');

  // If introduced again, it must not be added to gossip queue
  engine.observeUtterance('Here is Dr Vikram again.');
  assert.equal(engine.gossipQueue.length, 0);

  // 5. Positive enrichment when user shares info
  engine.observeUtterance('We are speaking with Siddharth regarding edge sensors.');
  assert.equal(engine.gossipQueue.length, 1);
  const saveResult = engine.resolveGossip('Siddharth', 'He is the CTO of IoT Dynamics and interested in our local speech agent.');
  assert.equal(saveResult.status, 'saved');
  const siddharth = engine.getPerson('Siddharth');
  assert.ok(siddharth);
  assert.equal(siddharth.importance, 'normal');
  assert.ok(siddharth.notes.includes('IoT Dynamics'));

  try { fs.unlinkSync(tmpFile); } catch {}
});

test('CommonSenseEngine: LLM Prompt Context Formatting', () => {
  const tmpFile = path.join(os.tmpdir(), `test_cs_prompt_${Date.now()}.json`);
  const engine = new CommonSenseEngine({ storagePath: tmpFile });

  const promptContext = engine.formatCommonSensePromptContext();
  assert.ok(promptContext.includes('[Mave Common Sense & Ambient Social Radar]'));
  assert.ok(promptContext.includes('Current Physical Context:'));
  assert.ok(promptContext.includes('Shivam'));
  assert.ok(promptContext.includes('Vorssaint Technologies'));

  try { fs.unlinkSync(tmpFile); } catch {}
});
