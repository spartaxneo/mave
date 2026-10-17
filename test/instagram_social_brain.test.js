'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { InstagramSocialBrain, getInstagramSocialBrain } = require('../src/main/social/instagram');
const instagramPlugin = require('../src/main/plugins/builtin/instagram');
const { validate } = require('../src/main/plugins/registry');
const { MemoryStore } = require('../src/main/memory');

function createMockSettings(initial = {}) {
  const store = {
    instagramUsername: 'mave.ai',
    instagramStrictNoFollow: true,
    instagramDeduceReelIntent: true,
    instagramAutoLearnTrends: true,
    ...initial
  };
  return {
    get(k) { return store[k]; },
    update(patch) { Object.assign(store, patch); return store; },
    _store: store
  };
}

test('InstagramSocialBrain enforces strict zero-following policy', () => {
  const settings = createMockSettings({ instagramStrictNoFollow: true });
  const brain = new InstagramSocialBrain({ settings });

  assert.equal(brain.isStrictNoFollow(), true);

  const profile = brain.getProfile();
  assert.equal(profile.followingCount, 0);

  // Attempting to follow an account must be blocked
  const res = brain.followUser('tech_influencer');
  assert.equal(res.ok, false);
  assert.equal(res.blocked, true);
  assert.ok(res.message.includes('STRICT NO-FOLLOW POLICY ENFORCED'));

  // Following count remains 0
  const updatedProfile = brain.getProfile();
  assert.equal(updatedProfile.followingCount, 0);
});

test('InstagramSocialBrain detects reel URLs and extracts shortcodes', () => {
  const brain = new InstagramSocialBrain();

  assert.equal(brain.containsReelUrl('Check this out: https://www.instagram.com/reel/C8qXYZ123/?igsh=abc'), true);
  assert.equal(brain.containsReelUrl('https://instagram.com/reels/D9kLM456/'), true);
  assert.equal(brain.containsReelUrl('https://www.instagram.com/p/B1aBC789/'), true);
  assert.equal(brain.containsReelUrl('Hey Mave, what is the weather today?'), false);

  assert.equal(brain.extractReelId('https://www.instagram.com/reel/C8qXYZ123/?utm_source=ig_web'), 'C8qXYZ123');
  assert.equal(brain.extractReelId('https://instagram.com/reels/D9kLM456/'), 'D9kLM456');
});

test('InstagramSocialBrain deduces IMPLEMENT_IN_MAVE intent and generates intuitive reply', async () => {
  const mockFetch = async () => ({
    ok: true,
    json: async () => ({
      title: 'Built a sleek glassmorphic desktop widget with smooth floating animation and reactive sound in Python and React! #coding #ui #widget',
      author_name: 'dev_creatives',
      author_url: 'https://instagram.com/dev_creatives',
      thumbnail_url: 'https://cdn.example.com/thumb.jpg'
    })
  });

  const brain = new InstagramSocialBrain({ fetchImpl: mockFetch });
  const metadata = await brain.fetchReelMetadata('https://www.instagram.com/reel/C9aXYZ/');

  assert.equal(metadata.shortcode, 'C9aXYZ');
  assert.equal(metadata.author, 'dev_creatives');

  const deduction = brain.deduceIntent(metadata, 'Look at this animation');
  assert.equal(deduction.intentType, 'IMPLEMENT_IN_MAVE');

  const reply = brain.generateHumanReply(metadata, deduction, 'Look at this animation');
  assert.ok(reply.includes('Oh! Did you send me this reel to implement something like this in me?'));
  assert.ok(reply.includes('@dev_creatives'));
  assert.ok(reply.includes('Should I build this directly into Mave?'));
});

test('InstagramSocialBrain deduces AUTOMATE_FOR_USER intent for productivity workflows', async () => {
  const metadata = {
    shortcode: 'Auto123',
    title: 'How to automate sorting your downloads folder and sending daily spreadsheet reports #productivity #hack #automation',
    author: 'office_ninja'
  };

  const brain = new InstagramSocialBrain();
  const deduction = brain.deduceIntent(metadata, '');

  assert.equal(deduction.intentType, 'AUTOMATE_FOR_USER');
  const reply = brain.generateHumanReply(metadata, deduction);
  assert.ok(reply.includes('Did you send this reel so I can automate this workflow for you?'));
});

