'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');

const { validate } = require('../src/main/plugins/registry');
const householdPlugin = require('../src/main/plugins/builtin/core_household');
const mobilePlugin = require('../src/main/plugins/builtin/mobile_devices');
const visionPlugin = require('../src/main/plugins/builtin/vision_perception');
const securityPlugin = require('../src/main/plugins/builtin/security_shield');
const { getMaveDropEngine, MaveDropEngine } = require('../src/main/remote/mavedrop');
const { MobileWebServer } = require('../src/main/remote/web');

const ctx = {
  confirm: async () => true,
  log: () => {},
};

// =========================================================================
// 1. Ghost AI Core Household & Smart Appliance Automation Tests
// =========================================================================
test('core_household plugin exports valid tools', () => {
  assert.ok(Array.isArray(householdPlugin));
  assert.equal(householdPlugin.length, 3);

  for (const tool of householdPlugin) {
    const error = validate(tool);
    assert.equal(error, null, `Tool ${tool.name} failed validation: ${error}`);
  }
});

test('operate_home_appliance controls thermostat, vacuum, purifier, and smart plugs', async () => {
  const opTool = householdPlugin.find((t) => t.name === 'operate_home_appliance');
  assert.ok(opTool);

  // Thermostat
  const thermRes = await opTool.run({
    appliance_type: 'thermostat',
    action: 'set_temperature',
    parameters: { target_temperature: 21.5, mode: 'cool' },
  }, ctx);
  assert.ok(thermRes.includes('Thermostat'));
  assert.ok(thermRes.includes('21.5°C'));

  // Robot Vacuum
  const vacRes = await opTool.run({
    appliance_type: 'robot_vacuum',
    action: 'start_cleaning',
    parameters: { target_room: 'Living Room' },
  }, ctx);
  assert.ok(vacRes.includes('Robot Vacuum'));
  assert.ok(vacRes.includes('cleaning'));

  // Air Purifier
  const purRes = await opTool.run({
    appliance_type: 'air_purifier',
    action: 'turn_on',
    parameters: { mode: 'auto' },
  }, ctx);
  assert.ok(purRes.includes('Air Purifier'));
  assert.ok(purRes.includes('ON'));

  // Smart Plug
  const plugRes = await opTool.run({
    appliance_type: 'smart_plug',
    action: 'turn_on',
    parameters: { device_name: 'Espresso Machine' },
  }, ctx);
  assert.ok(plugRes.includes('Smart Plug'));
  assert.ok(plugRes.includes('ON'));
});

test('get_household_status_and_todos renders living household dashboard', async () => {
  const dashTool = householdPlugin.find((t) => t.name === 'get_household_status_and_todos');
  assert.ok(dashTool);

  const res = await dashTool.run({}, ctx);
  assert.ok(res.includes('GHOST AI CORE COMPUTER'));
  assert.ok(res.includes('Connected Appliances'));
  assert.ok(res.includes('Household To-Dos'));
  assert.ok(res.includes('Pantry & Restock'));
});

test('schedule_household_routine triggers morning and evening modes', async () => {
  const routineTool = householdPlugin.find((t) => t.name === 'schedule_household_routine');
  assert.ok(routineTool);

  const morningRes = await routineTool.run({
    routine_name: 'morning',
    trigger_now: true,
  }, ctx);
  assert.ok(morningRes.includes('Morning Routine Executed'));

  const eveningRes = await routineTool.run({
    routine_name: 'evening',
    trigger_now: true,
  }, ctx);
  assert.ok(eveningRes.includes('Evening Wind-Down Executed'));
});

// =========================================================================
// 2. Spatial Vision Perception & Point-and-Ask Intelligence Tests
// =========================================================================
test('point_and_ask_camera identifies objects from spatial pointer/finger coordinates', async () => {
  const pointTool = visionPlugin.find((t) => t.name === 'point_and_ask_camera');
  assert.ok(pointTool);

  // Plant inquiry
  const plantRes = await pointTool.run({
    user_question: 'Is this plant healthy and watered?',
    pointed_coordinates: { x: 420, y: 780 },
  }, ctx);
  assert.ok(plantRes.includes('POINT-AND-ASK SPATIAL IDENTIFICATION'));
  assert.ok(plantRes.includes('Monstera'));

  // Cable inquiry
  const cableRes = await pointTool.run({
    user_question: 'What is this cable plugged into my monitor?',
    pointed_coordinates: { x: 960, y: 540 },
  }, ctx);
  assert.ok(cableRes.includes('HDMI'));

  // Medicine inquiry
  const medRes = await pointTool.run({
    user_question: 'What medicine tablet is this and is it expired?',
    pointed_coordinates: { x: 300, y: 200 },
  }, ctx);
  assert.ok(medRes.includes('Ibuprofen'));
});

