'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  IoTHub,
  getIoTHub,
} = require('../src/main/iot/iot_hub');

const iotPlugins = require('../src/main/plugins/builtin/iot_device_bridge');

test('IoTHub initializes defaults, manages registry, and retrieves devices', () => {
  const tmpFile = path.join(os.tmpdir(), `test_iot_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.json`);
  const hub = new IoTHub(tmpFile);

  const devices = hub.getDevices();
  assert.ok(devices.length >= 7);

  // Retrieve by name and id
  const lights = hub.getDevice('Living Room Ceiling Lights');
  assert.ok(lights);
  assert.equal(lights.type, 'light');
  assert.equal(lights.protocol, 'home_assistant');

  const thermostat = hub.getDevice('iot_thermostat_home');
  assert.ok(thermostat);
  assert.equal(thermostat.type, 'thermostat');

  // Filter by room
  const officeDevices = hub.getDevicesInRoom('Home Office');
  assert.ok(officeDevices.length >= 1);
  assert.equal(officeDevices[0].name, 'Workspace Ambient LED Strip');

  // Filter by type
  const sensors = hub.getDevicesByType('sensor');
  assert.ok(sensors.length >= 1);
  assert.equal(sensors[0].protocol, 'mqtt');

  try { if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile); } catch {}
});

test('IoTHub registers new devices and executes control commands', async () => {
  const tmpFile = path.join(os.tmpdir(), `test_iot_ctrl_${Date.now()}.json`);
  const hub = new IoTHub(tmpFile);

  // Register a new device
  const newDev = hub.registerDevice({
    name: 'Garage Door Opener',
    room: 'Garage',
    type: 'switch',
    protocol: 'shelly',
    endpoint: 'http://192.168.1.180',
    entityId: 'shelly_garage_01',
  });
  assert.equal(newDev.name, 'Garage Door Opener');
  assert.equal(hub.getDevice('Garage Door Opener').room, 'Garage');

  // Control: Turn on
  const res1 = await hub.controlDevice('Garage Door Opener', 'turn_on');
  assert.equal(res1.ok, true);
  assert.equal(res1.state.power, true);

  // Control: Set thermostat temperature
  const res2 = await hub.controlDevice('Main Climate Thermostat', 'set_temperature', { target_temperature: 21.5 });
  assert.equal(res2.ok, true);
  assert.equal(res2.state.targetTempC, 21.5);

  // Control: Lock front door
  const res3 = await hub.controlDevice('Front Door Smart Lock', 'unlock');
  assert.equal(res3.ok, true);
  assert.equal(res3.state.locked, false);

  try { if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile); } catch {}
});

test('IoTHub matchIntent detects conversational smart home requests', () => {
  const tmpFile = path.join(os.tmpdir(), `test_iot_intent_${Date.now()}.json`);
  const hub = new IoTHub(tmpFile);

  const m1 = hub.matchIntent('will it be able to connect with iot apps and devices?');
  assert.equal(m1.handled, true);
  assert.equal(m1.type, 'inquiry');

  const m2 = hub.matchIntent('turn on the coffee machine');
  assert.equal(m2.handled, true);
  assert.equal(m2.type, 'control');
  assert.equal(m2.action, 'turn_on');

  const m3 = hub.matchIntent('set thermostat to 23 degrees');
  assert.equal(m3.handled, true);
  assert.equal(m3.type, 'control');
  assert.equal(m3.action, 'set_temperature');
  assert.equal(m3.params.target_temperature, 23);

  const m4 = hub.matchIntent('what is the capital of France?');
  assert.equal(m4.handled, false);

  try { if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile); } catch {}
});

test('IoT Device Bridge builtin plugin tools have valid schemas and run properly', async () => {
  assert.ok(Array.isArray(iotPlugins));
  assert.equal(iotPlugins.length, 4);

  const ctrlTool = iotPlugins.find((p) => p.name === 'iot_control_device');
  const listTool = iotPlugins.find((p) => p.name === 'iot_list_devices');
  const regTool = iotPlugins.find((p) => p.name === 'iot_register_device');
  const ecoTool = iotPlugins.find((p) => p.name === 'iot_query_ecosystem_status');

  assert.ok(ctrlTool);
  assert.ok(listTool);
  assert.ok(regTool);
  assert.ok(ecoTool);

  const mockCtx = {
    log: () => {},
  };

  // Test listTool
  const listRes = await listTool.run({}, mockCtx);
  assert.match(listRes, /REGISTERED IOT & SMART HOME DEVICES/i);

  // Test ctrlTool
  const ctrlRes = await ctrlTool.run({
    device_name_or_id: 'Living Room Ceiling Lights',
    action: 'turn_off',
  }, mockCtx);
  assert.match(ctrlRes, /IOT DEVICE CONTROL EXECUTED/i);

  // Test ecoTool
  const ecoRes = await ecoTool.run({}, mockCtx);
  assert.match(ecoRes, /Home Assistant/i);
  assert.match(ecoRes, /MQTT Protocol/i);
  assert.match(ecoRes, /Tuya & Smart Life/i);

  // Test regTool
  const regRes = await regTool.run({
    name: 'Balcony Irrigation Pump',
    room: 'Balcony',
    type: 'switch',
    protocol: 'mqtt',
  }, mockCtx);
  assert.match(regRes, /NEW IOT DEVICE REGISTERED/i);
});
