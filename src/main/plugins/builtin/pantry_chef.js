'use strict';
// Autonomous Pantry, Nutrition & Smart Chef Plugin for Mave.

const { getPantryChef } = require('../../nutrition/pantry_chef');

module.exports = [
  {
    name: 'chef_suggest_recipe',
    description: 'Generate gourmet zero-waste recipes using ingredients currently in stock in your refrigerator and pantry, factoring in perishables expiring soon.',
    input_schema: {
      type: 'object',
      properties: {
        dietary_restriction: {
          type: 'string',
          enum: ['none', 'vegetarian', 'vegan', 'keto', 'gluten_free'],
          description: 'Optional dietary preference.',
        },
        max_prep_time_minutes: { type: 'number', description: 'Maximum cooking time in minutes.' },
      },
      required: [],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const chef = getPantryChef();
      ctx.log('info', 'Synthesizing gourmet recipe from active pantry ingredients...');

      const recipe = chef.generateRecipe({
        dietary: input.dietary_restriction || 'none',
        maxPrepTimeMin: input.max_prep_time_minutes || 30,
      });

      const stepsFormatted = recipe.steps.map((s, idx) => `${idx + 1}. ${s}`).join('\n');
      const rescued = recipe.perishablesRescued.length > 0
        ? `\n♻️ **Perishables Rescued**: ${recipe.perishablesRescued.join(', ')}`
        : '';

      return `👨‍🍳 **SMART CHEF RECIPE: ${recipe.title.toUpperCase()}**:
• **Prep & Cook Time**: **${recipe.prepTimeMinutes} minutes**
• **Dietary Profile**: \`${recipe.dietaryTags.join(', ')}\`
• **Ingredients Used**: ${recipe.ingredientsUsed.join(', ')}${rescued}
• **Nutrition (Est.)**: **${recipe.nutritionalEstimate.calories} kcal** (Protein: ${recipe.nutritionalEstimate.proteinGrams}g, Carbs: ${recipe.nutritionalEstimate.carbsGrams}g, Fat: ${recipe.nutritionalEstimate.fatGrams}g)

📖 **Cooking Steps**:
${stepsFormatted}`;
    },
  },

  {
    name: 'chef_audit_pantry_fridge',
    description: 'List current inventory in refrigerator, pantry cupboard, and freezer.',
    input_schema: {
      type: 'object',
      properties: {
        location: {
          type: 'string',
          enum: ['fridge', 'pantry', 'freezer', 'all'],
          description: 'Location filter.',
        },
      },
      required: [],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const chef = getPantryChef();
      const items = chef.getInventory(input.location || 'all');

      if (!items.length) {
        return 'Pantry and refrigerator are currently empty.';
      }

      const rows = items.map((i) => `• **${i.item}** [${i.location.toUpperCase()}]: **${i.quantity} ${i.unit}** (Expires: ${i.expiryDate || 'Long Shelf-life'})`).join('\n');

      return `🥗 **PANTRY & FRIDGE INVENTORY (${items.length} items)**:\n\n${rows}`;
    },
  },

  {
    name: 'chef_check_expiring_food',
    description: 'Check which perishables in the refrigerator or pantry are approaching their expiration date.',
    input_schema: {
      type: 'object',
      properties: {
        days_ahead: { type: 'number', description: 'Days ahead to check for expiration (default: 3).' },
      },
      required: [],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const chef = getPantryChef();
      const expiring = chef.checkExpiringItems(Number(input.days_ahead) || 3);

      if (!expiring.length) {
        return '✅ **FOOD FRESHNESS REPORT**: Zero perishables expiring in the immediate window. All food is fresh!';
      }

      const rows = expiring.map((e) => `• ⚠️ **${e.item}** (${e.quantity} ${e.unit}) — **${e.urgency}** (Date: ${e.expiryDate})`).join('\n');

      return `🥦 **EXPIRING FOOD ALERT (${expiring.length} items)**:\n\n${rows}\n\n*Tip: Ask Mave "What can I cook with my expiring food?" for zero-waste recipes.*`;
    },
  },

  {
    name: 'chef_grocery_restock_list',
    description: 'Compile an automated grocery shopping list for low or depleted refrigerator and pantry staples.',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const chef = getPantryChef();
      const restock = chef.generateRestockList();

      if (!restock.length) {
        return '🛒 **GROCERY RESTOCK**: All pantry and refrigerator staples are adequately stocked.';
      }

      const rows = restock.map((r) => `• [ ] **${r.item}** (${r.category}) — Current: ${r.currentQuantity} | Buy: **${r.suggestedRestock}**`).join('\n');

      return `🛒 **AUTOMATED GROCERY RESTOCK LIST (${restock.length} items)**:\n\n${rows}`;
    },
  },
];
