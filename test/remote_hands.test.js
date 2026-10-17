'use strict';
require('./electron-stub');
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  RemoteHandsManager,
  RemoteScreenTarget,
  getRemoteHandsManager,
  FALLBACK_PNG,
} = require('../src/main/remote/hands');
const { ComputerExecutor } = require('../src/main/computer');
const remoteHandsPlugin = require('../src/main/plugins/builtin/remote_hands');

test('RemoteHandsManager registers and manages remote devices', () => {
  const mgr = new RemoteHandsManager();

  const dev = mgr.registerDevice({
    id: 'macbook_alex',
    name: "Alex's MacBook Pro",
    type: 'laptop',
    platform: 'macos',
    ip: '192.168.1.150',
    width: 2560,
    height: 1600,
  });

  assert.equal(dev.id, 'macbook_alex');
  assert.equal(dev.name, "Alex's MacBook Pro");
  assert.equal(dev.platform, 'macos');
  assert.equal(dev.bounds.width, 2560);
  assert.equal(dev.bounds.height, 1600);

  const found = mgr.getDevice("alex's macbook pro");
  assert.ok(found);
  assert.equal(found.id, 'macbook_alex');

  const list = mgr.listDevices();
  assert.equal(list.length, 1);
  assert.equal(list[0].id, 'macbook_alex');
});

test('RemoteHandsManager enforces permission handshake and security lifecycle', () => {
  const mgr = new RemoteHandsManager();
  const dev = mgr.registerDevice({ id: 'dad_phone', name: "Dad's Phone", platform: 'android' });

  // 1. Initially no permission
  assert.equal(mgr.isPermissionGranted('dad_phone', 'screen_control'), false);

  // 2. Request permission (generates code)
  const req = mgr.requestPermission('dad_phone', {
    durationMinutes: 30,
    reason: 'Install messaging app',
  });
  assert.equal(req.ok, true);
  assert.equal(req.status, 'pending');
  assert.match(req.grantCode, /^[0-9]{6}$/);
  assert.equal(dev.permission.status, 'pending');

  // 3. Reject action when permission is still pending
  assert.equal(mgr.isPermissionGranted('dad_phone', 'screen_control'), false);

  // 4. Grant permission with valid code
  const grantRes = mgr.grantPermission('dad_phone', {
    durationMinutes: 60,
    code: req.grantCode,
    scopes: ['screen_read', 'screen_control', 'keyboard'],
  });
  assert.equal(grantRes.ok, true);
  assert.equal(grantRes.status, 'granted');
  assert.equal(mgr.isPermissionGranted('dad_phone', 'screen_control'), true);
  assert.equal(mgr.isPermissionGranted('dad_phone', 'keyboard'), true);
  assert.equal(mgr.isPermissionGranted('dad_phone', 'shell'), false); // shell was not granted

  // 5. Revoke permission
  const revokeRes = mgr.revokePermission('dad_phone');
  assert.equal(revokeRes.status, 'revoked');
  assert.equal(mgr.isPermissionGranted('dad_phone', 'screen_control'), false);
});

test('RemoteScreenTarget maps coordinates and captures screen frames correctly', async () => {
  const mgr = new RemoteHandsManager();
  const dev = mgr.registerDevice({
    id: 'tablet_1',
    name: 'Living Room Tablet',
    width: 2000,
    height: 1000,
  });

  mgr.grantPermission('tablet_1', { scopes: ['screen_read', 'screen_control'] });

  const target = new RemoteScreenTarget(dev, mgr);
  assert.equal(target.isRemote, true);
  assert.equal(target.sent.width, 1280);
  assert.equal(target.sent.height, 640);

  // Coordinate check
  target.checkSent([100, 200]);
  assert.throws(() => target.checkSent([-5, 200]), /outside/);

  // Coordinate conversions
  const phys = target.sentToPhysical([640, 320]);
  assert.equal(phys.x, 1000);
  assert.equal(phys.y, 500);

  const sent = target.physicalToSent({ x: 1000, y: 500 });
  assert.equal(sent.x, 640);
  assert.equal(sent.y, 320);

  // Capture screen (fallback transparent PNG before live frame)
  const frame1 = await target.screenshot();
  assert.ok(Buffer.isBuffer(frame1));
  assert.ok(frame1.length > 0);

  // Push new frame
  const sampleFrame = Buffer.from('remote_screen_frame_data_xyz');
  mgr.pushScreenFrame('tablet_1', sampleFrame);

  const frame2 = await target.screenshot();
  assert.deepEqual(frame2, sampleFrame);
});

