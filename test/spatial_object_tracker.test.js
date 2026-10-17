'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  SpatialObjectTracker,
  getSpatialObjectTracker,
  humanizeElapsed,
  normalizeObjectName,
  matchLostItemQuery,
} = require('../src/main/spatial/object_tracker');

const {
  FamilyHabitTracker,
  getFamilyHabitTracker,
} = require('../src/main/family/family_tracker');

const spatialPlugins = require('../src/main/plugins/builtin/spatial_tracker');

test('humanizeElapsed formats relative timestamps accurately', () => {
  const now = 1000000000000;
  assert.equal(humanizeElapsed(now - 10000, now), 'just a few seconds ago');
  assert.equal(humanizeElapsed(now - 65000, now), 'about 1 minute ago');
  assert.equal(humanizeElapsed(now - 15 * 60 * 1000, now), 'about 15 minutes ago');
  assert.equal(humanizeElapsed(now - 3600 * 1000, now), 'about 1 hour ago');
  assert.equal(humanizeElapsed(now - 4 * 3600 * 1000, now), 'about 4 hours ago');
  assert.equal(humanizeElapsed(now - 25 * 3600 * 1000, now), 'yesterday');
  assert.equal(humanizeElapsed(now - 72 * 3600 * 1000, now), '3 days ago');
});

test('normalizeObjectName maps common aliases to canonical keys', () => {
  assert.equal(normalizeObjectName('car keys'), 'keys');
  assert.equal(normalizeObjectName('house keys'), 'keys');
  assert.equal(normalizeObjectName('my wallet'), 'wallet');
  assert.equal(normalizeObjectName('reading glasses'), 'glasses');
  assert.equal(normalizeObjectName('the smartphone'), 'phone');
  assert.equal(normalizeObjectName('airpods'), 'headphones');
  assert.equal(normalizeObjectName('laptop bag'), 'backpack');
  assert.equal(normalizeObjectName('apple watch'), 'watch');
});

test('matchLostItemQuery detects conversational lost item queries', () => {
  const q1 = matchLostItemQuery('where did i keep my keys?');
  assert.equal(q1.isQuery, true);
  assert.equal(q1.object, 'keys');

  const q2 = matchLostItemQuery('where are my glasses?');
  assert.equal(q2.isQuery, true);
  assert.equal(q2.object, 'glasses');

  const q3 = matchLostItemQuery('where is my wallet');
  assert.equal(q3.isQuery, true);
  assert.equal(q3.object, 'wallet');

  const q4 = matchLostItemQuery('have you seen my phone?');
  assert.equal(q4.isQuery, true);
  assert.equal(q4.object, 'phone');

  const q5 = matchLostItemQuery('where did i leave my backpack?');
  assert.equal(q5.isQuery, true);
  assert.equal(q5.object, 'backpack');

  const q6 = matchLostItemQuery('what is the weather today?');
  assert.equal(q6.isQuery, false);
});

test('SpatialObjectTracker initializes defaults, records sightings, and locates items', () => {
  const tmpFile = path.join(os.tmpdir(), `test_spatial_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.json`);
  const tracker = new SpatialObjectTracker(tmpFile);

  // Should have default keys, wallet, glasses, etc.
  const keysLoc = tracker.locateItem('keys');
  assert.equal(keysLoc.found, true);
  assert.equal(keysLoc.object, 'keys');
  assert.match(keysLoc.location, /kitchen counter/i);
  assert.match(keysLoc.description, /kitchen counter/i);

  const walletLoc = tracker.locateItem('wallet');
  assert.equal(walletLoc.found, true);
  assert.match(walletLoc.room, /home office/i);

  // Record a new sighting
  const newSighting = tracker.recordSighting({
    object: 'car keys',
    location: 'on the hallway entry console beside the ceramic dish',
    room: 'Hallway',
    cameraSource: 'webcam',
    confidence: 0.98,
    lastSeenBy: 'Primary User',
  });
  assert.equal(newSighting.object, 'keys');

  // Should now return the updated position
  const updatedLoc = tracker.locateItem('car keys');
  assert.equal(updatedLoc.found, true);
  assert.match(updatedLoc.location, /entry console/i);
  assert.equal(updatedLoc.room, 'Hallway');

  // Listing items
  const items = tracker.listTrackedItems();
  assert.ok(items.length >= 5);
  assert.ok(items.some((i) => i.object === 'keys'));

  // Clean up
  try { if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile); } catch {}
});

