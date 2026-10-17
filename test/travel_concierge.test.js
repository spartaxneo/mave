'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  TravelConcierge,
  getTravelConcierge,
  DEFAULT_FLIGHTS,
} = require('../src/main/travel/travel_concierge');

const travelPlugins = require('../src/main/plugins/builtin/travel_concierge');

test('TravelConcierge retrieves flight details and gate status', () => {
  const concierge = getTravelConcierge();

  const f1 = concierge.getFlightStatus('UA245');
  assert.equal(f1.flightNumber, 'UA245');
  assert.equal(f1.origin.iata, 'SFO');
  assert.equal(f1.destination.iata, 'HND');
  assert.equal(f1.status, 'On Time');
  assert.equal(f1.baggageClaim, 'Carousel 7');

  const f2 = concierge.getFlightStatus('DL 108');
  assert.equal(f2.flightNumber, 'DL108');
  assert.equal(f2.origin.iata, 'JFK');
});

test('TravelConcierge tracks luggage tags and AirTag battery', () => {
  const tmpFile = path.join(os.tmpdir(), `test_travel_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.json`);
  const concierge = new TravelConcierge(tmpFile);

  const bags = concierge.getLuggage();
  assert.ok(bags.length >= 3);
  assert.ok(bags.some((b) => b.tagType === 'Apple AirTag'));
  assert.ok(bags.some((b) => b.name.includes('Passport')));

  try { if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile); } catch {}
});

test('TravelConcierge generates packing lists and circadian protocol', () => {
  const concierge = getTravelConcierge();

  const list = concierge.generatePackingList({
    destination: 'Tokyo, Japan',
    tripDays: 5,
    weatherHint: 'rainy',
    isBusiness: true,
  });

  assert.equal(list.tripDays, 5);
  assert.ok(list.essentials.length >= 5);
  assert.ok(list.clothing.some((c) => c.includes('Umbrella')));

  const plan = concierge.getCircadianSchedule(8);
  assert.equal(plan.offsetHours, 8);
  assert.ok(plan.protocol.length >= 3);
});

test('Travel Concierge builtin plugin tools export valid schemas and run properly', async () => {
  assert.ok(Array.isArray(travelPlugins));
  assert.equal(travelPlugins.length, 4);

  const flightTool = travelPlugins.find((p) => p.name === 'travel_track_flight');
  const luggageTool = travelPlugins.find((p) => p.name === 'travel_locate_luggage');
  const packTool = travelPlugins.find((p) => p.name === 'travel_generate_packing_list');
  const jetlagTool = travelPlugins.find((p) => p.name === 'travel_circadian_jetlag_plan');

  assert.ok(flightTool);
  assert.ok(luggageTool);
  assert.ok(packTool);
  assert.ok(jetlagTool);

  const mockCtx = { log: () => {} };

  const flightRes = await flightTool.run({ flight_number: 'UA245' }, mockCtx);
  assert.match(flightRes, /FLIGHT STATUS: UA245/i);

  const luggageRes = await luggageTool.run({}, mockCtx);
  assert.match(luggageRes, /LUGGAGE & AIRTAG RADAR/i);

  const packRes = await packTool.run({ destination: 'London, UK', trip_days: 3 }, mockCtx);
  assert.match(packRes, /INTELLIGENT TRAVEL PACKING LIST/i);

  const jetlagRes = await jetlagTool.run({ timezone_offset_hours: 9 }, mockCtx);
  assert.match(jetlagRes, /CIRCADIAN JETLAG ELIMINATION/i);
});