test('InstagramSocialBrain matches custom taught rules', () => {
  const brain = new InstagramSocialBrain();
  brain.teachCustomRule('swiftui|ios_design', 'IMPLEMENT_IN_MAVE', 'Design native iOS-inspired controls for Mave');

  const metadata = {
    shortcode: 'Swift123',
    title: 'New SwiftUI navigation stack fluidity #swiftui',
    author: 'ios_dev'
  };

  const deduction = brain.deduceIntent(metadata, '');
  assert.equal(deduction.intentType, 'IMPLEMENT_IN_MAVE');
  assert.equal(deduction.primaryReason, 'Design native iOS-inspired controls for Mave');
});

test('InstagramSocialBrain learns trends and stores them into memory without following', () => {
  const tempMemory = path.join(os.tmpdir(), `test_memory_insta_${Date.now()}.json`);
  try {
    const memory = new MemoryStore(tempMemory);
    const brain = new InstagramSocialBrain({ memoryStore: memory });

    const trend = brain.learnTrend('ui_motion', 'Reactive neon cursor glow on hover');
    assert.equal(trend.niche, 'ui_motion');

    const recalled = memory.recall('cursor glow');
    assert.ok(recalled.length > 0);
    assert.ok(recalled[0].fact.includes('Reactive neon cursor glow'));

    const profile = brain.getProfile();
    assert.equal(profile.followingCount, 0); // Still 0
  } finally {
    if (fs.existsSync(tempMemory)) fs.unlinkSync(tempMemory);
  }
});

test('instagram builtin plugin tools have valid schemas and execute properly', async () => {
  assert.ok(Array.isArray(instagramPlugin));
  assert.equal(instagramPlugin.length, 4);

  for (const tool of instagramPlugin) {
    const error = validate(tool);
    assert.equal(error, null, `Tool ${tool.name} must be valid: ${error}`);
  }

  const analyzeTool = instagramPlugin.find((t) => t.name === 'analyze_instagram_reel');
  const ruleTool = instagramPlugin.find((t) => t.name === 'teach_reel_intent_rule');
  const profileTool = instagramPlugin.find((t) => t.name === 'instagram_manage_profile');
  const trendTool = instagramPlugin.find((t) => t.name === 'instagram_explore_trends');

  const ctx = {
    settings: createMockSettings(),
    log: () => {}
  };

  // Test profile tool
  const profRes = await profileTool.run({ action: 'view_profile' }, ctx);
  assert.ok(profRes.includes('MAVE INSTAGRAM SOCIAL PROFILE'));
  assert.ok(profRes.includes('Strict No-Follow Policy Active'));

  // Test follow rejection
  const followRes = await profileTool.run({ action: 'follow_account', target_username: 'random_user' }, ctx);
  assert.ok(followRes.includes('STRICT NO-FOLLOW POLICY ENFORCED'));

  // Test rule teaching tool
  const ruleRes = await ruleTool.run({
    trigger: 'voice_clone|sound_effects',
    intent_type: 'IMPLEMENT_IN_MAVE',
    action_prompt: 'Integrate this voice style into Kokoro neural engine'
  }, ctx);
  assert.ok(ruleRes.includes('REEL INTENT RULE LEARNED & SAVED'));

  // Test trend exploration tool
  const trendRes = await trendTool.run({ niche: 'ai_tools' }, ctx);
  assert.ok(trendRes.includes('INSTAGRAM TREND LEARNED'));
  assert.ok(trendRes.includes('Zero accounts followed'));

  // Test analyze reel tool
  const reelRes = await analyzeTool.run({
    reel_url: 'https://www.instagram.com/reel/C9aXYZ123/',
    user_comment: 'Can you add this widget to Mave?'
  }, ctx);
  assert.ok(reelRes.includes('Did you send me this reel to implement something like this in me?'));
});