test('SpatialObjectTracker runs asynchronous non-blocking room scan', async () => {
  const tmpFile = path.join(os.tmpdir(), `test_spatial_scan_${Date.now()}.json`);
  const tracker = new SpatialObjectTracker(tmpFile);

  const scan = await tracker.scanSurroundings('webcam', 'Living Room');
  assert.equal(scan.cameraSource, 'webcam');
  assert.ok(scan.itemsDetected > 0);
  assert.ok(Array.isArray(scan.items));

  try { if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile); } catch {}
});

test('FamilyHabitTracker isolates profiles, registers devices, and adapts habits', () => {
  const tmpFile = path.join(os.tmpdir(), `test_family_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.json`);
  const family = new FamilyHabitTracker(tmpFile);

  // Verify default members
  const members = family.listMembers();
  assert.ok(members.length >= 3);
  assert.ok(members.some((m) => m.id === 'admin'));
  assert.ok(members.some((m) => m.id === 'spouse'));
  assert.ok(members.some((m) => m.id === 'kid'));

  // Register device for kid
  const dev = family.registerDevice('kid', {
    name: 'Alex Gaming Laptop',
    type: 'laptop',
    os: 'Windows 11',
    ip: '192.168.1.135',
  });
  assert.equal(dev.name, 'Alex Gaming Laptop');

  const kidMember = family.getMember('kid');
  assert.ok(kidMember.devices.some((d) => d.name === 'Alex Gaming Laptop'));

  // Record a habit
  const habit = family.recordHabit('admin', {
    name: 'Evening Tech Reading',
    timeWindow: '21:00 - 22:00',
    description: 'Reads research papers on transformers and diffusion models',
    frequency: 'Daily',
  });
  assert.equal(habit.name, 'Evening Tech Reading');

  // Record learning
  const learning = family.recordLearning('admin', 'Prefers keyboard-driven shortcuts over clicking.');
  assert.ok(learning);
  assert.equal(learning.fact, 'Prefers keyboard-driven shortcuts over clicking.');

  // Test continuous adaptation
  const adaptations = family.adaptFromInteraction('kid', 'I always study science puzzles in the afternoon');
  assert.ok(adaptations.length > 0);
  assert.ok(adaptations.some((a) => a.includes('Habit adapted')));

  // Profile summary output
  const summary = family.getProfileSummary('kid');
  assert.match(summary, /ALEX/i);
  assert.match(summary, /Connected Devices/i);
  assert.match(summary, /Daily Habits/i);

  // Clean up
  try { if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile); } catch {}
});

test('Spatial Tracker builtin plugin tools have valid schemas and execute successfully', async () => {
  assert.ok(Array.isArray(spatialPlugins));
  assert.equal(spatialPlugins.length, 4);

  const locateTool = spatialPlugins.find((p) => p.name === 'locate_lost_item');
  const scanTool = spatialPlugins.find((p) => p.name === 'scan_surroundings_for_items');
  const listTool = spatialPlugins.find((p) => p.name === 'list_tracked_items');
  const familyTool = spatialPlugins.find((p) => p.name === 'manage_family_habits_and_devices');

  assert.ok(locateTool);
  assert.ok(scanTool);
  assert.ok(listTool);
  assert.ok(familyTool);

  const mockCtx = {
    log: () => {},
  };

  // Run locate_lost_item
  const locateRes = await locateTool.run({ item_name: 'keys' }, mockCtx);
  assert.match(locateRes, /SPATIAL OBJECT LOCALIZATION/i);
  assert.match(locateRes, /kitchen counter/i);

  // Run scan_surroundings_for_items
  const scanRes = await scanTool.run({ camera_source: 'webcam', room_hint: 'Home Office' }, mockCtx);
  assert.match(scanRes, /SPATIAL VISION SWEEP COMPLETE/i);

  // Run list_tracked_items
  const listRes = await listTool.run({}, mockCtx);
  assert.match(listRes, /CURRENT SPATIAL OBJECT INVENTORY/i);

  // Run family tool queries
  const membersListRes = await familyTool.run({ action: 'list_members' }, mockCtx);
  assert.match(membersListRes, /REGISTERED FAMILY MEMBERS/i);

  const profileRes = await familyTool.run({ action: 'query_profile', user_id: 'admin' }, mockCtx);
  assert.match(profileRes, /FAMILY MEMBER PROFILE/i);

  const habitRes = await familyTool.run({
    action: 'record_habit',
    user_id: 'admin',
    habit_data: { name: 'Morning Walk', time_window: '06:00 - 06:45', description: 'Brisk outdoor walk', frequency: 'Daily' },
  }, mockCtx);
  assert.match(habitRes, /HABIT LOGGED/i);
});