test('analyze_camera_feed and inspect_room_surroundings audit environment and safety', async () => {
  const feedTool = visionPlugin.find((t) => t.name === 'analyze_camera_feed');
  const hazardTool = visionPlugin.find((t) => t.name === 'inspect_room_surroundings');
  assert.ok(feedTool);
  assert.ok(hazardTool);

  const feedRes = await feedTool.run({ camera_source: 'phone_camera' }, ctx);
  assert.ok(feedRes.includes('LIVE CAMERA SURROUNDINGS ANALYSIS'));
  assert.ok(feedRes.includes('Occupancy'));

  const hazardRes = await hazardTool.run({ room_name: 'Kitchen & Living Area' }, ctx);
  assert.ok(hazardRes.includes('SURROUNDINGS & SAFETY HAZARD AUDIT'));
  assert.ok(hazardRes.includes('ALL CLEAR'));
});

// =========================================================================
// 3. Autonomous Emergency Safety Shield Tests
// =========================================================================
test('manage_emergency_contacts persists, lists, and tests contacts directory', async () => {
  const contactTool = securityPlugin.find((t) => t.name === 'manage_emergency_contacts');
  assert.ok(contactTool);

  // Add contact
  const addRes = await contactTool.run({
    action: 'add_contact',
    name: 'Dr. John Doe',
    relationship: 'Family Physician',
    phone_number: '+1-555-8822',
    telegram_id: '@dr_doe_care',
    priority: 1,
  }, ctx);
  assert.ok(addRes.includes('EMERGENCY CONTACT REGISTERED'));
  assert.ok(addRes.includes('Dr. John Doe'));

  // List contacts
  const listRes = await contactTool.run({ action: 'list_contacts' }, ctx);
  assert.ok(listRes.includes('REGISTERED EMERGENCY CONTACTS'));
  assert.ok(listRes.includes('Dr. John Doe'));

  // Test dispatch
  const testRes = await contactTool.run({ action: 'test_dispatch' }, ctx);
  assert.ok(testRes.includes('EMERGENCY CONTACT TEST DISPATCH'));

  // Remove contact cleanup
  await contactTool.run({ action: 'remove_contact', name: 'Dr. John Doe' }, ctx);
});

test('predict_and_dispatch_emergency dispatches multi-channel alerts for critical incidents', async () => {
  const emTool = securityPlugin.find((t) => t.name === 'predict_and_dispatch_emergency');
  assert.ok(emTool);

  const res = await emTool.run({
    incident_type: 'fall_detected',
    incident_details: 'Sudden high-velocity vertical descent followed by 180s stillness on floor',
  }, ctx);

  assert.ok(res.includes('AUTONOMOUS EMERGENCY DISPATCH PROTOCOL ACTIVATED'));
  assert.ok(res.includes('FALL DETECTED'));
  assert.ok(res.includes('DISPATCHED TO'));
});

// =========================================================================
// 4. Google Artemis Android & iPhone-Use iOS Control Tests
// =========================================================================
test('mobile_devices plugin exports valid tools', () => {
  assert.ok(Array.isArray(mobilePlugin));
  assert.equal(mobilePlugin.length, 7);

  for (const tool of mobilePlugin) {
    const error = validate(tool);
    assert.equal(error, null, `Tool ${tool.name} failed validation: ${error}`);
  }
});

test('artemis_control_android enforces network permission gate', async () => {
  const artemisTool = mobilePlugin.find((t) => t.name === 'artemis_control_android');
  assert.ok(artemisTool);

  // Permission false -> must reject
  await assert.rejects(async () => {
    await artemisTool.run({
      device_ip_or_serial: '192.168.1.105',
      action: 'tap',
      permission_granted: false,
      parameters: { x: 500, y: 1000 },
    }, ctx);
  }, /Permission denied/);

  // Permission true -> executes
  const res = await artemisTool.run({
    device_ip_or_serial: '192.168.1.105',
    action: 'tap',
    permission_granted: true,
    parameters: { x: 500, y: 1000 },
  }, ctx);

  assert.ok(res.includes('GOOGLE ARTEMIS · ANDROID AGENT CONTROLLER'));
  assert.ok(res.includes('192.168.1.105'));
  assert.ok(res.includes('tap'));
});

