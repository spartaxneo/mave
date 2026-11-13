'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  MemoryStore,
  getMemoryStore,
  defaultMemoryPath,
  purgeUserData: purgeMemoryUserData,
} = require('../src/main/memory');

const {
  PersonalKnowledgeGraph,
  getKnowledgeGraph,
  defaultKnowledgeGraphPath,
  purgeUserData: purgeKnowledgeGraphUserData,
} = require('../src/main/rag/knowledge_graph');

test('Rule 1: Default single-user storage paths when userId is omitted or "default"', () => {
  const memDef = defaultMemoryPath();
  const memDefStr = defaultMemoryPath('default');
  const memDefObj = defaultMemoryPath({ userId: 'default' });

  assert.equal(memDef, memDefStr);
  assert.equal(memDef, memDefObj);
  assert.ok(
    memDef.includes('memory.json'),
    `Expected memory.json in path: ${memDef}`
  );
  assert.ok(
    memDef.includes('mave') || memDef.includes('.bigfoot'),
    `Expected mave or .bigfoot in path: ${memDef}`
  );
  assert.ok(
    !memDef.includes(path.join('users', 'default')),
    `Default path must not be partitioned into users/default: ${memDef}`
  );

  const kgDef = defaultKnowledgeGraphPath();
  const kgDefStr = defaultKnowledgeGraphPath('default');
  const kgDefObj = defaultKnowledgeGraphPath({ userId: 'default' });

  assert.equal(kgDef, kgDefStr);
  assert.equal(kgDef, kgDefObj);
  assert.ok(
    kgDef.includes('knowledge_graph.json'),
    `Expected knowledge_graph.json in path: ${kgDef}`
  );
  assert.ok(
    !kgDef.includes(path.join('users', 'default')),
    `Default path must not be partitioned into users/default: ${kgDef}`
  );
});

test('Rule 2: Multi-tenant partitioned paths for custom userIds', () => {
  const testBaseDir = path.join(os.tmpdir(), `mave_test_paths_${Date.now()}`);

  try {
    const memPath = defaultMemoryPath('alice', { baseDir: testBaseDir });
    const expectedMemPath = path.join(testBaseDir, 'users', 'alice', 'memory.json');
    assert.equal(memPath, expectedMemPath);

    const kgPath = defaultKnowledgeGraphPath('alice', { baseDir: testBaseDir });
    const expectedKgPath = path.join(testBaseDir, 'users', 'alice', 'knowledge_graph.json');
    assert.equal(kgPath, expectedKgPath);

    // Verify option object format
    const memPathOpt = defaultMemoryPath({ userId: 'bob', baseDir: testBaseDir });
    assert.equal(memPathOpt, path.join(testBaseDir, 'users', 'bob', 'memory.json'));

    const kgPathOpt = defaultKnowledgeGraphPath({ userId: 'bob', baseDir: testBaseDir });
    assert.equal(kgPathOpt, path.join(testBaseDir, 'users', 'bob', 'knowledge_graph.json'));

    // Check system default APPDATA partitioning structure
    const sysMem = defaultMemoryPath('tenant_x');
    assert.ok(
      sysMem.includes(path.join('users', 'tenant_x', 'memory.json')),
      `Expected users/tenant_x/memory.json: ${sysMem}`
    );

    const sysKg = defaultKnowledgeGraphPath('tenant_x');
    assert.ok(
      sysKg.includes(path.join('users', 'tenant_x', 'knowledge_graph.json')),
      `Expected users/tenant_x/knowledge_graph.json: ${sysKg}`
    );
  } finally {
    try { fs.rmSync(testBaseDir, { recursive: true, force: true }); } catch {}
  }
});

