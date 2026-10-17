'use strict';
// Universal IoT Device Bridge Plugin for Mave ("Ghost AI Core & Jarvis").
// Exposes tools to control smart home appliances, lights, thermostats, locks,
// and sensors across Home Assistant, MQTT, Tuya, Shelly, and SmartThings.

const { getIoTHub } = require('../../iot/iot_hub');

module.exports = [
  {
    name: 'iot_control_device',
    description: 'Control any connected IoT device or smart home appliance (lights, smart plugs, AC/thermostats, door locks, air purifiers, robot vacuums) across Home Assistant, MQTT, Tuya, Shelly, and Philips Hue.',
    input_schema: {
      type: 'object',
      properties: {
        device_name_or_id: {
          type: 'string',
          description: 'Name or ID of the device (e.g. "Living Room Ceiling Lights", "Espresso Coffee Machine Plug", "Front Door Smart Lock", "thermostat").',
        },
        action: {
          type: 'string',
          enum: ['turn_on', 'turn_off', 'toggle', 'set_temperature', 'set_brightness', 'set_color', 'lock', 'unlock', 'set_mode'],
          description: 'The action to perform on the IoT device.',
        },
        parameters: {
          type: 'object',
          properties: {
            target_temperature: { type: 'number', description: 'Target temperature in Celsius for thermostats/AC.' },
            brightness: { type: 'number', description: 'Brightness level from 1 to 255.' },
            color_hex: { type: 'string', description: 'Hex color string (e.g. "#FF8800").' },
            mode: { type: 'string', description: 'Operational mode (e.g. "cool", "heat", "auto", "eco").' },
          },
          description: 'Optional operational parameters.',
        },
      },
      required: ['device_name_or_id', 'action'],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const hub = getIoTHub();
      ctx.log('info', `IoT Bridge: Sending ${input.action} to ${input.device_name_or_id}...`);

      const result = await hub.controlDevice(input.device_name_or_id, input.action, input.parameters || {});

      return `🔌 **IOT DEVICE CONTROL EXECUTED**:
• **Target Device**: **${result.device}** [${result.room}]
• **Protocol / Bus**: \`${result.protocol.toUpperCase()}\`
• **Action**: \`${result.action.toUpperCase()}\`
• **Current State**: ${JSON.stringify(result.state)}
• **Status**: ✅ ${result.message}`;
    },
  },

  {
    name: 'iot_list_devices',
    description: 'List all registered smart home and IoT devices, grouped by room or filtered by category (light, thermostat, switch, lock, sensor, appliance).',
    input_schema: {
      type: 'object',
      properties: {
        room: {
          type: 'string',
          description: 'Optional room name filter (e.g. "Living Room", "Kitchen", "Home Office").',
        },
        device_type: {
          type: 'string',
          enum: ['light', 'switch', 'thermostat', 'sensor', 'lock', 'appliance', 'all'],
          description: 'Optional device category filter.',
        },
      },
      required: [],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const hub = getIoTHub();
      let devices = hub.getDevices();

      if (input.room) {
        devices = hub.getDevicesInRoom(input.room);
      }
      if (input.device_type && input.device_type !== 'all') {
        devices = devices.filter((d) => d.type === input.device_type);
      }

      ctx.log('info', `Listing ${devices.length} IoT devices...`);

      if (!devices.length) {
        return '🔍 No matching IoT devices found in registry.';
      }

      const rows = devices.map((d) => {
        const stateStr = d.type === 'light'
          ? (d.state.power ? `🟢 ON (${d.state.brightness || 255}/255)` : '⚫ OFF')
          : d.type === 'thermostat'
          ? `❄️ ${d.state.currentTempC}°C (Target: ${d.state.targetTempC}°C)`
          : d.type === 'lock'
          ? (d.state.locked ? '🔒 LOCKED' : '🔓 UNLOCKED')
          : d.type === 'switch'
          ? (d.state.power ? '⚡ ON' : '⚫ OFF')
          : (d.state.power ? '🟢 ON' : '⚫ OFF');
        return `• **${d.name}** [${d.room}] (\`${d.protocol}\`, Type: ${d.type}): ${stateStr}`;
      }).join('\n');

      return `🌐 **REGISTERED IOT & SMART HOME DEVICES** (${devices.length}):\n\n${rows}`;
    },
  },

  {
    name: 'iot_register_device',
    description: 'Register a new smart home or IoT device into Mave\'s local device registry.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Friendly name of the device (e.g. "Balcony Flood Light").' },
        room: { type: 'string', description: 'Room location (e.g. "Balcony", "Garage").' },
        type: {
          type: 'string',
          enum: ['light', 'switch', 'thermostat', 'sensor', 'lock', 'appliance'],
          description: 'Device hardware type.',
        },
        protocol: {
          type: 'string',
          enum: ['home_assistant', 'mqtt', 'tuya', 'shelly', 'hue', 'wled', 'tasmota', 'generic_lan_http'],
          description: 'Communication protocol.',
        },
        endpoint: { type: 'string', description: 'Local IP, URL, or MQTT broker address.' },
        entity_id: { type: 'string', description: 'Entity ID, topic, or unique hardware ID.' },
      },
      required: ['name', 'room', 'type', 'protocol'],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const hub = getIoTHub();
      const dev = hub.registerDevice(input);
      ctx.log('info', `Registered new IoT device: ${dev.name} [${dev.room}]`);

      return `✅ **NEW IOT DEVICE REGISTERED**:
• **Name**: **${dev.name}**
• **Room**: ${dev.room}
• **Type**: \`${dev.type.toUpperCase()}\`
• **Protocol**: \`${dev.protocol.toUpperCase()}\`
• **Entity ID**: \`${dev.entityId}\``;
    },
  },

  {
    name: 'iot_query_ecosystem_status',
    description: 'Get a comprehensive status overview of connected IoT ecosystems, supported protocols, active devices, and local performance metrics.',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const hub = getIoTHub();
      return hub.getCapabilityOverview();
    },
  },
];