test('artemis_discover_devices reports local network ADB status and wireless guide', async () => {
  const discTool = mobilePlugin.find((t) => t.name === 'artemis_discover_devices');
  assert.ok(discTool);

  const res = await discTool.run({}, ctx);
  assert.ok(res.includes('ARTEMIS'));
});

test('iphone_use_control supports wired USB and wireless Wi-Fi modes', async () => {
  const iphoneTool = mobilePlugin.find((t) => t.name === 'iphone_use_control');
  assert.ok(iphoneTool);

  // Wireless Wi-Fi tap
  const wirelessRes = await iphoneTool.run({
    connection_mode: 'wireless',
    device_host_or_udid: '192.168.1.115',
    action: 'tap',
    parameters: { x: 200, y: 400 },
  }, ctx);
  assert.ok(wirelessRes.includes('IPHONE-USE'));
  assert.ok(wirelessRes.includes('WIRELESS'));
  assert.ok(wirelessRes.includes('192.168.1.115'));

  // Wired USB scroll
  const wiredRes = await iphoneTool.run({
    connection_mode: 'wired',
    device_host_or_udid: '00008101-001234567890',
    action: 'scroll',
    parameters: { direction: 'down' },
  }, ctx);
  assert.ok(wiredRes.includes('WIRED'));
  assert.ok(wiredRes.includes('usbmuxd'));
});

test('iphone_discover_devices checks usbmuxd and local runners', async () => {
  const discTool = mobilePlugin.find((t) => t.name === 'iphone_discover_devices');
  assert.ok(discTool);

  const res = await discTool.run({}, ctx);
  assert.ok(res.includes('IPHONE-USE DISCOVERY REPORT'));
  assert.ok(res.includes('Wired (USB)'));
  assert.ok(res.includes('Wireless (Wi-Fi)'));
});

// =========================================================================
// 5. MaveDrop Wireless File Sharing & LAN Sync Engine Tests
// =========================================================================
test('MaveDropEngine stores, lists, and transfers files peer-to-peer', () => {
  const testDropDir = path.join(os.tmpdir(), `mavedrop_test_${Date.now()}`);
  const engine = new MaveDropEngine(testDropDir);

  const testBuf = Buffer.from('Ghost AI MaveDrop P2P Transfer Payload 12345');
  const record = engine.saveReceivedFile('photo_snap.jpg', testBuf, 'iPhone 15 Pro');

  assert.equal(record.name, 'photo_snap.jpg');
  assert.equal(record.sender, 'iPhone 15 Pro');
  assert.equal(record.sizeBytes, testBuf.length);

  const files = engine.listFiles();
  assert.ok(files.length >= 1);
  assert.equal(files[0].name, 'photo_snap.jpg');

  // Clipboard sync
  engine.setClipboard('https://example.com/shared-link', 'Android Pixel');
  assert.equal(engine.getClipboard(), 'https://example.com/shared-link');

  // Device registry
  const dev = engine.registerDevice({ id: 'pixel_9_pro', name: 'Pixel 9 Pro', os: 'Android 15', ip: '192.168.1.105' });
  assert.equal(dev.name, 'Pixel 9 Pro');
  assert.equal(engine.getKnownDevices().length, 1);

  // Cleanup
  try { fs.rmSync(testDropDir, { recursive: true, force: true }); } catch {}
});

