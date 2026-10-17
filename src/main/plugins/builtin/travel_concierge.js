'use strict';
// Autonomous Travel Concierge & Flight Logistics Plugin for Mave.

const { getTravelConcierge } = require('../../travel/travel_concierge');

module.exports = [
  {
    name: 'travel_track_flight',
    description: 'Track real-time flight status, gate changes, departure/arrival schedules, aircraft type, seat assignment, and baggage claim carousel.',
    input_schema: {
      type: 'object',
      properties: {
        flight_number: { type: 'string', description: 'Flight number (e.g. "UA245", "DL108").' },
      },
      required: ['flight_number'],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const concierge = getTravelConcierge();
      ctx.log('info', `Tracking flight ${input.flight_number}...`);

      const f = concierge.getFlightStatus(input.flight_number);

      return `✈️ **FLIGHT STATUS: ${f.flightNumber} (${f.airline})**:
• **Status**: **${f.status.toUpperCase()}**
• **Route**: **${f.origin.city} (${f.origin.iata})** ➔ **${f.destination.city} (${f.destination.iata})**
• **Departure**: Terminal **${f.origin.terminal}**, Gate **${f.origin.gate}** (${f.origin.scheduledDeparture})
• **Arrival**: Terminal **${f.destination.terminal}**, Gate **${f.destination.gate}** (${f.destination.scheduledArrival})
• **Aircraft**: ${f.aircraft} | Seat: **${f.seat}**
• **Baggage Claim**: **${f.baggageClaim}**`;
    },
  },

  {
    name: 'travel_locate_luggage',
    description: 'Track the location and ping status of checked bags, carry-ons, and passport pouches via connected AirTags and SmartTags.',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const concierge = getTravelConcierge();
      const bags = concierge.getLuggage();

      const rows = bags.map((b) => {
        const pingMin = Math.round((Date.now() - b.lastPing) / 60000);
        return `• **${b.name}** (\`${b.tagType}\`, Battery: ${b.batteryPct}%):
  - **Location**: **${b.location}**
  - **Last Pinged**: ${pingMin} minute(s) ago`;
      }).join('\n');

      return `🧳 **LUGGAGE & AIRTAG RADAR (${bags.length} items)**:\n\n${rows}`;
    },
  },

  {
    name: 'travel_generate_packing_list',
    description: 'Generate an intelligent packing list based on destination, trip duration, climate hint, and purpose (business vs leisure).',
    input_schema: {
      type: 'object',
      properties: {
        destination: { type: 'string', description: 'Trip destination (e.g. "Tokyo, Japan", "London, UK", "Zurich").' },
        trip_days: { type: 'number', description: 'Duration of the trip in days.' },
        weather_hint: { type: 'string', description: 'Expected weather (e.g. "cold_winter", "rainy", "warm_sunny").' },
        is_business: { type: 'boolean', description: 'Whether the trip is for business/tech work.' },
      },
      required: ['destination'],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const concierge = getTravelConcierge();
      const list = concierge.generatePackingList({
        destination: input.destination,
        tripDays: input.trip_days,
        weatherHint: input.weather_hint,
        isBusiness: input.is_business != null ? input.is_business : true,
      });

      const essentials = list.essentials.map((e) => `  - [ ] ${e}`).join('\n');
      const clothing = list.clothing.map((c) => `  - [ ] ${c}`).join('\n');

      return `📋 **INTELLIGENT TRAVEL PACKING LIST**:
• **Destination**: **${list.destination}** (${list.tripDays} Days)
• **Context**: ${list.notes}

🎒 **Essential Tech & Documents**:
${essentials}

👔 **Clothing & Wardrobe**:
${clothing}`;
    },
  },

  {
    name: 'travel_circadian_jetlag_plan',
    description: 'Compute a personalized circadian adjustment protocol to eliminate jetlag based on time zone hour difference.',
    input_schema: {
      type: 'object',
      properties: {
        timezone_offset_hours: { type: 'number', description: 'Time zone difference in hours (e.g. 8 for Pacific to Europe, 16 for Pacific to Asia).' },
      },
      required: ['timezone_offset_hours'],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const concierge = getTravelConcierge();
      const plan = concierge.getCircadianSchedule(input.timezone_offset_hours);

      const rows = plan.protocol.map((step) => `• ${step}`).join('\n');

      return `🌙 **CIRCADIAN JETLAG ELIMINATION PROTOCOL** (${plan.direction}, ${plan.offsetHours} hr shift):\n\n${rows}`;
    },
  },
];
