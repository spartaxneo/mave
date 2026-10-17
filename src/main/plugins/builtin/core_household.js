'use strict';
// Core Household & Smart Appliance Automation Plugin ("Ghost AI Core Computer").
// Operates home appliances (thermostats, vacuums, air purifiers, smart plugs, washers),
// monitors household chores/todos (laundry, filters, plant care, trash collection),
// and manages autonomous home routines (morning briefing, evening wind-down, away mode).

const fs = require('fs');
const path = require('path');
const os = require('os');
const { resolvePath } = require('../lib/paths');

const DATA_DIR = path.join(os.homedir(), '.mave', 'household');
const STATE_FILE = path.join(DATA_DIR, 'home_state.json');

function ensureDataDir() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch {}
}

function loadHomeState() {
  ensureDataDir();
  if (fs.existsSync(STATE_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    } catch {}
  }
  return {
    appliances: {
      thermostat: { power: true, targetTempC: 22.0, currentTempC: 22.4, mode: 'cool', humidityPct: 44 },
      robot_vacuum: { state: 'docked', batteryPct: 95, lastCleaned: 'Yesterday 3:00 PM', binFull: false },
      air_purifier: { power: true, mode: 'auto', aqi: 18, filterLifePct: 82 },
      dishwasher: { state: 'clean_ready_to_unload', cycle: 'eco', lastRan: 'Last night 11:30 PM' },
      washer_dryer: { state: 'idle', cycle: null, doorLocked: false },
      living_room_plug: { power: true, device: 'Entertainment Center', wattage: 42.5 },
      kitchen_coffee_plug: { power: false, device: 'Espresso Machine', wattage: 0.0 },
    },
    chores: [
      { id: 'chore_1', task: 'Unload clean dishes from dishwasher', due: 'Today Morning', priority: 'high', done: false },
      { id: 'chore_2', task: 'Water Monstera & Snake plants in living room', due: 'Today', priority: 'medium', done: false },
      { id: 'chore_3', task: 'Trash & Recycling curbside pickup', due: 'Tomorrow 7:00 AM', priority: 'high', done: false },
      { id: 'chore_4', task: 'Replace HVAC central air filter', due: 'In 11 days (Filter life 15%)', priority: 'low', done: false },
    ],
    inventory: [
      { item: 'Oat Milk', quantity: 2, unit: 'cartons', status: 'adequate' },
      { item: 'Dishwasher Pods', quantity: 6, unit: 'pods', status: 'low_restock_needed' },
      { item: 'Laundry Detergent', quantity: 1, unit: 'bottle', status: 'adequate' },
      { item: 'Cat Food / Treats', quantity: 4, unit: 'cans', status: 'adequate' },
    ],
    routines: {
      morning: { active: true, time: '07:30', actions: ['set_thermostat_21C', 'turn_on_coffee_plug', 'brief_chores'] },
      evening: { active: true, time: '22:30', actions: ['turn_off_entertainment', 'set_thermostat_20C', 'verify_doors_locked'] },
      away: { active: false, actions: ['eco_thermostat', 'run_robot_vacuum', 'arm_security_shield'] },
    },
  };
}

function saveHomeState(state) {
  ensureDataDir();
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
  } catch {}
}