test('mavedrop_share_file and sync_clipboard_lan tools operate cleanly', async () => {
  const shareTool = mobilePlugin.find((t) => t.name === 'mavedrop_share_file');
  const recvTool = mobilePlugin.find((t) => t.name === 'mavedrop_receive_sync');
  const clipTool = mobilePlugin.find((t) => t.name === 'sync_clipboard_lan');

  assert.ok(shareTool);
  assert.ok(recvTool);
  assert.ok(clipTool);

  // Create temporary file to share
  const tempFile = path.join(os.tmpdir(), `share_test_${Date.now()}.txt`);
  fs.writeFileSync(tempFile, 'Hello from MaveDrop Wireless AirDrop!');

  const shareRes = await shareTool.run({ file_path: tempFile, target_device_name: 'iPhone' }, ctx);
  assert.ok(shareRes.includes('MAVEDROP WIRELESS AIRDROP SHARE'));
  assert.ok(shareRes.includes('share_test_'));

  const recvRes = await recvTool.run({}, ctx);
  assert.ok(recvRes.includes('MAVEDROP WIRELESS AIRDROP INBOX'));

  // Clipboard sync
  const setClipRes = await clipTool.run({ action: 'set_clipboard', text: 'MaveDrop Wi-Fi Clipboard Test' }, ctx);
  assert.ok(setClipRes.includes('LAN CLIPBOARD SYNCHRONIZED'));

  const getClipRes = await clipTool.run({ action: 'get_clipboard' }, ctx);
  assert.ok(getClipRes.includes('MaveDrop Wi-Fi Clipboard Test'));

  try { fs.unlinkSync(tempFile); } catch {}
});

// =========================================================================
// 6. MobileWebServer MaveDrop HTTP API & /drop Web UI Tests
// =========================================================================
test('MobileWebServer serves MaveDrop UI and handles P2P file uploads & clipboard sync', async () => {
  const server = new MobileWebServer({ controller: null, logger: { info: () => {}, error: () => {} }, port: 4048 });
  await server.start();

  const baseUrl = 'http://127.0.0.1:4048';

  // 1. GET /drop serves HTML UI
  const htmlRes = await fetch(`${baseUrl}/drop`);
  assert.equal(htmlRes.status, 200);
  const htmlText = await htmlRes.text();
  assert.ok(htmlText.includes('MaveDrop P2P Wireless Sharing'));
  assert.ok(htmlText.includes('Cross-Device LAN Clipboard Sync'));

  // 2. POST /api/clipboard/sync
  const clipPostRes = await fetch(`${baseUrl}/api/clipboard/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: 'Hello Mobile Web!', sender: 'Test Device' }),
  });
  const clipPostData = await clipPostRes.json();
  assert.equal(clipPostData.ok, true);

  // 3. GET /api/clipboard/sync
  const clipGetRes = await fetch(`${baseUrl}/api/clipboard/sync`);
  const clipGetData = await clipGetRes.json();
  assert.equal(clipGetData.ok, true);
  assert.equal(clipGetData.text, 'Hello Mobile Web!');

  // 4. POST /api/drop/upload (base64 JSON)
  const dropUploadRes = await fetch(`${baseUrl}/api/drop/upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filename: 'airdrop_test_file.txt',
      fileBase64: Buffer.from('AirDrop Content 12345').toString('base64'),
      sender: 'iPhone 15',
    }),
  });
  const dropUploadData = await dropUploadRes.json();
  assert.equal(dropUploadData.ok, true);
  assert.equal(dropUploadData.file.name, 'airdrop_test_file.txt');

  // 5. GET /api/drop/files
  const dropFilesRes = await fetch(`${baseUrl}/api/drop/files`);
  const dropFilesData = await dropFilesRes.json();
  assert.equal(dropFilesData.ok, true);
  assert.ok(Array.isArray(dropFilesData.files));
  assert.ok(dropFilesData.files.some((f) => f.name === 'airdrop_test_file.txt'));

  // 6. GET /api/drop/download
  const dropDownRes = await fetch(`${baseUrl}/api/drop/download?file=airdrop_test_file.txt`);
  assert.equal(dropDownRes.status, 200);
  const downContent = await dropDownRes.text();
  assert.equal(downContent, 'AirDrop Content 12345');

  // 7. POST /api/drop/devices/register
  const regRes = await fetch(`${baseUrl}/api/drop/devices/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Galaxy S24 Ultra', os: 'Android 14', type: 'phone' }),
  });
  const regData = await regRes.json();
  assert.equal(regData.ok, true);
  assert.equal(regData.device.name, 'Galaxy S24 Ultra');

  // 8. GET /api/drop/devices
  const devRes = await fetch(`${baseUrl}/api/drop/devices`);
  const devData = await devRes.json();
  assert.equal(devData.ok, true);
  assert.ok(devData.devices.some((d) => d.name === 'Galaxy S24 Ultra'));

  server.stop();
});
