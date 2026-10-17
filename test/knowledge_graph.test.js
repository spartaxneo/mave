'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { PersonalKnowledgeGraph } = require('../src/main/rag/knowledge_graph');
const kgPlugin = require('../src/main/plugins/builtin/knowledge_graph');

test('PersonalKnowledgeGraph creates entities, edges, and prevents duplicate relations', () => {
  const tempPath = path.join(os.tmpdir(), `test_kg_${Date.now()}.json`);
  const kg = new PersonalKnowledgeGraph({ storagePath: tempPath });

  const edge1 = kg.addRelation('Alex', 'owns', 'Tesla Model S');
  assert.equal(edge1.source, 'alex');
  assert.equal(edge1.predicate, 'owns');
  assert.equal(edge1.target, 'tesla model s');

  // Duplicate add should update rather than duplicate
  const edge2 = kg.addRelation('Alex', 'owns', 'Tesla Model S', { notes: 'Plaid edition' });
  assert.equal(edge1.id, edge2.id);
  assert.equal(edge2.metadata.notes, 'Plaid edition');

  const alexNode = kg.getNode('Alex');
  assert.equal(alexNode.label, 'Alex');

  try { fs.unlinkSync(tempPath); } catch {}
});

test('PersonalKnowledgeGraph traverses multi-hop connections and finds shortest reasoning path', () => {
  const tempPath = path.join(os.tmpdir(), `test_kg_path_${Date.now()}.json`);
  const kg = new PersonalKnowledgeGraph({ storagePath: tempPath });

  // A -> B -> C -> D
  kg.addRelation('Alice', 'manages', 'Project Falcon');
  kg.addRelation('Project Falcon', 'uses_service', 'AWS Bedrock');
  kg.addRelation('AWS Bedrock', 'region', 'us-east-1');

  // Traverse 2 hops from Alice
  const subGraph = kg.traverse('Alice', 2);
  assert.equal(subGraph.startEntity, 'alice');
  assert.ok(subGraph.nodes.some(n => n.id === 'project falcon'));
  assert.ok(subGraph.nodes.some(n => n.id === 'aws bedrock'));

  // Path finding
  const pathResult = kg.findShortestPath('Alice', 'us-east-1');
  assert.equal(pathResult.found, true);
  assert.equal(pathResult.distance, 3);
  assert.deepEqual(pathResult.path, ['alice', 'project falcon', 'aws bedrock', 'us-east-1']);

  try { fs.unlinkSync(tempPath); } catch {}
});

test('PersonalKnowledgeGraph extracts semantic triples from natural language sentences', () => {
  const kg = new PersonalKnowledgeGraph({ storagePath: path.join(os.tmpdir(), `test_kg_nlp_${Date.now()}.json`) });
  const triples = kg.extractTriplesFromText('Alex owns Rivian R1T. Sarah is allergic to peanuts. Elon works at SpaceX.');

  assert.equal(triples.length, 3);
  assert.equal(triples[0].subject, 'Alex');
  assert.equal(triples[0].predicate, 'owns');
  assert.equal(triples[0].object, 'Rivian R1T');

  assert.equal(triples[1].subject, 'Sarah');
  assert.equal(triples[1].predicate, 'allergic_to');
  assert.equal(triples[1].object, 'peanuts');

  assert.equal(triples[2].subject, 'Elon');
  assert.equal(triples[2].predicate, 'employed_at');
  assert.equal(triples[2].object, 'SpaceX');
});

test('Knowledge Graph builtin plugin tools run properly', async () => {
  const addTool = kgPlugin.find(t => t.name === 'kg_add_relationship');
  const queryTool = kgPlugin.find(t => t.name === 'kg_query_connections');
  const pathTool = kgPlugin.find(t => t.name === 'kg_find_reasoning_path');

  assert.ok(addTool);
  assert.ok(queryTool);
  assert.ok(pathTool);

  const mockCtx = { log: () => {} };
  await addTool.run({ subject: 'Mark', predicate: 'leads', object: 'Engineering' }, mockCtx);
  
  const queryOut = await queryTool.run({ entity: 'Mark' }, mockCtx);
  assert.ok(queryOut.includes('ASSOCIATIVE MEMORY STORED') || queryOut.includes('KNOWLEDGE GRAPH CONNECTIONS'));

  const pathOut = await pathTool.run({ source_entity: 'Mark', target_entity: 'Engineering' }, mockCtx);
  assert.ok(pathOut.includes('ASSOCIATIVE REASONING PATH'));
});
