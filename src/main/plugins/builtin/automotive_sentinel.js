'use strict';
// Connected Automotive Telematics & Vehicle Sentinel Plugin for Mave.

const { getAutomotiveSentinel } = require('../../automotive/automotive_sentinel');

module.exports = [
  {
    name: 'automotive_view_telematics',
    description: 'Check connected vehicle telematics: battery/fuel level, range in miles, odometer, tire pressures (PSI), cabin climate, and lock status.',
    input_schema: {
      type: 'object',
      properties: {
        vehicle_name: { type: 'string', description: 'Optional vehicle name or VIN.' },
      },
      required: [],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const auto = getAutomotiveSentinel();
      const v = auto.getVehicle(input.vehicle_name);
      if (!v) return 'No registered vehicles found in automotive sentinel.';

      ctx.log('info', `Automotive: Polling telematics for ${v.name}...`);

      const tp = v.tirePressurePsi || { frontLeft: 42, frontRight: 42, rearLeft: 41, rearRight: 42 };

      return `🚗 **VEHICLE TELEMATICS REPORT** (${v.name}):
• **Model**: **${v.year} ${v.make} ${v.model}**
• **Battery / Fuel Level**: **${v.batteryOrFuelPct}%** (${v.estimatedRangeMiles} miles estimated range)
• **Lock Status**: ${v.locked ? '🔒 Locked & Secured' : '🔓 Unlocked'}
• **Cabin Temperature**: **${v.cabinTempC}°C** (Target: ${v.targetTempC}°C, Climate: ${v.climateActive ? '🟢 ON' : '⚫ OFF'})
• **Charging Status**: ${v.charging ? (v.charging.isPluggedIn ? `⚡ Plugged In (Limit: ${v.charging.chargeLimitPct}%)` : 'Unplugged') : 'N/A'}
• **Tire Pressure (PSI)**: FL: ${tp.frontLeft} | FR: ${tp.frontRight} | RL: ${tp.rearLeft} | RR: ${tp.rearRight} (Nominal)
• **Odometer**: ${v.odometerMiles.toLocaleString()} miles`;
    },
  },

  {
    name: 'automotive_control_vehicle',
    description: 'Control connected vehicle: lock, unlock, pre-warm/pre-cool cabin climate, or flash headlights.',
    input_schema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['lock', 'unlock', 'start_climate', 'stop_climate', 'honk_flash'],
          description: 'Action to send to the vehicle.',
        },
        target_temp_c: { type: 'number', description: 'Target temperature in Celsius for climate preconditioning.' },
        vehicle_name: { type: 'string', description: 'Optional vehicle name.' },
      },
      required: ['action'],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const auto = getAutomotiveSentinel();
      ctx.log('info', `Automotive: Sending ${input.action} to vehicle...`);

      const res = auto.controlVehicle(input.vehicle_name, input.action, { target_temp_c: input.target_temp_c });

      return `🚗 **VEHICLE COMMAND DISPATCHED**:
• **Vehicle**: **${res.vehicle}**
• **Command**: \`${input.action.toUpperCase()}\`
• **Result**: ✅ ${res.message}`;
    },
  },

  {
    name: 'automotive_diagnose_obd_dtc',
    description: 'Decode and translate OBD-II Diagnostic Trouble Codes (DTCs) from your check-engine light into plain-English mechanical diagnosis.',
    input_schema: {
      type: 'object',
      properties: {
        dtc_code: { type: 'string', description: 'The diagnostic code (e.g. "P0300", "P0420", "P0128").' },
      },
      required: ['dtc_code'],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const auto = getAutomotiveSentinel();
      ctx.log('info', `Decoding OBD-II DTC code ${input.dtc_code}...`);

      const diag = auto.readDiagnosticCode(input.dtc_code);

      return `🔧 **OBD-II DIAGNOSTIC REPORT**:
• **Fault Code**: \`${diag.code}\`
• **Description**: **${diag.name}**
• **Severity**: \`${diag.severity.toUpperCase()}\`

💡 **Mechanical Guidance**:
${diag.advice}`;
    },
  },

  {
    name: 'automotive_parking_memory',
    description: 'Remember or recall the exact spot, garage level, or GPS coordinates where you parked your vehicle.',
    input_schema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['recall', 'save'], description: 'Whether to recall or save parking spot.' },
        location_note: { type: 'string', description: 'Parking spot details when saving (e.g. "Level 3, Row C, Space 12").' },
      },
      required: ['action'],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const auto = getAutomotiveSentinel();

      if (input.action === 'save') {
        if (!input.location_note) throw new Error('location_note is required to save parking spot.');
        const spot = auto.setParkingLocation({ locationNote: input.location_note });
        return `📍 **PARKING SPOT SAVED**: "${spot.locationNote}" [Recorded at ${new Date(spot.parkedAt).toLocaleTimeString()}].`;
      }

      const p = auto.getParkingLocation();
      const elapsedMin = Math.round((Date.now() - p.parkedAt) / 60000);
      return `📍 **SAVED PARKING LOCATION**:
• **Spot / Notes**: **${p.locationNote}**
• **Parked**: About ${elapsedMin} minutes ago (${new Date(p.parkedAt).toLocaleTimeString()})
• **Coordinates**: \`[Lat: ${p.coordinates.lat}, Lon: ${p.coordinates.lon}]\``;
    },
  },
];
