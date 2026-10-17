'use strict';
// Autonomous Personal Knowledge Graph & Associative Memory Plugin for Mave.

const { getKnowledgeGraph } = require('../../rag/knowledge_graph');

module.exports = [
  {
    name: 'kg_add_relationship',
    description: 'Adds an associative knowledge graph edge between two entities (e.g. Alex -> owns -> Tesla Model S, Sarah -> allergic_to -> Peanuts).',
    input_schema: {
      type: 'object',
      properties: {
        subject: { type: 'string', description: 'Source entity or person name.' },
        predicate: { type: 'string', description: 'Relationship type (e.g., owns, allergic_to, works_on, reports_to).' },
        object: { type: 'string', description: 'Target entity or concept.' },
      },
      required: ['subject', 'predicate', 'object'],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const kg = getKnowledgeGraph();
      ctx.log('info', `Adding knowledge graph relationship: ${input.subject} -[${input.predicate}]-> ${input.object}`);

      const edge = kg.addRelation(input.subject, input.predicate, input.object);
      return `🧠 **ASSOCIATIVE MEMORY STORED**:
• **Link**: \`(${input.subject})\` ➔ \`[${edge.predicate}]\` ➔ \`(${input.object})\`
• **Graph Edge ID**: \`${edge.id}\``;
    },
  },

  {
    name: 'kg_query_connections',
    description: 'Finds all direct connections for a given person, project, place, or concept in the knowledge graph.',
    input_schema: {
      type: 'object',
      properties: {
        entity: { type: 'string', description: 'Entity to query relationships for.' },
      },
      required: ['entity'],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const kg = getKnowledgeGraph();
      ctx.log('info', `Querying knowledge graph connections for: ${input.entity}`);

      const outgoing = kg.queryRelationships({ subject: input.entity });
      const incoming = kg.queryRelationships({ object: input.entity });

      if (outgoing.length === 0 && incoming.length === 0) {
        return `ℹ️ No recorded knowledge graph connections for **${input.entity}**.`;
      }

      const outLines = outgoing.map(e => `• ➔ \`[${e.predicate}]\` **${e.targetLabel}**`).join('\n');
      const inLines = incoming.map(e => `• ⬅️ **${e.sourceLabel}** \`[${e.predicate}]\``).join('\n');

      return `🌐 **KNOWLEDGE GRAPH CONNECTIONS FOR ${input.entity.toUpperCase()}**:
${outLines ? `**Outgoing Links**:\n${outLines}\n` : ''}${inLines ? `**Incoming Links**:\n${inLines}` : ''}`;
    },
  },

  {
    name: 'kg_find_reasoning_path',
    description: 'Finds the multi-hop relational path connecting two entities in Mave associative memory.',
    input_schema: {
      type: 'object',
      properties: {
        source_entity: { type: 'string', description: 'Starting entity.' },
        target_entity: { type: 'string', description: 'Destination entity.' },
      },
      required: ['source_entity', 'target_entity'],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const kg = getKnowledgeGraph();
      ctx.log('info', `Finding graph path between ${input.source_entity} and ${input.target_entity}`);

      const result = kg.findShortestPath(input.source_entity, input.target_entity);
      if (!result.found) {
        return `❌ No associative connection found between **${input.source_entity}** and **${input.target_entity}**.`;
      }

      const hopDescriptions = result.relationshipHops.map(h => `\`(${h.from})\` ──[${h.predicate}]──> \`(${h.to})\``).join('\n');
      return `🔍 **ASSOCIATIVE REASONING PATH** (${result.distance} hops):
${hopDescriptions}`;
    },
  },
];
