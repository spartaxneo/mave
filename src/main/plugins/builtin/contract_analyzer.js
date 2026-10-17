'use strict';
// Personal Legal & Contract Red-Flag Analyzer Plugin for Mave.

const { getContractAnalyzer } = require('../../legal/contract_analyzer');

module.exports = [
  {
    name: 'legal_audit_contract_red_flags',
    description: 'Audit contract text, employment offers, lease agreements, or NDAs to detect predatory clauses, excessive non-competes, IP overreach, or unlimited liability.',
    input_schema: {
      type: 'object',
      properties: {
        contract_text: {
          type: 'string',
          description: 'The contract text or excerpt to review for legal red flags.',
        },
      },
      required: ['contract_text'],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const analyzer = getContractAnalyzer();
      ctx.log('info', 'Auditing legal agreement for red flags and predatory clauses...');

      const report = analyzer.analyzeText(input.contract_text);

      if (!report.redFlags.length) {
        return `📜 **LEGAL CONTRACT AUDIT REPORT**:
• **Analyzed Length**: **${report.wordCount} words**
• **Overall Risk Assessment**: ✅ **${report.overallRisk}**
• **Findings**: No aggressive IP seizure, predatory non-compete, or unlimited indemnification clauses detected.

*Disclaimer: ${report.disclaimer}*`;
      }

      const rows = report.redFlags.map((f, idx) =>
        `**${idx + 1}. [${f.category.toUpperCase()}]** (Severity: \`${f.severity.toUpperCase()}\`)\n  • **Risk**: ${f.risk}\n  • 💡 **Suggested Counter-Clause**: *"${f.suggestion}"*`
      ).join('\n\n');

      return `⚠️ **LEGAL CONTRACT RED-FLAG AUDIT**:
• **Word Count**: **${report.wordCount} words**
• **Risk Rating**: **${report.overallRisk}**
• **Predatory Clauses Identified**: **${report.redFlagsFound}**

🚩 **Detected Red Flags**:
${rows}

*Disclaimer: ${report.disclaimer}*`;
    },
  },
];