test('ComputerExecutor runs remote actions against RemoteScreenTarget without touching host input', async () => {
  const mgr = new RemoteHandsManager();
  const dev = mgr.registerDevice({ id: 'laptop_work', name: 'Work Laptop' });

  // Grant control permission
  mgr.grantPermission('laptop_work', { scopes: ['screen_read', 'screen_control', 'keyboard'] });

  const target = new RemoteScreenTarget(dev, mgr);

  const hostEvents = { moves: [], clicks: [], types: [] };
  const mockHostInput = {
    move: async (x, y) => hostEvents.moves.push([x, y]),
    click: async (b, n) => hostEvents.clicks.push([b, n]),
    type: async (t) => hostEvents.types.push(t),
  };

  const executor = new ComputerExecutor({
    input: mockHostInput,
    pointAt: async () => {},
  });

  // 1. Run screenshot on remote device
  const shotRes = await executor.run(target, 'screenshot', {}, null);
  assert.ok(Array.isArray(shotRes));

  // 2. Run click on remote device
  const clickRes = await executor.run(target, 'click', { coordinate: [100, 100] }, null);
  assert.equal(clickRes, 'OK');

  // 3. Run type on remote device
  const typeRes = await executor.run(target, 'type', { text: 'Hello Remote' }, null);
  assert.equal(typeRes, 'OK');

  // Verify that the host input was NEVER touched!
  assert.equal(hostEvents.moves.length, 0, 'Host mouse should not move');
  assert.equal(hostEvents.clicks.length, 0, 'Host mouse should not click');
  assert.equal(hostEvents.types.length, 0, 'Host keyboard should not type');

  // Verify actions were queued for the remote device
  const polled = mgr.pollActions('laptop_work');
  assert.equal(polled.length, 2);
  assert.equal(polled[0].name, 'click');
  assert.equal(polled[1].name, 'type');
  assert.equal(polled[1].input.text, 'Hello Remote');
});

test('Target switching toggles between Host PC and Remote Hands', () => {
  const mgr = new RemoteHandsManager();
  const dev = mgr.registerDevice({ id: 'pc_remote', name: 'Remote PC' });
  mgr.grantPermission('pc_remote', { scopes: ['screen_read', 'screen_control'] });

  const mockHostTarget = { id: 'host_display', isRemote: false };
  let currentTarget = mockHostTarget;
  const mockAgent = {
    target: currentTarget,
    setTarget(t) { currentTarget = t; this.target = t; },
  };

  // Switch to remote
  const remoteT = mgr.switchToRemoteTarget('pc_remote', mockAgent);
  assert.equal(currentTarget.isRemote, true);
  assert.equal(mgr.activeTargetDeviceId, 'pc_remote');

  // Switch back to host
  mgr.resetToHostTarget(mockAgent);
  assert.equal(currentTarget.isRemote, false);
  assert.equal(mgr.activeTargetDeviceId, null);
});

test('Remote Hands Plugin exports valid tools and handles permission-gated execution', async () => {
  const mgr = getRemoteHandsManager();
  mgr.registerDevice({ id: 'test_dev_plugin', name: 'Plugin Test PC' });

  const listTool = remoteHandsPlugin.find((p) => p.name === 'remote_hands_list_devices');
  const reqTool = remoteHandsPlugin.find((p) => p.name === 'remote_hands_request_permission');
  const grantTool = remoteHandsPlugin.find((p) => p.name === 'remote_hands_grant_permission');
  const actionTool = remoteHandsPlugin.find((p) => p.name === 'remote_hands_execute_action');
  const revokeTool = remoteHandsPlugin.find((p) => p.name === 'remote_hands_revoke_permission');

  assert.ok(listTool);
  assert.ok(reqTool);
  assert.ok(grantTool);
  assert.ok(actionTool);
  assert.ok(revokeTool);

  const mockCtx = { log: () => {} };

  // 1. List devices
  const listOut = await listTool.run({}, mockCtx);
  assert.ok(listOut.includes('Plugin Test PC'));

  // 2. Request permission
  const reqOut = await reqTool.run({ device_id_or_name: 'Plugin Test PC' }, mockCtx);
  assert.ok(reqOut.includes('PERMISSION REQUEST DISPATCHED'));

  // 3. Execute action fails without grant
  await assert.rejects(
    async () => {
      await actionTool.run({ device_id_or_name: 'Plugin Test PC', action: 'click', parameters: { x: 50, y: 50 } }, mockCtx);
    },
    /Permission denied/
  );

  // 4. Grant permission
  const grantOut = await grantTool.run({ device_id_or_name: 'Plugin Test PC' }, mockCtx);
  assert.ok(grantOut.includes('PERMISSION GRANTED'));

  // 5. Execute action succeeds
  const actOut = await actionTool.run({ device_id_or_name: 'Plugin Test PC', action: 'type', parameters: { text: 'remote typing' } }, mockCtx);
  assert.ok(actOut.includes('REMOTE ACTION EXECUTED'));

  // 6. Revoke
  const revokeOut = await revokeTool.run({ device_id_or_name: 'Plugin Test PC' }, mockCtx);
  assert.ok(revokeOut.includes('PERMISSION REVOKED'));
});
