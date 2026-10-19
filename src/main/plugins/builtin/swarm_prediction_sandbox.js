'use strict';
// Swarm Prediction Sandbox Plugin for Mave (MiroFish-Inspired Multi-Agent Future Simulation).

const { getSwarmPredictionSandbox } = require('../../swarm/swarm_prediction_sandbox');

module.exports = [
  {
    name: 'simulate_swarm_future',
    description: 'Runs a multi-agent digital sandbox simulation (MiroFish-style) to forecast the real-world outcome, sentiment, controversy, and virality of any decision, draft post, pricing change, pitch, or event.',
    input_schema: {
      type: 'object',
      properties: {
        topic: { type: 'string', description: 'Core decision, announcement, product launch, reel, or scenario to simulate.' },
        description: { type: 'string', description: 'Detailed context, draft copy, or background information.' },
        domain: {
          type: 'string',
          enum: ['social_media', 'business_product', 'public_relations', 'career_negotiation'],
          description: 'Domain context for persona population generation (default: social_media).'
        },
        population_size: { type: 'number', description: 'Number of synthetic stakeholder agents (default: 10, max: 40).' },
        rounds: { type: 'number', description: 'Number of temporal simulation rounds to run (default: 3).' },
      },
      required: ['topic'],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const sandbox = getSwarmPredictionSandbox();
      ctx.log('info', `Running Swarm Prediction Simulation: "${input.topic}" (${input.domain || 'social_media'})`);

      const sim = await sandbox.runSimulation({
        topic: input.topic,
        description: input.description || '',
        domain: input.domain || 'social_media',
        populationSize: input.population_size || 10,
        rounds: input.rounds || 3,
      });

      const metrics = sim.metrics;
      const breakdown = metrics.stanceBreakdown;

      const topActions = sim.timelineRounds[sim.timelineRounds.length - 1].actions.slice(0, 4)
        .map(a => `• **${a.agentName}** (${a.role} • \`${a.stance}\`): "${a.statement}"`)
        .join('\n');

      const flashpoints = sim.keyFlashpoints.map(f => `⚠️ ${f}`).join('\n');
      const recs = sim.strategicRecommendations.map(r => `💡 ${r}`).join('\n');

      return `🔮 **SWARM PREDICTION SANDBOX REPORT (MiroFish Engine)**:
• **Scenario**: "${sim.topic}"
• **Simulation ID**: \`${sim.id}\`
• **Stakeholder Population**: ${sim.populationSize} synthetic agents across ${sim.roundsCount} temporal rounds

📊 **QUANTITATIVE FORECAST METRICS**:
• **Consensus Agreement**: **${metrics.consensusScore}%**
• **Pushback / Controversy Score**: **${metrics.controversyScore}%**
• **Estimated Virality Multiplier**: **${metrics.viralityMultiplier}x**
• **Stance Breakdown**: 🟢 Support: ${breakdown.support} | 🔴 Oppose: ${breakdown.oppose} | 🟡 Skeptical: ${breakdown.skeptical} | ⚪ Neutral: ${breakdown.neutral}

🎭 **EQUILIBRIUM STAKEHOLDER REACTIONS (Round ${sim.roundsCount})**:
${topActions}

⚡ **KEY FLASHPOINTS & FRICTION**:
${flashpoints}

🎯 **STRATEGIC RECOMMENDATIONS**:
${recs}

*(To test an alternative scenario, run \`run_what_if_branch\` with simulation ID \`${sim.id}\`, or interview any agent with \`interview_simulation_agent\`)*.`;
    },
  },

  {
    name: 'run_what_if_branch',
    description: 'Forks an existing simulation and tests counterfactual modifications (e.g., "Add 30-day money-back guarantee", "Lower price to $49", "Release apology first") to compare outcomes side-by-side.',
    input_schema: {
      type: 'object',
      properties: {
        simulation_id: { type: 'string', description: 'ID of parent simulation to branch from.' },
        branch_name: { type: 'string', description: 'Short descriptive label for the branch.' },
        modifications_summary: { type: 'string', description: 'Description of what variables are changed in this branch.' },
      },
      required: ['simulation_id', 'branch_name', 'modifications_summary'],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const sandbox = getSwarmPredictionSandbox();
      ctx.log('info', `Forking What-If Branch "${input.branch_name}" from ${input.simulation_id}`);

      const branch = await sandbox.runWhatIfBranch({
        simulationId: input.simulation_id,
        branchName: input.branch_name,
        variableModifications: { note: input.modifications_summary, concessionApplied: true },
        rounds: 2,
      });

      return `🌿 **WHAT-IF COUNTERFACTUAL BRANCH EXECUTED**:
• **Branch ID**: \`${branch.branchId}\`
• **Branch Name**: "${branch.branchName}"
• **Parent Simulation**: \`${branch.parentSimulationId}\`
• **Intervention Applied**: "${input.modifications_summary}"

📈 **COMPARATIVE DELTA OUTCOMES**:
• **New Consensus Score**: **${branch.metrics.consensusScore}%**
• **Net Delta vs Baseline**: **${branch.metrics.deltaConsensus}**
• **Net Trajectory**: ${branch.metrics.improvedOutcome ? '✅ Measurably Improved Stakeholder Acceptance' : '🔻 Lower Acceptance or Unchanged'}

*(Use \`interview_simulation_agent\` to question how specific personas reacted to this modification)*.`;
    },
  },

  {
    name: 'interview_simulation_agent',
    description: 'Directly interrogates a specific persona from the simulated population to unpack their psychological motivations, objections, and what would change their mind.',
    input_schema: {
      type: 'object',
      properties: {
        simulation_id: { type: 'string', description: 'ID of the simulation.' },
        agent_id: { type: 'string', description: 'Agent ID (e.g. agent_1, agent_2) or persona name.' },
        question: { type: 'string', description: 'Specific question or challenge to ask the simulated agent.' },
      },
      required: ['simulation_id', 'agent_id', 'question'],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const sandbox = getSwarmPredictionSandbox();
      ctx.log('info', `Interrogating Agent ${input.agent_id} in ${input.simulation_id}`);

      const interview = await sandbox.interviewAgent({
        simulationId: input.simulation_id,
        agentId: input.agent_id,
        question: input.question,
      });

      return interview.answer;
    },
  },

  {
    name: 'list_simulation_history',
    description: 'Lists all past swarm prediction runs with consensus scores, virality ratings, and branches.',
    input_schema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    async run(input, ctx) {
      const sandbox = getSwarmPredictionSandbox();
      const list = sandbox.listSimulations();

      if (list.length === 0) {
        return 'ℹ️ No swarm simulations recorded yet. Run `simulate_swarm_future` to predict an outcome.';
      }

      const rows = list.slice(0, 10).map((s, idx) => {
        const date = new Date(s.createdAt).toLocaleDateString();
        return `${idx + 1}. **"${s.topic}"** (\`${s.domain}\`) - ${date}\n   - Consensus: **${s.consensusScore}%** | Virality: **${s.viralityMultiplier}x** | ID: \`${s.id}\` (Branches: ${s.branchesCount})`;
      });

      return `📋 **SWARM SIMULATION ARCHIVE (${list.length} Total)**:\n\n${rows.join('\n\n')}`;
    },
  },
];
