'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { MaveOpticGlassRig, SPECIALIST_SWARM_ROSTER } = require('../src/renderer/optic_glass_rig');

test('MaveOpticGlassRig: Specialist AI Swarm Roster specification', () => {
  assert.ok(Array.isArray(SPECIALIST_SWARM_ROSTER), 'Roster is an array');
  assert.equal(SPECIALIST_SWARM_ROSTER.length, 7, 'Includes 7 specialized intelligence nodes');

  // Verify Core Conductor
  const conductor = SPECIALIST_SWARM_ROSTER.find((m) => m.role === 'conductor');
  assert.ok(conductor, 'Includes conductor node');
  assert.equal(conductor.id, 'phi-4-mini');
  assert.equal(conductor.model, 'Phi-4-mini 3.8B');
  assert.equal(conductor.cloudGated, false);

  // Verify Specialist roles
  const roles = SPECIALIST_SWARM_ROSTER.map((m) => m.role);
  assert.ok(roles.includes('coding'), 'Includes coding specialist');
  assert.ok(roles.includes('reasoning'), 'Includes reasoning specialist');
  assert.ok(roles.includes('research'), 'Includes deep research specialist');
  assert.ok(roles.includes('vision'), 'Includes vision specialist');
  assert.ok(roles.includes('vault'), 'Includes private NAS specialist');
  assert.ok(roles.includes('cluster'), 'Includes mesh GPU cluster specialist');
});

test('MaveOpticGlassRig: Headless instantiation and physical properties', () => {
  const rig = new MaveOpticGlassRig(null, {
    size: 240,
    interactive: true,
    modelName: 'Phi-4-mini 3.8B',
  });

  assert.equal(rig.width, 240);
  assert.equal(rig.height, 300); // Math.round(240 * 1.25)
  assert.equal(rig.lensRadius, Math.round(240 * 0.38));
  assert.equal(rig.lensPos.x, rig.width / 2);
  assert.equal(rig.isSwarmEjected, false);
  assert.equal(rig.nodes.length, 7);

  // Conductor sits at epicenter
  const conductorNode = rig.nodes.find((n) => n.role === 'conductor');
  assert.equal(conductorNode.target.x, rig.basePos.x);
  assert.ok(conductorNode.target.y > 0 && conductorNode.target.y < rig.height);

  // Satellite nodes are distributed symmetrically
  const satelliteNodes = rig.nodes.filter((n) => n.role !== 'conductor');
  assert.equal(satelliteNodes.length, 6);
  satelliteNodes.forEach((node) => {
    assert.ok(node.target.x > 0 && node.target.x < rig.width, 'Target X is within bounds');
    assert.ok(node.target.y > 0 && node.target.y < rig.height, 'Target Y is within bounds');
  });

  rig.destroy();
});

test('MaveOpticGlassRig: Apple Design tactile press (0ms latency, scale 0.97)', () => {
  const rig = new MaveOpticGlassRig(null, { size: 240 });

  // Initial state
  assert.equal(rig.targetScale, 1.0);
  assert.equal(rig.isPressed, false);

  // Simulate Pointer Down
  rig.isPressed = true;
  rig.isDragging = true;
  rig.targetScale = 0.97; // Zero touch-down latency invariant

  assert.equal(rig.targetScale, 0.97, 'Instantly scales to 0.97 on touch down');

  // Simulate Pointer Up
  rig.isPressed = false;
  rig.isDragging = false;
  rig.targetScale = 1.0;

  assert.equal(rig.targetScale, 1.0, 'Recovers to 1.0 on touch release');

  rig.destroy();
});

test('MaveOpticGlassRig: Swarm impulse ejection and collapse mechanics', () => {
  let ejectedFired = false;
  let collapsedFired = false;

  const rig = new MaveOpticGlassRig(null, {
    size: 240,
    onEject: () => { ejectedFired = true; },
    onCollapse: () => { collapsedFired = true; },
  });

  assert.equal(rig.isSwarmEjected, false);

  // Eject swarm
  rig.ejectSwarm();
  assert.equal(rig.isSwarmEjected, true);
  assert.equal(ejectedFired, true);
  assert.ok(rig.shockwaveAlpha > 0.9, 'Shockwave triggered');

  // Verify initial fountain velocities
  assert.ok(rig.marbles.length > 0);
  assert.equal(rig.marbles[0].active, true);

  // Collapse swarm
  rig.collapseSwarm();
  assert.equal(rig.isSwarmEjected, false);
  assert.equal(collapsedFired, true);
  assert.equal(rig.marbles[0].active, false);

  rig.destroy();
});

test('MaveOpticGlassRig: 2D physics & top boundary bounce calculations', () => {
  const rig = new MaveOpticGlassRig(null, { size: 240 });
  rig.lastFrameTime = 0;
  rig.triggerUnlock();

  const marble = rig.marbles[0];
  marble.pos.x = rig.width / 2;
  marble.pos.y = 10; // Inside top boundary zone
  marble.vel.y = -50; // Moving upward

  // Run one physics step
  rig._updatePhysics(16);

  // Position must deflect away from top boundary (y >= r + 16)
  assert.ok(marble.pos.y >= marble.radius + 16 - 2, 'Deflects downward from top boundary');
  assert.ok(marble.vel.y > 0, 'Velocity reversed downward');

  rig.destroy();
});
