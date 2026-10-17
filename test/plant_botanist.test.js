'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  PlantBotanist,
  getPlantBotanist,
  BOTANICAL_DIAGNOSTICS,
} = require('../src/main/botany/plant_botanist');

const botanyPlugins = require('../src/main/plugins/builtin/plant_botanist');

test('PlantBotanist tracks plant hydration and checks watering schedule', () => {
  const tmpFile = path.join(os.tmpdir(), `test_botany_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.json`);
  const botanist = new PlantBotanist(tmpFile);

  const plants = botanist.getPlants();
  assert.ok(plants.length >= 4);

  const sched = botanist.checkWateringSchedule();
  assert.ok(sched.length >= 4);
  assert.ok(sched.some((p) => p.name.includes('Monstera')));

  // Water Monstera
  const watered = botanist.waterPlant('Monstera');
  assert.equal(watered.soilMoisturePct, 85);

  try { if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile); } catch {}
});

test('PlantBotanist diagnoses botanical symptoms accurately', () => {
  const botanist = getPlantBotanist();

  const diag = botanist.diagnoseSymptom('yellow_leaves');
  assert.match(diag.cause, /Overwatering/i);
  assert.match(diag.treatment, /drainage/i);

  const diag2 = botanist.diagnoseSymptom('powdery_mildew');
  assert.equal(diag2.urgency, 'High');
});

test('Plant Botanist builtin plugin tools export valid schemas and run properly', async () => {
  assert.ok(Array.isArray(botanyPlugins));
  assert.equal(botanyPlugins.length, 4);

  const schedTool = botanyPlugins.find((p) => p.name === 'botany_check_watering_schedule');
  const waterTool = botanyPlugins.find((p) => p.name === 'botany_log_watering');
  const diagTool = botanyPlugins.find((p) => p.name === 'botany_diagnose_plant_health');
  const listTool = botanyPlugins.find((p) => p.name === 'botany_list_plants');

  assert.ok(schedTool);
  assert.ok(waterTool);
  assert.ok(diagTool);
  assert.ok(listTool);

  const mockCtx = { log: () => {} };

  const schedRes = await schedTool.run({}, mockCtx);
  assert.match(schedRes, /BOTANICAL WATERING AUDIT/i);

  const waterRes = await waterTool.run({ plant_name_or_id: 'Monstera' }, mockCtx);
  assert.match(waterRes, /PLANT WATERED/i);

  const diagRes = await diagTool.run({ symptom: 'yellow_leaves' }, mockCtx);
  assert.match(diagRes, /BOTANICAL PATHOLOGY/i);

  const listRes = await listTool.run({}, mockCtx);
  assert.match(listRes, /REGISTERED INDOOR FLORA/i);
});
