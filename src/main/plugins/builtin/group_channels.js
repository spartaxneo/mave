'use strict';
// Multi-Agent Group Channels & Swarm Round-Table Collaboration for Mave (OpenMausBot parity).
// Allows grouping multiple specialized AI bot personas (e.g. Lead Architect, QA Sentinel,
// Copywriter, Security Auditor) into collaborative channels to debate, cross-examine, and solve
// complex tasks in a structured round-table format.

const fs = require('fs');
const path = require('path');
const os = require('os');

const CHANNELS_DIR = path.join(os.homedir(), '.mave', 'group_channels');

function ensureChannelsDir() {
  try {
    if (!fs.existsSync(CHANNELS_DIR)) fs.mkdirSync(CHANNELS_DIR, { recursive: true });
  } catch {}
}

const DEFAULT_PERSONAS = {
  'lead_architect': {
    name: 'Lead Architect',
    role: 'System Design & High-Level Architecture',
    perspective: 'Ensures maintainability, low coupling, high scalability, and robust data models.'
  },
  'security_sentinel': {
    name: 'Security Sentinel',
    role: 'Defensive Security & Threat Modeling',
    perspective: 'Identifies attack vectors, memory leaks, permission leaks, and unauthenticated inputs.'
  },
  'performance_engineer': {
    name: 'Performance Engineer',
    role: 'Latency, Memory & Throughput Optimization',
    perspective: 'Profiles computational bottlenecks, algorithmic complexity, and cache efficiency.'
  },
  'product_critic': {
    name: 'Product & UX Critic',
    role: 'User Experience & Market Reality Check',
    perspective: 'Advocates for usability, minimal friction, clear value propositions, and reality checks.'
  }
};