test('Rule 3: Factory methods forUser and singleton caching per tenant', () => {
  const baseDir = path.join(os.tmpdir(), `mave_factory_${Date.now()}`);

  try {
    const mem1 = MemoryStore.forUser('charlie', { baseDir });
    const mem2 = MemoryStore.forUser('charlie', { baseDir });
    assert.equal(mem1, mem2, 'Repeated forUser calls with same userId should return cached instance');
    assert.equal(mem1.userId, 'charlie');
    assert.equal(mem1.storagePath, path.join(baseDir, 'users', 'charlie', 'memory.json'));

    const memFresh = MemoryStore.forUser('charlie', { baseDir, fresh: true });
    assert.notEqual(mem1, memFresh, 'Passing fresh: true should bypass cache');

    const kg1 = PersonalKnowledgeGraph.forUser('charlie', { baseDir });
    const kg2 = PersonalKnowledgeGraph.forUser('charlie', { baseDir });
    assert.equal(kg1, kg2, 'Repeated forUser calls with same userId should return cached instance');
    assert.equal(kg1.userId, 'charlie');
    assert.equal(kg1.storagePath, path.join(baseDir, 'users', 'charlie', 'knowledge_graph.json'));

    const kgFresh = PersonalKnowledgeGraph.forUser('charlie', { baseDir, fresh: true });
    assert.notEqual(kg1, kgFresh, 'Passing fresh: true should bypass cache');
  } finally {
    try { fs.rmSync(baseDir, { recursive: true, force: true }); } catch {}
  }
});

test('Multi-tenant data isolation: MemoryStore partitions memories strictly by user', () => {
  const baseDir = path.join(os.tmpdir(), `mave_mem_iso_${Date.now()}`);

  try {
    const storeAlice = MemoryStore.forUser('alice', { baseDir, fresh: true });
    const storeBob = MemoryStore.forUser('bob', { baseDir, fresh: true });

    storeAlice.remember('Alice favorite programming language is Rust', { topic: 'preference', keywords: ['rust', 'language'] });
    storeAlice.remember('Alice is building an autonomous robot', { topic: 'project', keywords: ['robot'] });

    storeBob.remember('Bob favorite programming language is Python', { topic: 'preference', keywords: ['python', 'language'] });
    storeBob.remember('Bob is building a decentralized exchange', { topic: 'project', keywords: ['exchange'] });

    // Verify in-memory separation
    assert.equal(storeAlice.memories.length, 2);
    assert.equal(storeBob.memories.length, 2);

    const aliceRecallRust = storeAlice.recall('rust');
    assert.equal(aliceRecallRust.length, 1);
    assert.ok(aliceRecallRust[0].fact.includes('Rust'));

    const aliceRecallPython = storeAlice.recall('python');
    assert.equal(aliceRecallPython.length, 0, 'Alice store must NOT recall Bob facts');

    const bobRecallRust = storeBob.recall('rust');
    assert.equal(bobRecallRust.length, 0, 'Bob store must NOT recall Alice facts');

    const bobRecallPython = storeBob.recall('python');
    assert.equal(bobRecallPython.length, 1);
    assert.ok(bobRecallPython[0].fact.includes('Python'));

    // Verify context summaries are strictly partitioned
    const aliceSummary = storeAlice.contextSummary('programming language');
    assert.ok(aliceSummary.includes('Rust'));
    assert.ok(!aliceSummary.includes('Python'));

    const bobSummary = storeBob.contextSummary('programming language');
    assert.ok(bobSummary.includes('Python'));
    assert.ok(!bobSummary.includes('Rust'));

    // Verify disk persistence separation
    const aliceDiskFile = path.join(baseDir, 'users', 'alice', 'memory.json');
    const bobDiskFile = path.join(baseDir, 'users', 'bob', 'memory.json');

    assert.ok(fs.existsSync(aliceDiskFile), 'Alice file must exist on disk');
    assert.ok(fs.existsSync(bobDiskFile), 'Bob file must exist on disk');

    const aliceDiskRaw = JSON.parse(fs.readFileSync(aliceDiskFile, 'utf8'));
    const bobDiskRaw = JSON.parse(fs.readFileSync(bobDiskFile, 'utf8'));

    assert.equal(aliceDiskRaw.length, 2);
    assert.ok(aliceDiskRaw.every(m => !m.fact.includes('Bob')));

    assert.equal(bobDiskRaw.length, 2);
    assert.ok(bobDiskRaw.every(m => !m.fact.includes('Alice')));
  } finally {
    try { fs.rmSync(baseDir, { recursive: true, force: true }); } catch {}
  }
});

