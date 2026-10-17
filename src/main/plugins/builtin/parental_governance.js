'use strict';
// Parental Admin Governance, Rules Engine & User Power Matrix Plugin for Mave.
// Governs:
// 1. User Freedom: Each user can inspect and customize their own profile, custom instructions, voice, and companion.
// 2. Parent Admin Control: The Parent Admin manages global mandatory safety rules and per-user boundaries.
// 3. Power Allocation Matrix: Configures exactly how much power (Super Admin, Standard, Safe Kid, Read-Only) each user & device possesses.

const { getGovernanceManager, POWER_TIERS } = require('../../security/governance');

module.exports = [
  {
    name: 'governance_get_active_policies',
    description: 'Inspect the active user profile, capability limits, parental safety rules, and power levels assigned to this session and device.',
    input_schema: {
      type: 'object',
      properties: {
        user_id: {
          type: 'string',
          description: 'Optional specific user ID to inspect (e.g. "admin", "kid", "guest"). If omitted, inspects the current active user.',
        },
      },
      required: [],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const gov = getGovernanceManager();
      const targetId = input.user_id || gov.activeUserId;
      const user = gov.getUser(targetId) || gov.getActiveUser();
      const tier = user.powerTier || 'standard';
      const tierInfo = POWER_TIERS[tier] || POWER_TIERS.standard;
      const userRules = gov.getPerUserRules(user.id);
      const globalRules = gov.getGlobalRules();
      const devices = gov.getDevices();

      const perms = user.permissions || tierInfo.permissions || {};
      const permLines = [
        `• Terminal & PowerShell: ${perms.canRunTerminal ? 'ALLOWED ✅' : 'STRICTLY PROHIBITED ⛔'}`,
        `• Screen Mouse/Keyboard Control: ${perms.canControlScreen ? 'ALLOWED ✅' : 'PROHIBITED ⛔'}`,
        `• Secret Password Vault: ${perms.canAccessVault ? 'ALLOWED ✅' : 'RESTRICTED ⛔'}`,
        `• Screen Memory (Total Recall): ${perms.canAccessScreenMemory ? 'ALLOWED ✅' : 'RESTRICTED ⛔'}`,
        `• Remote Device Control (Hands): ${perms.canControlRemoteDevices ? 'ALLOWED ✅' : 'RESTRICTED ⛔'}`,
        `• Online Purchases & Payments: ${perms.canMakePurchases ? 'ALLOWED ✅' : 'RESTRICTED ⛔'}`,
      ].join('\n');

      let out = `🛡️ **PARENTAL GOVERNANCE & ACTIVE POLICIES**
- **Active User**: ${user.name} (\`${user.id}\`)
- **Role**: ${user.role.toUpperCase()}
- **Power Tier**: **${tierInfo.label}**
  *${tierInfo.description}*

⚡ **Granted Capabilities**:
${permLines}`;

      if (user.customInstructions) {
        out += `\n\n📝 **User's Custom Instructions (Freedom of Customization)**:
"${user.customInstructions}"`;
      }

      if (userRules.length > 0) {
        out += `\n\n👤 **Specific Rules for ${user.name}**:
${userRules.map((r, i) => `  ${i + 1}. ${r}`).join('\n')}`;
      }

      if (globalRules.length > 0) {
        out += `\n\n🌐 **Master Parent Admin Global Rules**:
${globalRules.map((r, i) => `  ${i + 1}. ${r}`).join('\n')}`;
      }

      if (devices.length > 0) {
        out += `\n\n💻 **Connected Devices Power Allocation**:
${devices.map(d => `  • **${d.name}** (\`${d.id}\`): Assigned to \`${d.assignedUserId}\` | Tier: \`${d.powerTier}\``).join('\n')}`;
      }

      return out;
    },
  },

  {
    name: 'governance_customize_user_profile',
    description: 'Allows a user to customize their own personal profile and experience (Freedom of Customization): name, custom instructions (what Mave should know about them), preferred voice, companion avatar, theme, or language.',
    input_schema: {
      type: 'object',
      properties: {
        user_id: {
          type: 'string',
          description: 'User ID to customize (defaults to currently active user).',
        },
        name: {
          type: 'string',
          description: 'Display name for the user.',
        },
        custom_instructions: {
          type: 'string',
          description: 'What Mave should know about the user to provide better responses (habits, goals, preferred style, interests).',
        },
        voice: {
          type: 'string',
          description: 'Preferred AI voice (e.g. "af_heart", "af_bella", "bf_emma", "am_adam").',
        },
        companion_species: {
          type: 'string',
          description: 'Preferred desktop companion avatar (e.g. "meta_muse", "baby_dragon", "mini_robot", "cyber_fox", "pixel_cat").',
        },
        companion_theme: {
          type: 'string',
          description: 'Companion glow color palette (e.g. "sunset", "cyber", "nebula", "sakura", "ocean", "golden").',
        },
        language: {
          type: 'string',
          description: 'Preferred language (e.g. "auto", "English", "Hindi", "Spanish", "French", "German", "Japanese").',
        },
        theme: {
          type: 'string',
          description: 'UI theme ("dark", "light", or "system").',
        },
      },
      required: [],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const gov = getGovernanceManager();
      const targetId = input.user_id || gov.activeUserId;

      const updates = {};
      if (input.name) updates.name = input.name;
      if (input.custom_instructions != null) updates.customInstructions = input.custom_instructions;
      if (input.voice) updates.voice = input.voice;
      if (input.companion_species) updates.companionSpecies = input.companion_species;
      if (input.companion_theme) updates.companionTheme = input.companion_theme;
      if (input.language) updates.language = input.language;
      if (input.theme) updates.theme = input.theme;

      const result = gov.updateCustomization(targetId, updates);
      return `✅ **Profile Customized Successfully** for **${result.user.name}** (\`${result.user.id}\`):
- Instructions: "${result.user.customInstructions || '(None)'}"
- Voice: \`${result.user.voice}\`
- Companion: \`${result.user.companionSpecies}\` (\`${result.user.companionTheme}\` glow)
- Language: \`${result.user.language}\`
- Theme: \`${result.user.theme}\``;
    },
  },

  {
    name: 'governance_admin_manage_rules',
    description: 'Master Parent Admin tool to add, remove, or modify global safety rules or per-user rules for Mave. Requires Master Admin PIN (default 1508).',
    input_schema: {
      type: 'object',
      properties: {
        admin_pin: {
          type: 'string',
          description: 'Master Parent Admin PIN (default "1508"). Required for security.',
        },
        action: {
          type: 'string',
          enum: ['add_global_rule', 'remove_global_rule', 'set_user_rules', 'list_rules'],
          description: 'Action to perform on rules.',
        },
        rule_text: {
          type: 'string',
          description: 'The rule description to add or remove (e.g. "No shopping without confirmation", "Curfew at 10 PM").',
        },
        target_user_id: {
          type: 'string',
          description: 'User ID when setting user-specific rules (e.g. "kid", "guest").',
        },
        rules_list: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of rules to set for the user or global list.',
        },
      },
      required: ['admin_pin', 'action'],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const gov = getGovernanceManager();
      if (!gov.verifyAdmin(input.admin_pin)) {
        return '⛔ **Unauthorized**: Invalid Parent Admin PIN. Only authorized parents can modify safety rules.';
      }

      if (input.action === 'list_rules') {
        const globalRules = gov.getGlobalRules();
        return `📋 **ACTIVE MASTER PARENT RULES**:
${globalRules.map((r, i) => `${i + 1}. ${r}`).join('\n')}`;
      }

      if (input.action === 'add_global_rule') {
        if (!input.rule_text) return '❌ Please provide `rule_text` to add.';
        const rules = gov.getGlobalRules();
        rules.push(input.rule_text.trim());
        gov.adminSetGlobalRules(rules, input.admin_pin);
        return `✅ **Global Rule Added**: "${input.rule_text.trim()}". Mave will enforce this across all devices and users.`;
      }

      if (input.action === 'remove_global_rule') {
        if (!input.rule_text) return '❌ Please provide `rule_text` to remove.';
        const rules = gov.getGlobalRules().filter(r => !r.toLowerCase().includes(input.rule_text.toLowerCase()));
        gov.adminSetGlobalRules(rules, input.admin_pin);
        return `✅ **Global Rule Removed** matching "${input.rule_text}".`;
      }

      if (input.action === 'set_user_rules') {
        if (!input.target_user_id) return '❌ Please specify `target_user_id` (e.g. "kid").';
        const rules = Array.isArray(input.rules_list) ? input.rules_list : (input.rule_text ? [input.rule_text] : []);
        gov.adminSetPerUserRules(input.target_user_id, rules, input.admin_pin);
        return `✅ **Rules Updated** for user \`${input.target_user_id}\` (${rules.length} active rules).`;
      }

      return '❌ Unrecognized rule action.';
    },
  },

  {
    name: 'governance_admin_set_power',
    description: 'Master Parent Admin tool to assign power tiers (super_admin, standard, safe_kid, read_only) and capability permissions to a user or device. Requires Master Admin PIN (default 1508).',
    input_schema: {
      type: 'object',
      properties: {
        admin_pin: {
          type: 'string',
          description: 'Master Parent Admin PIN (default "1508"). Required for security.',
        },
        target_type: {
          type: 'string',
          enum: ['user', 'device'],
          description: 'Whether assigning power to a user or a device.',
        },
        target_id: {
          type: 'string',
          description: 'User ID (e.g. "kid", "guest") or Device ID (e.g. "host_pc", "default_mobile").',
        },
        power_tier: {
          type: 'string',
          enum: ['super_admin', 'standard', 'safe_kid', 'read_only'],
          description: 'Power tier level to assign.',
        },
        can_run_terminal: {
          type: 'boolean',
          description: 'Allow or prohibit running raw terminal/PowerShell commands.',
        },
        can_control_screen: {
          type: 'boolean',
          description: 'Allow or prohibit mouse clicks and keystrokes.',
        },
        can_access_vault: {
          type: 'boolean',
          description: 'Allow or prohibit password vault access.',
        },
        can_access_screen_memory: {
          type: 'boolean',
          description: 'Allow or prohibit visual screen history recall.',
        },
        can_control_remote_devices: {
          type: 'boolean',
          description: 'Allow or prohibit controlling other connected devices.',
        },
        can_make_purchases: {
          type: 'boolean',
          description: 'Allow or prohibit making online purchases.',
        },
      },
      required: ['admin_pin', 'target_type', 'target_id', 'power_tier'],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const gov = getGovernanceManager();
      if (!gov.verifyAdmin(input.admin_pin)) {
        return '⛔ **Unauthorized**: Invalid Parent Admin PIN. Only authorized parents can adjust power levels.';
      }

      const permissions = {};
      if (input.can_run_terminal !== undefined) permissions.canRunTerminal = input.can_run_terminal;
      if (input.can_control_screen !== undefined) permissions.canControlScreen = input.can_control_screen;
      if (input.can_access_vault !== undefined) permissions.canAccessVault = input.can_access_vault;
      if (input.can_access_screen_memory !== undefined) permissions.canAccessScreenMemory = input.can_access_screen_memory;
      if (input.can_control_remote_devices !== undefined) permissions.canControlRemoteDevices = input.can_control_remote_devices;
      if (input.can_make_purchases !== undefined) permissions.canMakePurchases = input.can_make_purchases;

      if (input.target_type === 'user') {
        const updateData = {
          powerTier: input.power_tier,
          permissions: Object.keys(permissions).length > 0 ? permissions : undefined,
        };
        const res = gov.adminUpdateUser(input.target_id, updateData, input.admin_pin);
        return `⚡ **User Power Level Updated**:
- User: **${res.user.name}** (\`${res.user.id}\`)
- Power Tier: **${res.user.powerTier}**
- Terminal Access: ${res.user.permissions.canRunTerminal ? 'Enabled' : 'Disabled'}
- Screen Control: ${res.user.permissions.canControlScreen ? 'Enabled' : 'Disabled'}
- Vault Access: ${res.user.permissions.canAccessVault ? 'Enabled' : 'Disabled'}`;
      }

      if (input.target_type === 'device') {
        const devConfig = {
          powerTier: input.power_tier,
          permissions: Object.keys(permissions).length > 0 ? permissions : undefined,
        };
        const res = gov.adminSetDevicePower(input.target_id, devConfig, input.admin_pin);
        return `📱 **Device Power Level Updated**:
- Device: **${res.device.name}** (\`${res.device.id}\`)
- Assigned Power Tier: **${res.device.powerTier}**
- Terminal Access: ${res.device.permissions.canRunTerminal ? 'Enabled' : 'Disabled'}
- Screen Control: ${res.device.permissions.canControlScreen ? 'Enabled' : 'Disabled'}`;
      }

      return '❌ Invalid target type.';
    },
  },
];