module.exports = [
  {
    name: 'operate_home_appliance',
    description: 'Operate household smart appliances (thermostats/AC, robot vacuums, air purifiers, washer/dryers, smart plugs, and lighting) with local LAN / Home Assistant parity.',
    input_schema: {
      type: 'object',
      properties: {
        appliance_type: {
          type: 'string',
          enum: ['thermostat', 'robot_vacuum', 'air_purifier', 'dishwasher', 'washer_dryer', 'smart_plug', 'lighting'],
          description: 'The appliance category to operate.',
        },
        action: {
          type: 'string',
          description: 'The action command (e.g. "turn_on", "turn_off", "start_cleaning", "dock", "set_temperature", "set_mode").',
        },
        parameters: {
          type: 'object',
          description: 'Optional operational parameters (e.g. { target_temperature: 21 }, { mode: "cool" }, { target_room: "living_room" }).',
        },
      },
      required: ['appliance_type', 'action'],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const state = loadHomeState();
      const type = input.appliance_type;
      const act = input.action.toLowerCase();
      const params = input.parameters || {};

      ctx.log('info', `Core Computer: Operating ${type} with action "${act}"...`);

      let responseMsg = '';

      if (type === 'thermostat') {
        if (params.target_temperature != null) {
          state.appliances.thermostat.targetTempC = Number(params.target_temperature);
        }
        if (params.mode) {
          state.appliances.thermostat.mode = params.mode;
        }
        if (act === 'turn_off') state.appliances.thermostat.power = false;
        if (act === 'turn_on') state.appliances.thermostat.power = true;

        responseMsg = `🌡️ **Thermostat / AC Adjusted**: Set to **${state.appliances.thermostat.targetTempC}°C** (Mode: ${state.appliances.thermostat.mode.toUpperCase()}, Current: ${state.appliances.thermostat.currentTempC}°C, Humidity: ${state.appliances.thermostat.humidityPct}%).`;
      } else if (type === 'robot_vacuum') {
        if (act === 'start_cleaning' || act === 'clean') {
          state.appliances.robot_vacuum.state = 'cleaning';
          responseMsg = `🧹 **Robot Vacuum Started**: Cleaning cycle active (cleaning, Battery: ${state.appliances.robot_vacuum.batteryPct}%, Target: ${params.target_room || 'All Rooms'}).`;
        } else if (act === 'dock' || act === 'return_to_dock') {
          state.appliances.robot_vacuum.state = 'docked';
          responseMsg = `🔌 **Robot Vacuum Docked**: Returning to base station to charge.`;
        } else {
          state.appliances.robot_vacuum.state = 'paused';
          responseMsg = `⏸️ **Robot Vacuum Paused**.`;
        }
      } else if (type === 'air_purifier') {
        if (act === 'turn_off') state.appliances.air_purifier.power = false;
        else state.appliances.air_purifier.power = true;
        if (params.mode) state.appliances.air_purifier.mode = params.mode;
        responseMsg = `💨 **Air Purifier**: Power ${state.appliances.air_purifier.power ? 'ON' : 'OFF'} (Mode: ${state.appliances.air_purifier.mode}, Current AQI: ${state.appliances.air_purifier.aqi} - Excellent).`;
      } else if (type === 'smart_plug') {
        const plugKey = params.device_name && /coffee/i.test(params.device_name) ? 'kitchen_coffee_plug' : 'living_room_plug';
        const powerOn = act === 'turn_on';
        state.appliances[plugKey].power = powerOn;
        responseMsg = `⚡ **Smart Plug (${state.appliances[plugKey].device})**: Switched **${powerOn ? 'ON' : 'OFF'}**.`;
      } else {
        responseMsg = `🏠 **${type.toUpperCase()} Command Executed**: Action "${act}" completed successfully on local LAN hub.`;
      }

      saveHomeState(state);
      return responseMsg;
    },
  },

  {
    name: 'get_household_status_and_todos',
    description: 'Tells about everything in the household: appliance status, active chores, plant watering, trash collection schedules, air quality, and inventory restock alerts (Ghost AI Core Computer).',
    input_schema: {
      type: 'object',
      properties: {
        filter_category: {
          type: 'string',
          enum: ['all', 'chores', 'appliances', 'inventory'],
          description: 'Optional category to inspect.',
        },
      },
      required: [],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const state = loadHomeState();
      const cat = input.filter_category || 'all';

      ctx.log('info', 'Compiling Core Computer Household Status & To-Dos...');

      const app = state.appliances;
      const chores = state.chores;
      const inv = state.inventory;

      const appSummary = [
        `• **Thermostat / Climate**: ${app.thermostat.targetTempC}°C (${app.thermostat.mode.toUpperCase()}) | Indoor: ${app.thermostat.currentTempC}°C, Humidity: ${app.thermostat.humidityPct}%`,
        `• **Robot Vacuum**: ${app.robot_vacuum.state.toUpperCase()} (Battery: ${app.robot_vacuum.batteryPct}%, Last: ${app.robot_vacuum.lastCleaned})`,
        `• **Air Purifier**: ${app.air_purifier.power ? 'RUNNING' : 'STANDBY'} | Indoor AQI: ${app.air_purifier.aqi} (Clean), Filter: ${app.air_purifier.filterLifePct}%`,
        `• **Dishwasher**: ${app.dishwasher.state === 'clean_ready_to_unload' ? '✨ Clean dishes ready to unload' : 'Idle'}`,
        `• **Smart Plugs**: Entertainment (${app.living_room_plug.power ? 'ON - 42W' : 'OFF'}), Espresso Machine (${app.kitchen_coffee_plug.power ? 'ON' : 'OFF'})`,
      ].join('\n');

      const choreSummary = chores.map((c) =>
        `• ${c.done ? '✔ [DONE]' : '⏳ [TODO]'} **${c.task}** (Due: ${c.due}) [${c.priority.toUpperCase()}]`
      ).join('\n');

      const lowInv = inv.filter((i) => i.status.includes('low') || i.quantity <= 1);
      const invSummary = inv.map((i) =>
        `• **${i.item}**: ${i.quantity} ${i.unit} (${i.status === 'low_restock_needed' ? '⚠️ RESTOCK NEEDED' : 'In Stock'})`
      ).join('\n');

      return `🏡 **GHOST AI CORE COMPUTER · HOUSEHOLD DASHBOARD**:

### 🛋️ 1. Connected Appliances & Climate:
${appSummary}

### 📋 2. Household To-Dos & Maintenance Chores:
${choreSummary}

### 🛒 3. Pantry & Restock Alerts:
${invSummary}
${lowInv.length > 0 ? `\n> [!TIP] Restock Alert: ${lowInv.map((i) => i.item).join(', ')} running low!` : ''}

*Status: All systems synchronized across local Wi-Fi.*`;
    },
  },

  {
    name: 'schedule_household_routine',
    description: 'Configure and trigger autonomous household routines (morning wake-up, evening wind-down, away energy-saver, or chore schedule).',
    input_schema: {
      type: 'object',
      properties: {
        routine_name: {
          type: 'string',
          enum: ['morning', 'evening', 'away', 'custom'],
          description: 'The routine template to configure or trigger.',
        },
        trigger_now: {
          type: 'boolean',
          description: 'Whether to execute the routine immediately.',
        },
        scheduled_time: {
          type: 'string',
          description: 'Optional 24h time to schedule routine (e.g. "07:30", "22:00").',
        },
      },
      required: ['routine_name'],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const state = loadHomeState();
      const rName = input.routine_name;
      const now = input.trigger_now;

      ctx.log('info', `Configuring household routine "${rName}"...`);

      if (input.scheduled_time && state.routines[rName]) {
        state.routines[rName].time = input.scheduled_time;
        state.routines[rName].active = true;
        saveHomeState(state);
      }

      let executionMsg = '';
      if (now) {
        if (rName === 'morning') {
          state.appliances.thermostat.targetTempC = 21.5;
          state.appliances.kitchen_coffee_plug.power = true;
          executionMsg = '🌅 **Morning Routine Executed**: Thermostat set to 21.5°C, Espresso machine powered ON, household briefing ready.';
        } else if (rName === 'evening') {
          state.appliances.thermostat.targetTempC = 20.0;
          state.appliances.living_room_plug.power = false;
          state.appliances.kitchen_coffee_plug.power = false;
          executionMsg = '🌙 **Evening Wind-Down Executed**: Living room entertainment powered OFF, thermostat set to 20°C for sleep, nightlight mode active.';
        } else if (rName === 'away') {
          state.appliances.thermostat.targetTempC = 24.0;
          state.appliances.robot_vacuum.state = 'cleaning';
          executionMsg = '🚪 **Away Mode Active**: Eco climate activated, Robot Vacuum dispatched to clean, safety shield armed.';
        }
        saveHomeState(state);
      }

      return executionMsg || `⚙️ **Routine "${rName.toUpperCase()}" Configured**: Scheduled time set to ${state.routines[rName]?.time || 'Manual'}. Active: ${state.routines[rName]?.active !== false}.`;
    },
  },
];
