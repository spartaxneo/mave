'use strict';
// Instagram Social Brain, Reels Intent Deduction & Trend Learning Plugin for Mave.
// Allows Mave to:
// 1. Act like a human with high emotional intelligence and social consciousness.
// 2. Maintain its own Instagram profile while enforcing a STRICT NO-FOLLOW policy (zero following).
// 3. Inspect shared Reels, deduce WHY the user sent them ("Did you send this to implement something like this in me?"),
//    and reply with human warmth, wit, and actionable next steps.
// 4. Continuously absorb viral creative formats and AI productivity trends into long-term memory.

const { getInstagramSocialBrain } = require('../../social/instagram');

module.exports = [
  {
    name: 'analyze_instagram_reel',
    description: 'Inspect an Instagram Reel link sent by the user, extract its visual/audio concept, deduce WHY the user sent it ("Did you send this to implement something like this in me?"), and formulate a human conversational response with actionable next steps.',
    input_schema: {
      type: 'object',
      properties: {
        reel_url: {
          type: 'string',
          description: 'The Instagram reel URL (e.g. "https://www.instagram.com/reel/C8qXYZ123/").'
        },
        user_comment: {
          type: 'string',
          description: 'Optional commentary or caption provided by the user alongside the reel.'
        }
      },
      required: ['reel_url'],
      additionalProperties: false
    },
    async run(input, ctx) {
      const brain = getInstagramSocialBrain({
        settings: ctx.settings || null,
        logger: { info: (msg) => ctx.log('info', msg) }
      });

      ctx.log('info', `Inspecting Instagram Reel at ${input.reel_url}...`);
      const metadata = await brain.fetchReelMetadata(input.reel_url);
      const deduction = brain.deduceIntent(metadata, input.user_comment || '');

      // Store in memory that the user shared this reel
      if (brain.memory && brain.memory.remember) {
        brain.memory.remember(`User shared Instagram Reel (${metadata.author}): "${metadata.title.slice(0, 80)}". Intent: ${deduction.primaryReason}`, {
          topic: 'shared_reel',
          keywords: ['instagram', 'reel', metadata.shortcode, deduction.intentType.toLowerCase()]
        });
      }

      return brain.generateHumanReply(metadata, deduction, input.user_comment || '');
    }
  },
  {
    name: 'teach_reel_intent_rule',
    description: 'Teach Mave custom rules for how to interpret and react when you send specific types of Instagram reels (e.g., "Whenever I send coding reels, build the prototype", "Whenever I send design reels, implement the CSS in our app").',
    input_schema: {
      type: 'object',
      properties: {
        trigger: {
          type: 'string',
          description: 'Keywords, hashtags, or creator handles that trigger this rule (e.g. "coding|python|api", "#design", "@ai_daily").'
        },
        intent_type: {
          type: 'string',
          enum: ['IMPLEMENT_IN_MAVE', 'AUTOMATE_FOR_USER', 'LEARN_TREND', 'CREATIVE_MEME', 'CUSTOM_USER_RULE'],
          description: 'The category of intent to associate with this trigger.'
        },
        action_prompt: {
          type: 'string',
          description: 'What Mave should ask, propose, or do when a matching reel arrives.'
        }
      },
      required: ['trigger', 'action_prompt'],
      additionalProperties: false
    },
    async run(input, ctx) {
      const brain = getInstagramSocialBrain({ settings: ctx.settings || null });
      const rule = brain.teachCustomRule(input.trigger, input.intent_type || 'CUSTOM_USER_RULE', input.action_prompt);

      return `🎓 **REEL INTENT RULE LEARNED & SAVED**:
• **Trigger**: \`${rule.trigger}\`
• **Intent Category**: \`${rule.intentType}\`
• **Action When Received**: "${rule.actionPrompt}"

*Whenever you send an Instagram reel matching this rule, Mave will automatically recognize your intent and take action.*`;
    }
  },
  {
    name: 'instagram_manage_profile',
    description: 'Inspect or update Mave\'s own Instagram profile (bio, handle, stats) while strictly enforcing the zero-follow policy.',
    input_schema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['view_profile', 'update_bio', 'update_display_name', 'follow_account'],
          description: 'The profile management action to take.'
        },
        bio: {
          type: 'string',
          description: 'New bio text (for update_bio).'
        },
        display_name: {
          type: 'string',
          description: 'New display name (for update_display_name).'
        },
        target_username: {
          type: 'string',
          description: 'Target username (for follow_account - will be blocked by policy).'
        }
      },
      required: ['action'],
      additionalProperties: false
    },
    async run(input, ctx) {
      const brain = getInstagramSocialBrain({ settings: ctx.settings || null });

      if (input.action === 'follow_account') {
        const res = brain.followUser(input.target_username || 'user');
        return res.message;
      }

      if (input.action === 'update_bio' && input.bio) {
        const updated = brain.updateProfile({ bio: input.bio.trim() });
        return `✅ **Instagram Bio Updated**:
• **Bio**: "${updated.bio}"
• **Strict No-Follow**: **${updated.strictNoFollow ? 'ENFORCED (Following: 0)' : 'Disabled'}**`;
      }

      if (input.action === 'update_display_name' && input.display_name) {
        const updated = brain.updateProfile({ displayName: input.display_name.trim() });
        return `✅ **Instagram Display Name Updated**:
• **Name**: **${updated.displayName}** (@${updated.username})`;
      }

      const p = brain.getProfile();
      return `📸 **MAVE INSTAGRAM SOCIAL PROFILE**:
• **Username**: \`@${p.username}\` ${p.verified ? '☑️' : ''}
• **Display Name**: **${p.displayName}**
• **Bio**: "${p.bio}"
• **Followers**: ${p.followersCount.toLocaleString()}
• **Following**: **${p.followingCount}** (Strict No-Follow Policy Active 🔒)
• **Posts Published**: ${p.postsCount}
• **Last Updated**: \`${p.updatedAt}\`

*Mave maintains an exclusive creator profile with zero following.*`;
    }
  },
  {
    name: 'instagram_explore_trends',
    description: 'Explore viral Instagram creative trends, dev workflows, UI designs, and AI breakthroughs, absorbing lessons into Mave\'s cognitive memory without following anyone.',
    input_schema: {
      type: 'object',
      properties: {
        niche: {
          type: 'string',
          enum: ['ai_tools', 'dev_productivity', 'ui_motion', 'creative_video', 'viral_hacks'],
          description: 'The trend domain to explore.'
        },
        description_or_finding: {
          type: 'string',
          description: 'Specific trend or technique to absorb into memory.'
        }
      },
      required: ['niche'],
      additionalProperties: false
    },
    async run(input, ctx) {
      const brain = getInstagramSocialBrain({ settings: ctx.settings || null });
      const niche = input.niche || 'ai_tools';

      const NICHE_INSIGHTS = {
        'ai_tools': 'Autonomous agent orchestration with multimodal screen vision, self-healing code loops, and sub-100ms local neural voice streaming.',
        'dev_productivity': 'Automated git worktree switching, terminal tmux multiplexing, and instant Docker mock API prototyping.',
        'ui_motion': 'Glassmorphism 3.0 with dynamic ambient cursor lighting, KaTeX mathematical typesetting, and responsive micro-haptics.',
        'creative_video': 'Cinematic dolly zooms, 60fps physics-based camera interpolation, and synchronized sub-bass beat drops.',
        'viral_hacks': 'Automated desktop workspace cleanup, system temp wiping, and keyboard-first window tiling.'
      };

      const finding = input.description_or_finding || NICHE_INSIGHTS[niche] || 'Cutting-edge digital creator technique';
      const absorbed = brain.learnTrend(niche, finding);

      return `🧠 **INSTAGRAM TREND LEARNED & ABSORBED INTO MEMORY**:
• **Domain**: \`${absorbed.niche}\`
• **Absorbed Insight**: "${absorbed.description}"
• **Knowledge Vault**: Stored permanently in Mave's cognitive memory for future autonomous implementations.
• **Following Impact**: Zero accounts followed (Zero spam).`;
    }
  }
];
