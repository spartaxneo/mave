'use strict';
// Autonomous Personal Career & Executive Compensation Strategist Plugin for Mave.

const { getCareerStrategist } = require('../../career/career_strategist');

module.exports = [
  {
    name: 'career_evaluate_ats_match',
    description: 'Compares a resume against a target job description to compute ATS match score and highlight missing high-leverage skills.',
    input_schema: {
      type: 'object',
      properties: {
        resume_text: { type: 'string', description: 'Full text or summary of your resume.' },
        job_description: { type: 'string', description: 'Target job description requirements.' },
      },
      required: ['resume_text', 'job_description'],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const strategist = getCareerStrategist();
      ctx.log('info', 'Analyzing resume against job description for ATS keyword alignment...');

      const evalResult = strategist.evaluateAtsMatch(input.resume_text, input.job_description);
      const matched = evalResult.matchedSkills.length > 0 ? evalResult.matchedSkills.join(', ') : 'None';
      const missing = evalResult.missingSkills.length > 0 ? evalResult.missingSkills.join(', ') : 'None';

      return `🎯 **ATS COMPATIBILITY AUDIT**:
• **Match Score**: **${evalResult.matchPercentage}%** (\`${evalResult.atsPassProbability}\` pass probability)
• **Matched Keywords**: \`${matched}\`
• **Missing Keywords Needed**: \`${missing}\`
💡 **Guidance**: ${evalResult.recommendations}`;
    },
  },

  {
    name: 'career_audit_resume_bullets',
    description: 'Audits resume bullet points for quantifiable metrics (STAR method) and strong executive action verbs.',
    input_schema: {
      type: 'object',
      properties: {
        bullet_points: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of resume experience bullet points to evaluate.',
        },
      },
      required: ['bullet_points'],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const strategist = getCareerStrategist();
      ctx.log('info', 'Auditing resume bullets for quantifiable business impact...');

      const audit = strategist.auditBulletPoints(input.bullet_points || []);
      const lines = audit.bulletAudits.map((b, idx) => `• **#${idx + 1}** [${b.impactTier}]: "${b.bullet}"\n  👉 *${b.suggestion}*`).join('\n');

      return `📈 **RESUME IMPACT AUDIT** (${audit.impactRatio}% high-impact ratio):\n${lines}`;
    },
  },

  {
    name: 'career_draft_negotiation_counter',
    description: 'Generates a polite, persuasive compensation counter-offer script and letter for salary/equity negotiations.',
    input_schema: {
      type: 'object',
      properties: {
        candidate_name: { type: 'string', description: 'Your full name.' },
        role_title: { type: 'string', description: 'Job title.' },
        offered_base: { type: 'number', description: 'Original base salary offered.' },
        target_base: { type: 'number', description: 'Desired target base salary.' },
        equity_valuation: { type: 'number', description: 'Proposed equity value.' },
      },
      required: ['role_title', 'offered_base', 'target_base'],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const strategist = getCareerStrategist();
      ctx.log('info', 'Drafting compensation negotiation counter-offer...');

      const offer = strategist.draftCounterOffer({
        candidateName: input.candidate_name || 'Candidate',
        roleTitle: input.role_title,
        offeredBase: input.offered_base,
        targetBase: input.target_base,
        equityValuation: input.equity_valuation || 100000,
      });

      return `💼 **EXECUTIVE COMPENSATION COUNTER-OFFER DRAFT**:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
**Subject**: \`${offer.subject}\`  
**Base Gap**: +$${offer.gap.toLocaleString()} ($${offer.offeredBase.toLocaleString()} ➔ $${offer.targetBase.toLocaleString()})

${offer.negotiationScript}`;
    },
  },
];