test('Multi-tenant data isolation: PersonalKnowledgeGraph partitions graph strictly by user', () => {
  const baseDir = path.join(os.tmpdir(), `mave_kg_iso_${Date.now()}`);

  try {
    const kgDev = PersonalKnowledgeGraph.forUser('dev_user', { baseDir, fresh: true });
    const kgOps = PersonalKnowledgeGraph.forUser('ops_user', { baseDir, fresh: true });

    // dev_user graph: ServiceA -> uses -> PostgreSQL
    kgDev.addRelation('ServiceA', 'uses', 'PostgreSQL', { env: 'development' });
    // ops_user graph: ServiceA -> uses -> CockroachDB
    kgOps.addRelation('ServiceA', 'uses', 'CockroachDB', { env: 'production' });

    // Verify nodes and queries are partitioned
    assert.ok(kgDev.getNode('postgresql'));
    assert.equal(kgDev.getNode('cockroachdb'), null, 'dev_user must not see ops_user nodes');

    assert.ok(kgOps.getNode('cockroachdb'));
    assert.equal(kgOps.getNode('postgresql'), null, 'ops_user must not see dev_user nodes');

    const devRels = kgDev.queryRelationships({ subject: 'ServiceA' });
    assert.equal(devRels.length, 1);
    assert.equal(devRels[0].target, 'postgresql');

    const opsRels = kgOps.queryRelationships({ subject: 'ServiceA' });
    assert.equal(opsRels.length, 1);
    assert.equal(opsRels[0].target, 'cockroachdb');

    // Verify traversal isolation
    const devTrav = kgDev.traverse('ServiceA', 2);
    assert.ok(devTrav.nodes.some(n => n.id === 'postgresql'));
    assert.ok(!devTrav.nodes.some(n => n.id === 'cockroachdb'));

    const opsTrav = kgOps.traverse('ServiceA', 2);
    assert.ok(opsTrav.nodes.some(n => n.id === 'cockroachdb'));
    assert.ok(!opsTrav.nodes.some(n => n.id === 'postgresql'));

    // Check disk storage isolation
    const devKgFile = path.join(baseDir, 'users', 'dev_user', 'knowledge_graph.json');
    const opsKgFile = path.join(baseDir, 'users', 'ops_user', 'knowledge_graph.json');

    assert.ok(fs.existsSync(devKgFile));
    assert.ok(fs.existsSync(opsKgFile));

    const devRaw = JSON.parse(fs.readFileSync(devKgFile, 'utf8'));
    assert.equal(devRaw.userId, 'dev_user');
    assert.ok(devRaw.nodes.some(n => n.id === 'postgresql'));
    assert.ok(!devRaw.nodes.some(n => n.id === 'cockroachdb'));

    const opsRaw = JSON.parse(fs.readFileSync(opsKgFile, 'utf8'));
    assert.equal(opsRaw.userId, 'ops_user');
    assert.ok(opsRaw.nodes.some(n => n.id === 'cockroachdb'));
    assert.ok(!opsRaw.nodes.some(n => n.id === 'postgresql'));
  } finally {
    try { fs.rmSync(baseDir, { recursive: true, force: true }); } catch {}
  }
});

