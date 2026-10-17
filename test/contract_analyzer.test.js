'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  ContractAnalyzer,
  getContractAnalyzer,
  RED_FLAG_RULES,
} = require('../src/main/legal/contract_analyzer');

const legalPlugins = require('../src/main/plugins/builtin/contract_analyzer');

test('ContractAnalyzer identifies predatory IP assignment and non-compete clauses', () => {
  const analyzer = getContractAnalyzer();

  const sampleContract = `
    EMPLOYEE INTELLECTUAL PROPERTY AND RESTRICTIVE COVENANTS
    1. Employee agrees to assign all inventions, ideas, and intellectual property developed outside of working hours on personal equipment to the Employer.
    2. Employee shall not compete or work for any competitor for a period of 2 years after termination.
    3. Employee agrees to indemnify and hold harmless the Company against any and all losses without limitation.
  `;

  const report = analyzer.analyzeText(sampleContract);
  assert.equal(report.redFlagsFound, 3);
  assert.match(report.overallRisk, /High Risk/i);

  assert.ok(report.redFlags.some((f) => f.category.includes('IP')));
  assert.ok(report.redFlags.some((f) => f.category.includes('Non-Compete')));
  assert.ok(report.redFlags.some((f) => f.category.includes('Indemnification')));
});

test('ContractAnalyzer returns low risk for fair contract', () => {
  const analyzer = getContractAnalyzer();

  const fairContract = `
    This Consulting Agreement outlines the deliverables for web development.
    Client shall pay Consultant within thirty days of invoice.
    Either party may terminate with 30 days written notice.
  `;

  const report = analyzer.analyzeText(fairContract);
  assert.equal(report.redFlagsFound, 0);
  assert.match(report.overallRisk, /Low Risk/i);
});

test('Legal Contract Analyzer builtin plugin tools export valid schemas and run properly', async () => {
  assert.ok(Array.isArray(legalPlugins));
  assert.equal(legalPlugins.length, 1);

  const auditTool = legalPlugins.find((p) => p.name === 'legal_audit_contract_red_flags');
  assert.ok(auditTool);

  const mockCtx = { log: () => {} };

  const auditRes = await auditTool.run({
    contract_text: 'Employee agrees to assign all inventions developed outside of working hours on personal equipment.',
  }, mockCtx);

  assert.match(auditRes, /RED-FLAG AUDIT/i);
  assert.match(auditRes, /IP & Side Project Ownership/i);
});