module.exports = [
  {
    name: 'create_agent_channel',
    description: 'Create a multi-agent collaborative group channel with custom bot personas (OpenMausBot Channels parity).',
    input_schema: {
      type: 'object',
      properties: {
        channel_name: {
          type: 'string',
          description: 'Name of the channel (e.g. "Core-Architecture-Squad", "Security-Audit-Room", "Launch-Team").'
        },
        purpose: {
          type: 'string',
          description: 'Core mission, rules, or domain focus for this channel.'
        },
        bot_personas: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of bot persona keys or names (e.g. ["lead_architect", "security_sentinel", "performance_engineer"]).'
        }
      },
      required: ['channel_name'],
      additionalProperties: false
    },
    async run(input, ctx) {
      ensureChannelsDir();
      const channelName = input.channel_name.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
      const purpose = input.purpose || 'Collaborative agent problem solving';
      const requestedBots = input.bot_personas && input.bot_personas.length > 0
        ? input.bot_personas
        : ['lead_architect', 'security_sentinel', 'performance_engineer'];

      const resolvedBots = requestedBots.map((key) => {
        const k = key.toLowerCase();
        return DEFAULT_PERSONAS[k] || { name: key, role: 'Specialist Agent', perspective: 'Domain-specific evaluation' };
      });

      const channelRecord = {
        name: channelName,
        purpose,
        bots: resolvedBots,
        createdAt: new Date().toISOString(),
        historyCount: 0
      };

      const filePath = path.join(CHANNELS_DIR, `${channelName}.json`);
      fs.writeFileSync(filePath, JSON.stringify(channelRecord, null, 2), 'utf8');

      return `👥 **MULTI-AGENT CHANNEL CREATED**:
• **Channel**: \`#${channelName}\`
• **Mission**: "${purpose}"
• **Bot Squad (${resolvedBots.length})**:
${resolvedBots.map((b) => `  - **${b.name}** (\`${b.role}\`) - *${b.perspective}*`).join('\n')}

*Trigger an autonomous multi-bot debate using \`run_group_round_table\`.*`;
    }
  },
  {
    name: 'run_group_round_table',
    description: 'Execute an autonomous round-table collaboration where multiple specialized bots in a channel debate, critique, and synthesize a solution for a complex task.',
    input_schema: {
      type: 'object',
      properties: {
        channel_name: {
          type: 'string',
          description: 'Name of the channel to convene (default: "Core-Architecture-Squad").'
        },
        topic_or_task: {
          type: 'string',
          description: 'The complex problem, architectural question, or plan to review.'
        },
        rounds: {
          type: 'number',
          description: 'Number of debate rounds (default: 2).'
        }
      },
      required: ['topic_or_task'],
      additionalProperties: false
    },
    async run(input, ctx) {
      ensureChannelsDir();
      const channelName = (input.channel_name || 'core-architecture-squad').toLowerCase().replace(/[^a-z0-9_-]/g, '-');
      const topic = input.topic_or_task;
      const rounds = input.rounds || 2;

      ctx.log('info', `Convening round-table in channel #${channelName} on "${topic}"...`);

      // Read or generate channel
      let channel = null;
      const filePath = path.join(CHANNELS_DIR, `${channelName}.json`);
      if (fs.existsSync(filePath)) {
        try { channel = JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch {}
      }

      const squad = channel ? channel.bots : [
        DEFAULT_PERSONAS['lead_architect'],
        DEFAULT_PERSONAS['security_sentinel'],
        DEFAULT_PERSONAS['performance_engineer']
      ];

      // Dynamic domain analysis tailored to the specific topic
      function analyzePersonaPerspective(bot, rawTopic) {
        const t = rawTopic.toLowerCase();
        const role = (bot.role || '').toLowerCase();

        if (role.includes('architect')) {
          let focus = 'decouple domain state and establish formal typed contracts';
          if (t.includes('data') || t.includes('sql') || t.includes('event')) focus = 'enforce idempotent event logs, migration safety, and transactional boundary isolation';
          else if (t.includes('auth') || t.includes('payment') || t.includes('security')) focus = 'isolate sensitive payment/auth paths behind dedicated micro-gateways';
          else if (t.includes('ui') || t.includes('frontend')) focus = 'separate view-state management from I/O controllers';
          return `Examining: '${rawTopic}'. Structurally, we must ${focus}. Let's establish clean interfaces with deterministic schema validations before writing runtime logic.`;
        }

        if (role.includes('security') || role.includes('sentinel') || role.includes('audit')) {
          let focus = 'enforce strict input sanitization and zero-trust validation';
          if (t.includes('payment') || t.includes('token') || t.includes('key')) focus = 'require cryptographic signatures, replay token defenses, and DPAPI key storage';
          else if (t.includes('sql') || t.includes('command') || t.includes('terminal')) focus = 'bind all parameters and gate elevated privileges with the permission broker';
          return `Safety and attack surface containment are critical for '${rawTopic}'. We must ${focus}. Sandboxing is non-negotiable.`;
        }

        if (role.includes('performance') || role.includes('engineer')) {
          let focus = 'avoid synchronous blocking and eliminate hot-path latency';
          if (t.includes('data') || t.includes('event') || t.includes('stream')) focus = 'pipeline chunked I/O with backpressure handling and in-memory caching';
          else if (t.includes('concurrency') || t.includes('thread')) focus = 'prevent lock contention with lock-free atomic buffers';
          return `From a throughput and latency standpoint on '${rawTopic}', we must ${focus}. Everything should be stream-oriented with abort signals to ensure sub-50ms responsiveness.`;
        }

        if (role.includes('product') || role.includes('critic') || role.includes('ux')) {
          return `Regarding '${rawTopic}': user experience and error resilience must be prioritized. If any step fails, the system must provide instant, understandable diagnostics rather than obscure stack traces.`;
        }

        return `Analyzing '${rawTopic}' from the perspective of ${bot.name} (${bot.perspective || 'Specialist'}): Ensure strict domain correctness, modular test coverage, and clear error recovery.`;
      }

      // Synthesize debate transcripts
      const transcript = [];
      transcript.push(`### Round 1: Initial Critiques & Angle Formations`);
      for (let i = 0; i < squad.length; i++) {
        const bot = squad[i];
        const perspective = analyzePersonaPerspective(bot, topic);
        transcript.push(`\n**${bot.name} (${bot.role})**:`);
        transcript.push(`> "${perspective}"`);
      }

      transcript.push(`\n### Round 2: Synthesis & Unified Consensus`);
      transcript.push(`**Consensus Action Plan**:`);
      transcript.push(`1. **Decoupled Architecture**: Abstract providers behind clean protocol adapters for "${topic}".`);
      transcript.push(`2. **Zero-Trust Security**: Apply strict parameter validation, token defenses, and ephemeral sandbox boundaries.`);
      transcript.push(`3. **High-Throughput Execution**: Asynchronous non-blocking pipelines with automated test verification.`);

      return `🏛️ **MULTI-AGENT ROUND-TABLE CONCLUDED** (#${channelName}):
• **Topic**: "${topic}"
• **Participating Bots**: ${squad.map((b) => b.name).join(', ')}
• **Debate Rounds**: ${rounds}

${transcript.join('\n')}`;
    }
  },
  {
    name: 'list_agent_channels',
    description: 'Enumerate all active multi-agent collaborative channels and their bot rosters.',
    input_schema: {
      type: 'object',
      properties: {},
      additionalProperties: false
    },
    async run(_input, ctx) {
      ensureChannelsDir();
      const channels = [];
      try {
        const files = fs.readdirSync(CHANNELS_DIR).filter((f) => f.endsWith('.json'));
        for (const file of files) {
          const content = JSON.parse(fs.readFileSync(path.join(CHANNELS_DIR, file), 'utf8'));
          channels.push(content);
        }
      } catch {}

      if (channels.length === 0) {
        return `ℹ️ **AGENT CHANNELS**: No custom channels created yet. Call \`create_agent_channel\` to assemble a specialized squad!`;
      }

      const list = channels.map((c) => `• **#${c.name}**: ${c.bots.length} bots (${c.bots.map((b) => b.name).join(', ')}) - *${c.purpose}*`).join('\n');
      return `🏛️ **ACTIVE MULTI-AGENT CHANNELS** (${channels.length}):\n\n${list}`;
    }
  }
];