test('purgeUserData: Purges all partitioned data and caches for specified user while preserving other users', () => {
  const baseDir = path.join(os.tmpdir(), `mave_purge_${Date.now()}`);

  try {
    const memVictim = MemoryStore.forUser('victim', { baseDir, fresh: true });
    const kgVictim = PersonalKnowledgeGraph.forUser('victim', { baseDir, fresh: true });
    memVictim.remember('Sensitive fact to be purged');
    kgVictim.addRelation('SecretProject', 'has_code', 'Classified');

    const memSurvivor = MemoryStore.forUser('survivor', { baseDir, fresh: true });
    const kgSurvivor = PersonalKnowledgeGraph.forUser('survivor', { baseDir, fresh: true });
    memSurvivor.remember('Permanent fact to keep');
    kgSurvivor.addRelation('SafeProject', 'has_code', 'Public');

    const victimMemFile = path.join(baseDir, 'users', 'victim', 'memory.json');
    const victimKgFile = path.join(baseDir, 'users', 'victim', 'knowledge_graph.json');
    const survivorMemFile = path.join(baseDir, 'users', 'survivor', 'memory.json');
    const survivorKgFile = path.join(baseDir, 'users', 'survivor', 'knowledge_graph.json');

    assert.ok(fs.existsSync(victimMemFile));
    assert.ok(fs.existsSync(victimKgFile));
    assert.ok(fs.existsSync(survivorMemFile));
    assert.ok(fs.existsSync(survivorKgFile));

    // Execute purge on victim user
    const purged = purgeMemoryUserData('victim', { baseDir });
    assert.equal(purged, true);

    // Victim files must be deleted
    assert.ok(!fs.existsSync(victimMemFile), 'Victim memory file must be deleted');
    assert.ok(!fs.existsSync(victimKgFile), 'Victim knowledge graph file must be deleted');

    // Survivor files must be intact
    assert.ok(fs.existsSync(survivorMemFile), 'Survivor memory file must remain');
    assert.ok(fs.existsSync(survivorKgFile), 'Survivor knowledge graph file must remain');

    // Next forUser call for victim must start with empty state
    const memVictimNew = MemoryStore.forUser('victim', { baseDir });
    assert.equal(memVictimNew.memories.length, 0);

    const kgVictimNew = PersonalKnowledgeGraph.forUser('victim', { baseDir });
    assert.equal(kgVictimNew.nodes.size, 0);
    assert.equal(kgVictimNew.edges.length, 0);

    // Survivor data remains intact
    assert.equal(memSurvivor.memories.length, 1);
    assert.ok(kgSurvivor.getNode('safeproject'));
  } finally {
    try { fs.rmSync(baseDir, { recursive: true, force: true }); } catch {}
  }
});

test('Rule 1 Backward Compatibility: Constructor and helper functions preserve single-user callers', () => {
  const tempCustomFile = path.join(os.tmpdir(), `custom_mem_${Date.now()}.json`);
  const tempCustomKgFile = path.join(os.tmpdir(), `custom_kg_${Date.now()}.json`);

  try {
    // 1. Direct file path string constructor for MemoryStore
    const customStore = new MemoryStore(tempCustomFile);
    assert.equal(customStore.file, tempCustomFile);
    customStore.remember('Custom file memory');
    assert.ok(fs.existsSync(tempCustomFile));

    // 2. Direct storagePath options constructor for PersonalKnowledgeGraph
    const customKg = new PersonalKnowledgeGraph({ storagePath: tempCustomKgFile });
    assert.equal(customKg.storagePath, tempCustomKgFile);
    customKg.addNode('CustomNode');
    assert.ok(fs.existsSync(tempCustomKgFile));

    // 3. getMemoryStore with file path
    const getMem = getMemoryStore(tempCustomFile);
    assert.equal(getMem.file, tempCustomFile);

    // 4. getKnowledgeGraph with file path
    const getKg = getKnowledgeGraph(tempCustomKgFile);
    assert.equal(getKg.storagePath, tempCustomKgFile);
  } finally {
    try { fs.unlinkSync(tempCustomFile); } catch {}
    try { fs.unlinkSync(tempCustomKgFile); } catch {}
  }
});
