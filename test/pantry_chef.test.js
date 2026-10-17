'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  PantryChef,
  getPantryChef,
  DEFAULT_INVENTORY,
} = require('../src/main/nutrition/pantry_chef');

const chefPlugins = require('../src/main/plugins/builtin/pantry_chef');

test('PantryChef retrieves inventory and adds/consumes items', () => {
  const tmpFile = path.join(os.tmpdir(), `test_chef_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.json`);
  const chef = new PantryChef(tmpFile);

  const items = chef.getInventory();
  assert.ok(items.length >= 8);

  // Add an item
  const added = chef.addItem({
    item: 'Avocados',
    quantity: 4,
    unit: 'pieces',
    location: 'pantry',
    expiryDate: '2026-10-24',
  });
  assert.equal(added.item, 'Avocados');
  assert.equal(chef.getInventory('pantry').some((i) => i.item === 'Avocados'), true);

  // Consume an item
  const consumed = chef.consumeItem('Avocados', 2);
  assert.equal(consumed.quantity, 2);

  try { if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile); } catch {}
});

test('PantryChef detects expiring items and generates recipes', () => {
  const tmpFile = path.join(os.tmpdir(), `test_chef_rec_${Date.now()}.json`);
  const chef = new PantryChef(tmpFile);

  const expiring = chef.checkExpiringItems(4);
  assert.ok(Array.isArray(expiring));

  // Generate recipe standard
  const recipe1 = chef.generateRecipe();
  assert.ok(recipe1.title);
  assert.ok(recipe1.steps.length >= 4);
  assert.ok(recipe1.nutritionalEstimate.proteinGrams > 20);

  // Generate recipe vegetarian
  const recipeVeg = chef.generateRecipe({ dietary: 'vegetarian' });
  assert.ok(recipeVeg.dietaryTags.includes('Vegetarian'));

  try { if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile); } catch {}
});

test('Pantry Chef builtin plugin tools export valid schemas and run properly', async () => {
  assert.ok(Array.isArray(chefPlugins));
  assert.equal(chefPlugins.length, 4);

  const recipeTool = chefPlugins.find((p) => p.name === 'chef_suggest_recipe');
  const auditTool = chefPlugins.find((p) => p.name === 'chef_audit_pantry_fridge');
  const expiryTool = chefPlugins.find((p) => p.name === 'chef_check_expiring_food');
  const restockTool = chefPlugins.find((p) => p.name === 'chef_grocery_restock_list');

  assert.ok(recipeTool);
  assert.ok(auditTool);
  assert.ok(expiryTool);
  assert.ok(restockTool);

  const mockCtx = { log: () => {} };

  const recipeRes = await recipeTool.run({}, mockCtx);
  assert.match(recipeRes, /SMART CHEF RECIPE/i);

  const auditRes = await auditTool.run({ location: 'all' }, mockCtx);
  assert.match(auditRes, /PANTRY & FRIDGE INVENTORY/i);

  const expiryRes = await expiryTool.run({ days_ahead: 5 }, mockCtx);
  assert.match(expiryRes, /EXPIRING FOOD ALERT|FOOD FRESHNESS REPORT/i);

  const restockRes = await restockTool.run({}, mockCtx);
  assert.match(restockRes, /GROCERY RESTOCK/i);
});
