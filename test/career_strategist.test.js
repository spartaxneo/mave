'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { CareerStrategist } = require('../src/main/career/career_strategist');
const careerPlugin = require('../src/main/plugins/builtin/career_strategist');

test('CareerStrategist calculates ATS keyword match percentage and flags missing tech', () => {
  const strategist = new CareerStrategist();
  const resume = 'Experienced software engineer skilled in TypeScript, Python, Docker, and AWS.';
  const job = 'We are seeking an engineer with TypeScript, Python, Kubernetes, Rust, and AWS experience.';

  const match = strategist.evaluateAtsMatch(resume, job);
  assert.equal(match.totalRequiredSkillsFound, 5); // typescript, python, kubernetes, rust, aws
  assert.equal(match.matchedSkills.length, 3);      // typescript, python, aws
  assert.equal(match.missingSkills.length, 2);      // kubernetes, rust
  assert.equal(match.matchPercentage, 60);
  assert.equal(match.atsPassProbability, 'MODERATE');
});

test('CareerStrategist audits resume bullet points for metrics and executive action verbs', () => {
  const strategist = new CareerStrategist();
  const bullets = [
    'Architected distributed event-stream reducing message latency by 45% across 200 servers.',
    'Helped the team with bug fixes and daily code reviews.'
  ];

  const audit = strategist.auditBulletPoints(bullets);
  assert.equal(audit.totalAudited, 2);
  assert.equal(audit.highImpactCount, 1);
  assert.equal(audit.bulletAudits[0].impactTier, 'EXCEPTIONAL');
  assert.equal(audit.bulletAudits[1].impactTier, 'WEAK');
  assert.ok(audit.bulletAudits[1].suggestion.includes('Quantify'));
});

test('CareerStrategist drafts tailored compensation negotiation letters', () => {
  const strategist = new CareerStrategist();
  const counter = strategist.draftCounterOffer({
    candidateName: 'Marcus Vance',
    roleTitle: 'Principal Systems Architect',
    offeredBase: 220000,
    targetBase: 250000,
    equityValuation: 200000,
    competingOffersCount: 1
  });

  assert.equal(counter.gap, 30000);
  assert.ok(counter.subject.includes('Principal Systems Architect'));
  assert.ok(counter.negotiationScript.includes('$250,000'));
  assert.ok(counter.negotiationScript.includes('Marcus Vance'));
  assert.ok(counter.negotiationScript.includes('competing opportunity'));
});

test('Career Strategist builtin plugin tools run properly', async () => {
  const matchTool = careerPlugin.find(t => t.name === 'career_evaluate_ats_match');
  const auditTool = careerPlugin.find(t => t.name === 'career_audit_resume_bullets');
  const draftTool = careerPlugin.find(t => t.name === 'career_draft_negotiation_counter');

  assert.ok(matchTool);
  assert.ok(auditTool);
  assert.ok(draftTool);

  const mockCtx = { log: () => {} };
  const matchOut = await matchTool.run({
    resume_text: 'Python and AWS expert',
    job_description: 'Looking for Python, AWS, and Docker'
  }, mockCtx);
  assert.ok(matchOut.includes('ATS COMPATIBILITY AUDIT'));

  const auditOut = await auditTool.run({
    bullet_points: ['Optimized SQL query performance by 3x']
  }, mockCtx);
  assert.ok(auditOut.includes('RESUME IMPACT AUDIT'));
});
