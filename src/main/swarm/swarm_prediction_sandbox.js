'use strict';

/**
 * SwarmPredictionSandbox - MiroFish-Inspired Multi-Agent Future Simulation Engine
 * 
 * Takes seed data, decisions, drafts, campaigns, reels, or PR statements and constructs
 * an emergent parallel digital sandbox populated with diverse stakeholder personas.
 * Simulates multi-round temporal social interactions, opinion contagion, consensus drift,
 * counterfactual "What-If" branching, and ReACT agent interviewing.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

function defaultStorageDir() {
  const base = process.env.APPDATA 
    ? path.join(process.env.APPDATA, 'Mave', 'swarm_simulations')
    : path.join(os.homedir(), '.mave', 'swarm_simulations');
  fs.mkdirSync(base, { recursive: true });
  return base;
}

const DOMAIN_ARCHETYPES = {
  social_media: [
    { role: 'Viral Creator', archetype: 'Influencer', baseBias: 0.2, influence: 0.9, traits: ['trend-conscious', 'high-reach', 'aesthetic-focused'] },
    { role: 'Tech Enthusiast', archetype: 'Champion', baseBias: 0.6, influence: 0.7, traits: ['early-adopter', 'feature-focused', 'vocal'] },
    { role: 'Critical Skeptic', archetype: 'Skeptic', baseBias: -0.4, influence: 0.8, traits: ['scrutinizing', 'cynical', 'debunking'] },
    { role: 'Casual Scroller', archetype: 'Neutral_Observer', baseBias: 0.0, influence: 0.3, traits: ['entertainment-seeking', 'short-attention', 'relatable'] },
    { role: 'Industry Analyst', archetype: 'Pragmatist', baseBias: 0.1, influence: 0.85, traits: ['data-driven', 'market-focused', 'objective'] },
    { role: 'Brand Watchdog', archetype: 'Critic', baseBias: -0.5, influence: 0.75, traits: ['ethics-first', 'privacy-minded', 'vocal'] },
    { role: 'Meme Amplifier', archetype: 'Amplifier', baseBias: 0.1, influence: 0.65, traits: ['humor-focused', 'share-happy', 'viral'] },
    { role: 'Gen-Z Commenter', archetype: 'Fast_Adopter', baseBias: 0.3, influence: 0.5, traits: ['slang-native', 'visual-first', 'authenticity-seeking'] }
  ],
  business_product: [
    { role: 'Enterprise Buyer', archetype: 'Pragmatist', baseBias: -0.1, influence: 0.85, traits: ['ROI-focused', 'compliance-strict', 'cautious'] },
    { role: 'Startup Founder', archetype: 'Champion', baseBias: 0.5, influence: 0.8, traits: ['speed-focused', 'cost-sensitive', 'innovation-driven'] },
    { role: 'Budget Controller', archetype: 'Skeptic', baseBias: -0.6, influence: 0.9, traits: ['frugal', 'margin-obsessed', 'scrutinizing'] },
    { role: 'Power User', archetype: 'Fast_Adopter', baseBias: 0.4, influence: 0.75, traits: ['deep-feature-usage', 'community-leader', 'demanding'] },
    { role: 'Competitor Scout', archetype: 'Critic', baseBias: -0.3, influence: 0.6, traits: ['benchmarking', 'flaw-finding', 'analytical'] },
    { role: 'Security & Compliance Officer', archetype: 'Gatekeeper', baseBias: -0.4, influence: 0.95, traits: ['risk-averse', 'GDPR-minded', 'thorough'] }
  ],
  public_relations: [
    { role: 'Investigative Journalist', archetype: 'Critic', baseBias: -0.5, influence: 0.9, traits: ['probing', 'fact-checking', 'headline-seeking'] },
    { role: 'Loyal Community Advocate', archetype: 'Champion', baseBias: 0.7, influence: 0.6, traits: ['defensive', 'enthusiastic', 'supportive'] },
    { role: 'Indifferent Consumer', archetype: 'Neutral_Observer', baseBias: 0.0, influence: 0.3, traits: ['unaffected', 'practical', 'convenience-driven'] },
    { role: 'Activist Organizer', archetype: 'Polarizer', baseBias: -0.7, influence: 0.85, traits: ['cause-driven', 'boycott-ready', 'amplifying'] },
    { role: 'Industry Consultant', archetype: 'Pragmatist', baseBias: 0.1, influence: 0.8, traits: ['measured', 'historical-precedent', 'diplomatic'] }
  ],
  career_negotiation: [
    { role: 'Direct Hiring Manager', archetype: 'Champion', baseBias: 0.4, influence: 0.85, traits: ['talent-hungry', 'team-capacity', 'practical'] },
    { role: 'HR Compensation Director', archetype: 'Gatekeeper', baseBias: -0.5, influence: 0.9, traits: ['band-strict', 'equity-conscious', 'precedent-minded'] },
    { role: 'Department Vice President', archetype: 'Pragmatist', baseBias: 0.2, influence: 0.95, traits: ['revenue-impact', 'retention-focused', 'strategic'] },
    { role: 'Senior Peer Specialist', archetype: 'Neutral_Observer', baseBias: 0.1, influence: 0.5, traits: ['culture-fit', 'workload-distribution', 'empathetic'] }
  ]
};

class SwarmPredictionSandbox {
  constructor(options = {}) {
    this.storageDir = options.storageDir || defaultStorageDir();
    this.settings = options.settings || null;
    this.simulations = new Map();
    this._load();
  }

  _load() {
    try {
      if (!fs.existsSync(this.storageDir)) return;
      const indexFile = path.join(this.storageDir, 'simulations_index.json');
      if (fs.existsSync(indexFile)) {
        const list = JSON.parse(fs.readFileSync(indexFile, 'utf8'));
        if (Array.isArray(list)) {
          for (const s of list) {
            if (s && s.id) this.simulations.set(s.id, s);
          }
        }
      }
    } catch {}
  }

  _save() {
    try {
      fs.mkdirSync(this.storageDir, { recursive: true });
      const indexFile = path.join(this.storageDir, 'simulations_index.json');
      const list = [...this.simulations.values()].sort((a, b) => b.createdAt - a.createdAt);
      fs.writeFileSync(indexFile, JSON.stringify(list, null, 2), 'utf8');
    } catch {}
  }

  /**
   * Generates a diverse synthetic population of stakeholders with tailored personas.
   */
  generatePopulation({ topic, domain = 'general', populationSize = 12 }) {
    const d = (domain || '').toLowerCase().replace(/[^a-z_]/g, '');
    const pool = DOMAIN_ARCHETYPES[d] || DOMAIN_ARCHETYPES.social_media;
    const size = Math.max(4, Math.min(populationSize || 10, 40));

    const population = [];
    const firstNames = ['Sarah', 'Marcus', 'Elena', 'Alex', 'Devon', 'Priya', 'Liam', 'Zoe', 'Jordan', 'Maya', 'Chen', 'Amara'];

    for (let i = 0; i < size; i++) {
      const template = pool[i % pool.length];
      const namePrefix = firstNames[i % firstNames.length];
      const agentId = `agent_${i + 1}`;
      
      // Randomize slight variance in initial bias (-0.15 to +0.15)
      const variance = (Math.sin(i * 3.7) * 0.15);
      const rawBias = Math.max(-1.0, Math.min(1.0, template.baseBias + variance));
      
      let initialStance = 'Neutral';
      if (rawBias >= 0.3) initialStance = 'Support';
      else if (rawBias <= -0.3) initialStance = 'Oppose';
      else if (rawBias < 0) initialStance = 'Skeptical';

      population.push({
        id: agentId,
        name: `${namePrefix}_${template.role.replace(/\s+/g, '')}`,
        role: template.role,
        archetype: template.archetype,
        bias: Math.round(rawBias * 100) / 100,
        currentStance: initialStance,
        influence: template.influence,
        traits: template.traits,
        stanceHistory: [initialStance],
        actionsHistory: [],
        memoryContext: `Stakeholder perspective grounded in ${template.role.toLowerCase()} priorities.`
      });
    }

    return population;
  }

  /**
   * Executes a multi-round temporal social sandbox simulation.
   */
  async runSimulation({
    topic,
    description = '',
    domain = 'social_media',
    populationSize = 10,
    rounds = 3,
    variables = {}
  }) {
    if (!topic || !topic.trim()) {
      throw new Error('Simulation topic is required.');
    }

    const simId = `sim_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const population = this.generatePopulation({ topic, domain, populationSize });
    const timelineRounds = [];

    const totalRounds = Math.max(1, Math.min(rounds || 3, 6));

    // Multi-Round Temporal Dynamics Loop
    for (let r = 1; r <= totalRounds; r++) {
      const roundActions = [];
      let roundTotalSentiment = 0;

      for (const agent of population) {
        // 1. Calculate environmental peer pressure / social contagion
        const activeInfluencers = population.filter(p => p.id !== agent.id && p.influence >= 0.75);
        let peerBiasSum = 0;
        for (const inf of activeInfluencers) peerBiasSum += inf.bias;
        const avgPeerBias = activeInfluencers.length > 0 ? (peerBiasSum / activeInfluencers.length) : 0;

        // Dynamic Drift: Agent bias shifts slightly towards high-influence peers
        const drift = (avgPeerBias - agent.bias) * 0.12;
        agent.bias = Math.max(-1.0, Math.min(1.0, agent.bias + drift));

        // Update stance based on shifted bias
        if (agent.bias >= 0.25) agent.currentStance = 'Support';
        else if (agent.bias <= -0.25) agent.currentStance = 'Oppose';
        else if (agent.bias < 0) agent.currentStance = 'Skeptical';
        else agent.currentStance = 'Neutral';

        agent.stanceHistory.push(agent.currentStance);
        roundTotalSentiment += agent.bias;

        // Generate synthetic action & statement for this round
        const actionType = this._resolveActionType(agent, r);
        const statement = this._synthesizeStatement(agent, topic, r, variables);

        const actionEntry = {
          round: r,
          agentId: agent.id,
          agentName: agent.name,
          role: agent.role,
          archetype: agent.archetype,
          actionType,
          statement,
          stance: agent.currentStance,
          bias: Math.round(agent.bias * 100) / 100,
          influence: agent.influence
        };

        agent.actionsHistory.push(actionEntry);
        roundActions.push(actionEntry);
      }

      const avgRoundSentiment = roundTotalSentiment / population.length;
      timelineRounds.push({
        roundNumber: r,
        theme: this._getRoundTheme(r),
        averageSentiment: Math.round(avgRoundSentiment * 100) / 100,
        actions: roundActions
      });
    }

    // InsightForge Predictive Metrics Calculation
    const supporters = population.filter(a => a.currentStance === 'Support').length;
    const opposers = population.filter(a => a.currentStance === 'Oppose').length;
    const skeptics = population.filter(a => a.currentStance === 'Skeptical').length;
    const neutrals = population.filter(a => a.currentStance === 'Neutral').length;

    const consensusScore = Math.round((supporters / population.length) * 100);
    const controversyScore = Math.round(((opposers + skeptics) / population.length) * 100);
    const viralityMultiplier = Math.round((1.0 + (controversyScore > 40 ? 1.8 : 0.8) + (supporters > 5 ? 1.1 : 0.4)) * 10) / 10;

    const keyFlashpoints = this._extractFlashpoints(topic, domain, opposers, skeptics);
    const strategicRecommendations = this._generateRecommendations(consensusScore, controversyScore, domain);

    const simulationRecord = {
      id: simId,
      topic: topic.trim(),
      description: description.trim(),
      domain,
      variables,
      populationSize: population.length,
      roundsCount: totalRounds,
      createdAt: Date.now(),
      metrics: {
        consensusScore,       // % Positive consensus
        controversyScore,     // % Pushback/Polarization
        viralityMultiplier,   // Organic cascade factor
        stanceBreakdown: {
          support: supporters,
          oppose: opposers,
          skeptical: skeptics,
          neutral: neutrals
        }
      },
      keyFlashpoints,
      strategicRecommendations,
      population,
      timelineRounds,
      branches: []
    };

    this.simulations.set(simId, simulationRecord);
    this._save();

    return simulationRecord;
  }

  /**
   * Counterfactual "What-If" Branching.
   * Compares baseline prediction vs an alternative intervention.
   */
  async runWhatIfBranch({ simulationId, branchName, variableModifications = {}, rounds = 2 }) {
    const parentSim = this.simulations.get(simulationId);
    if (!parentSim) {
      throw new Error(`Simulation not found: ${simulationId}`);
    }

    const branchId = `branch_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const mergedVariables = { ...parentSim.variables, ...variableModifications };

    // Clone population state from parent simulation
    const branchPopulation = parentSim.population.map(p => ({
      ...p,
      stanceHistory: [...p.stanceHistory],
      actionsHistory: [...p.actionsHistory]
    }));

    // Inject variable influence shock
    for (const agent of branchPopulation) {
      if (agent.archetype === 'Skeptic' && (variableModifications.guarantee || variableModifications.apology || variableModifications.priceDrop)) {
        agent.bias += 0.35; // Positive shock from concessions
      } else if (agent.archetype === 'Champion') {
        agent.bias += 0.1;
      }
      agent.bias = Math.max(-1.0, Math.min(1.0, agent.bias));
      if (agent.bias >= 0.25) agent.currentStance = 'Support';
      else if (agent.bias <= -0.25) agent.currentStance = 'Oppose';
      else agent.currentStance = 'Neutral';
    }

    const branchRounds = [];
    for (let r = 1; r <= rounds; r++) {
      const roundNum = parentSim.roundsCount + r;
      const actions = [];
      for (const agent of branchPopulation) {
        const actionType = this._resolveActionType(agent, roundNum);
        const statement = `[Branch Modification: ${JSON.stringify(variableModifications)}] ` +
          this._synthesizeStatement(agent, parentSim.topic, roundNum, mergedVariables);
        actions.push({
          round: roundNum,
          agentId: agent.id,
          agentName: agent.name,
          role: agent.role,
          actionType,
          statement,
          stance: agent.currentStance,
          bias: Math.round(agent.bias * 100) / 100
        });
      }
      branchRounds.push({ roundNumber: roundNum, actions });
    }

    const branchSupporters = branchPopulation.filter(a => a.currentStance === 'Support').length;
    const branchConsensus = Math.round((branchSupporters / branchPopulation.length) * 100);
    const deltaConsensus = branchConsensus - parentSim.metrics.consensusScore;

    const branchRecord = {
      branchId,
      branchName: branchName || `Alternative Intervention`,
      parentSimulationId: simulationId,
      variableModifications,
      metrics: {
        consensusScore: branchConsensus,
        deltaConsensus: (deltaConsensus > 0 ? `+${deltaConsensus}%` : `${deltaConsensus}%`),
        improvedOutcome: deltaConsensus > 0
      },
      branchRounds,
      createdAt: Date.now()
    };

    parentSim.branches.push(branchRecord);
    this._save();

    return branchRecord;
  }

  /**
   * ReACT Agent Interrogation / Interview.
   * Speaks directly to a specific persona in the simulation to dissect their reasoning.
   */
  async interviewAgent({ simulationId, agentId, question }) {
    const sim = this.simulations.get(simulationId);
    if (!sim) throw new Error(`Simulation not found: ${simulationId}`);

    const agent = sim.population.find(a => a.id === agentId || a.name.toLowerCase() === (agentId || '').toLowerCase());
    if (!agent) throw new Error(`Agent not found in simulation: ${agentId}`);

    const recentAction = agent.actionsHistory[agent.actionsHistory.length - 1] || {};
    const stance = agent.currentStance;
    const traits = agent.traits.join(', ');

    let mindset = '';
    if (stance === 'Support') {
      mindset = `I'm fully on board with "${sim.topic}". It solves real pain points and aligns with my priority as a ${agent.role}.`;
    } else if (stance === 'Oppose') {
      mindset = `I have serious reservations regarding "${sim.topic}". As a ${agent.role}, the risk, price, or communication feels unvetted.`;
    } else {
      mindset = `I am currently taking a wait-and-see stance on "${sim.topic}". More clarity or trust proof is needed before I commit.`;
    }

    const reply = `**[Interview with ${agent.name} (${agent.role} • Stance: ${stance})]**\n\n` +
      `*Perspective & Mindset*: "${mindset}"\n\n` +
      `*Response to your question ("${question.trim()}")*:\n` +
      `"From my standpoint with traits (${traits}), here is what really matters: ` +
      `I weighed my peer network's feedback and my internal bias score (${agent.bias}). ` +
      (stance === 'Oppose' 
        ? `If you want to win me over, you must address the core friction points directly with transparent guarantees and clear data.`
        : `What stood out to me was the immediate practical utility, though maintaining transparency will be critical to sustain this support.`) +
      `"`;

    return {
      agentId: agent.id,
      agentName: agent.name,
      role: agent.role,
      stance,
      bias: agent.bias,
      question: question.trim(),
      answer: reply
    };
  }

  listSimulations() {
    return [...this.simulations.values()]
      .sort((a, b) => b.createdAt - a.createdAt)
      .map(s => ({
        id: s.id,
        topic: s.topic,
        domain: s.domain,
        createdAt: s.createdAt,
        consensusScore: s.metrics.consensusScore,
        controversyScore: s.metrics.controversyScore,
        viralityMultiplier: s.metrics.viralityMultiplier,
        branchesCount: s.branches ? s.branches.length : 0
      }));
  }

  getSimulation(id) {
    return this.simulations.get(id) || null;
  }

  // --- Helper Synthesizers ---
  _resolveActionType(agent, round) {
    if (round === 1) return 'POST_INITIAL_IMPRESSION';
    if (agent.archetype === 'Influencer' || agent.archetype === 'Amplifier') return 'BOOST_WITH_COMMENTARY';
    if (agent.currentStance === 'Support') return 'ENDORSE_AND_SHARE';
    if (agent.currentStance === 'Oppose') return 'CHALLENGE_AND_CRITIQUE';
    return 'OBSERVE_AND_INQUIRE';
  }

  _synthesizeStatement(agent, topic, round, variables) {
    const p = topic;
    const role = agent.role;
    const stance = agent.currentStance;

    if (round === 1) {
      if (stance === 'Support') return `Initial review of "${p}": genuinely promising angle. Exactly what the space needs.`;
      if (stance === 'Oppose') return `First look at "${p}": seems over-hyped and lacking structural substance. Highly skeptical.`;
      return `Interesting announcement regarding "${p}". Let's see how they execute on the details.`;
    } else if (round === 2) {
      if (stance === 'Support') return `Digging deeper into "${p}": the value proposition holds up well. Recommend testing this.`;
      if (stance === 'Oppose') return `Dissecting the fine print of "${p}": key drawbacks remain unaddressed. Red flags for ${role.toLowerCase()}s.`;
      return `Discourse around "${p}" is heating up. Lots of valid pushback and praise in equal measure.`;
    } else {
      if (stance === 'Support') return `Final assessment: Strongly backing "${p}". The momentum is clear.`;
      if (stance === 'Oppose') return `Final assessment: Passing on "${p}". Needs substantial overhaul to be viable.`;
      return `Final assessment: Leaning cautiously neutral on "${p}". Solid potential if critical adjustments are made.`;
    }
  }

  _getRoundTheme(round) {
    switch (round) {
      case 1: return 'Initial Perception & First Impressions';
      case 2: return 'Discourse, Debate & Peer Contagion';
      case 3: return 'Consensus Crystallization & Market Equilibrium';
      default: return `Extended Evolution Wave ${round}`;
    }
  }

  _extractFlashpoints(topic, domain, opposers, skeptics) {
    const list = [
      `Cost vs perceived value ratio scrutinized by conservative stakeholders.`,
      `Clarity of trust guarantees and real-world execution proof.`,
      `Potential brand reputational risk if promises fall short of expectations.`
    ];
    if (opposers > 2) {
      list.push(`Strong ideological resistance from entrenched incumbents.`);
    }
    return list;
  }

  _generateRecommendations(consensus, controversy, domain) {
    const recs = [];
    if (consensus >= 70) {
      recs.push('High green-light consensus: proceed with aggressive rollout while maintaining existing messaging tone.');
    } else if (consensus >= 50) {
      recs.push('Moderate acceptance: launch with targeted pre-briefs to skeptical influencers to win over swing stakeholders.');
    } else {
      recs.push('High resistance detected: do NOT deploy publicly without addressing core value/price friction points first.');
    }

    if (controversy > 40) {
      recs.push('Prepare a proactive FAQ addressing top 3 skeptic objections to prevent hostile viral cascades.');
    }
    recs.push('Conduct 1-on-1 interviews with fence-sitters to refine messaging before general exposure.');
    return recs;
  }
}

let instance = null;
function getSwarmPredictionSandbox(options = {}) {
  if (!instance) instance = new SwarmPredictionSandbox(options);
  return instance;
}

module.exports = { SwarmPredictionSandbox, getSwarmPredictionSandbox };
