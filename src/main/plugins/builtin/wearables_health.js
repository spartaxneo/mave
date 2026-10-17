'use strict';
// Universal Wearables & Help Devices Plugin for Mave ("Ghost AI Core & Jarvis").
// Connects smartwatches (Apple Watch, Wear OS, Garmin, Fitbit),
// emergency SOS help pendants, continuous glucose monitors (CGM),
// smart blood pressure cuffs, and automated pill dispensers.

const { getWearablesHealthHub } = require('../../wearables/wearables_health_hub');

module.exports = [
  {
    name: 'wearables_query_vitals',
    description: 'Retrieve real-time health and vital telemetry (heart rate BPM, HRV, sleep score, steps, SpO2, blood pressure, glucose) from connected smartwatches and medical help devices.',
    input_schema: {
      type: 'object',
      properties: {
        device_name: {
          type: 'string',
          description: 'Optional name of the smartwatch or sensor (e.g. "Apple Watch", "Galaxy Watch", "Dexcom", "Withings").',
        },
        user_id: {
          type: 'string',
          description: 'Optional family member ID (default: "admin").',
        },
      },
      required: [],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const hub = getWearablesHealthHub();
      const targetDevice = input.device_name ? hub.getDevice(input.device_name) : null;

      ctx.log('info', `Wearables Bridge: Querying vitals for ${input.device_name || 'all devices'}...`);

      if (targetDevice) {
        if (targetDevice.vitals) {
          const v = targetDevice.vitals;
          return `⌚ **${targetDevice.name.toUpperCase()} VITALS REPORT**:
• **Heart Rate**: **${v.heartRateBpm} BPM** (Resting: ${v.restingHrBpm} BPM, HRV: ${v.hrvMs} ms)
• **Daily Activity**: **${v.stepsToday} steps** | **${v.activeCaloriesKcal} kcal**
• **Sleep Score**: **${v.sleepScorePct}%** (${v.sleepDurationHours} hours)
• **Blood Oxygen ($SpO_2$)**: **${v.spo2Pct}%**
• **Battery**: **${targetDevice.batteryPct}%** (Last Synced: ${new Date(v.lastSync).toLocaleTimeString()})`;
        }

        if (targetDevice.reading) {
          return `🩺 **${targetDevice.name.toUpperCase()} CGM READING**:
• **Blood Glucose**: **${targetDevice.reading.glucoseMgDl} mg/dL**
• **Trend Direction**: \`${targetDevice.reading.trend}\`
• **Time In Range**: **${targetDevice.reading.inRangePct}%**`;
        }

        if (targetDevice.lastMeasurement) {
          const m = targetDevice.lastMeasurement;
          return `🩺 **${targetDevice.name.toUpperCase()} BLOOD PRESSURE**:
• **Reading**: **${m.systolicMmHg}/${m.diastolicMmHg} mmHg**
• **Pulse**: **${m.pulseBpm} BPM**
• **Category**: **${m.classification}**`;
        }
      }

      return hub.getHealthOverview(input.user_id || 'admin');
    },
  },

  {
    name: 'wearables_sync_data',
    description: 'Ingest and update incoming telemetry from an Apple Watch, Wear OS device, or Bluetooth health sensor into Mave.',
    input_schema: {
      type: 'object',
      properties: {
        device_id_or_name: {
          type: 'string',
          description: 'Target device ID or name (e.g. "Apple Watch Ultra 2", "Samsung Galaxy Watch 6").',
        },
        vitals: {
          type: 'object',
          properties: {
            heartRateBpm: { type: 'number' },
            restingHrBpm: { type: 'number' },
            hrvMs: { type: 'number' },
            spo2Pct: { type: 'number' },
            stepsToday: { type: 'number' },
            sleepScorePct: { type: 'number' },
          },
          required: [],
          description: 'Telemetry readings payload.',
        },
      },
      required: ['device_id_or_name', 'vitals'],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const hub = getWearablesHealthHub();
      const updated = hub.logVitals(input.device_id_or_name, input.vitals);
      ctx.log('info', `Wearables Bridge: Synced incoming vitals for ${input.device_id_or_name}.`);

      return `✅ **TELEMETRY SYNCED**:
• **Device**: \`${input.device_id_or_name}\`
• **Updated Readings**: ${JSON.stringify(updated)}
• **Status**: Logged to in-memory health cache.`;
    },
  },

  {
    name: 'wearables_trigger_sos',
    description: 'Dispatch an Emergency SOS distress event, medical alert, or fall detection signal across the house and notify family emergency contacts.',
    input_schema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['sos_panic_button', 'fall_detected', 'critical_vitals', 'voice_distress'],
          description: 'Nature of the emergency alert.',
        },
        location: {
          type: 'string',
          description: 'Location or room where distress was triggered (e.g. "Living Room", "Staircase", "Bathroom").',
        },
        message: {
          type: 'string',
          description: 'Detailed description of the emergency event.',
        },
      },
      required: ['type'],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const hub = getWearablesHealthHub();
      const alert = hub.triggerEmergencyAlert({
        type: input.type,
        location: input.location || 'Home Residence',
        message: input.message || `Distress signal received: ${input.type}`,
      });

      ctx.log('info', `EMERGENCY ALERT TRIGGERED: ${alert.type} at ${alert.location}`);

      return `🚨 **EMERGENCY DISTRESS DISPATCHED**:
• **Alert ID**: \`${alert.id}\`
• **Alert Type**: \`${alert.type.toUpperCase()}\`
• **Location**: **${alert.location}**
• **Timestamp**: ${new Date(alert.timestamp).toLocaleTimeString()}
• **Actions Taken**:
  1. Priority high-volume audio alarm broadcasted across house intercom and PC.
  2. Camera vision inspection activated for room: "${alert.location}".
  3. Push dispatch sent to all designated family emergency devices.`;
    },
  },

  {
    name: 'wearables_list_devices',
    description: 'List all registered smartwatches, fitness rings, medical alert buttons, and health monitoring devices.',
    input_schema: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          enum: ['smartwatch', 'help_device', 'medical_sensor', 'all'],
          description: 'Device category filter.',
        },
      },
      required: [],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const hub = getWearablesHealthHub();
      const devices = hub.getDevices(input.category || 'all');
      ctx.log('info', `Listing ${devices.length} wearables and help devices...`);

      const rows = devices.map((d) => `• **${d.name}** (\`${d.category}\`, ${d.platform.toUpperCase()}): Status: **${d.status}**, Battery: **${d.batteryPct || 'N/A'}%**`).join('\n');

      return `⌚ **CONNECTED WEARABLES & HELP DEVICES** (${devices.length}):\n\n${rows}`;
    },
  },
];
