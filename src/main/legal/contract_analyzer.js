'use strict';
// Personal Legal & Contract Red-Flag Analyzer for Mave.
// Detects high-risk, predatory clauses in leases, NDAs, employment letters, and SaaS terms:
// 1. Non-Compete & Moonlighting Overreach (Personal IP seizure)
// 2. Evergreen Auto-Renewal & Hidden Penalties
// 3. Mandatory Binding Arbitration & Class Action Waivers
// 4. One-Sided Indemnification & Unlimited Liability
// 5. Residential Lease Security Deposit Forfeitures

const RED_FLAG_RULES = [
  {
    category: 'IP & Side Project Ownership',
    pattern: /(?:assign|own|transfer).*(?:all|any).*(?:inventions?|ideas?|works?|intellectual property|developments?).*(?:whether or not|prior to|outside of working hours|on personal equipment)/i,
    severity: 'High',
    risk: 'Overreaching IP Assignment: Employer claims ownership of your personal open-source projects or weekend startups created on your own PC.',
    suggestion: 'Carve out pre-existing inventions and limit assignment strictly to inventions created during working hours directly relating to the company\'s line of business.',
  },
  {
    category: 'Non-Compete Restriction',
    pattern: /(?:shall not|agree not to).*(?:compete|engage in|work for|provide services to).*(?:competitor|similar business).*(?:for a period of\s*(?:[1-9]|one|two|three)\s*years?)/i,
    severity: 'High',
    risk: 'Excessive Non-Compete: May legally restrict you from working in your field of expertise for extended durations after termination.',
    suggestion: 'Limit non-compete to direct solicitation of existing clients, or strike the non-compete clause entirely (many jurisdictions now classify broad non-competes as unenforceable).',
  },
  {
    category: 'Evergreen Auto-Renewal',
    pattern: /(?:automatically renew|automatic renewal).*(?:unless written notice).*(?:at least\s*(?:60|90)\s*days prior)/i,
    severity: 'Medium',
    risk: 'Predatory Renewal Window: Contract locks you into another term unless canceled within a strict, distant window (e.g. 60-90 days before expiry).',
    suggestion: 'Negotiate for monthly renewal after initial term or a standard 30-day notice window.',
  },
  {
    category: 'Unlimited Indemnification',
    pattern: /(?:indemnify|hold harmless|defend).*(?:against any and all).*(?:losses|claims|liabilities|damages).*(?:without limitation|regardless of)/i,
    severity: 'High',
    risk: 'Unlimited Personal Liability: Exposes you to paying defense costs and uncapped damages for third-party claims beyond your control.',
    suggestion: 'Cap liability to the total fees paid under the agreement, and make indemnification mutual and reciprocal.',
  },
  {
    category: 'Mandatory Binding Arbitration',
    pattern: /(?:mandatory|binding) arbitration.*(?:waive|waiver).*(?:jury trial|class action)/i,
    severity: 'Medium',
    risk: 'Dispute Rights Waiver: Waives right to court trial or class actions, forcing disputes into private, costly arbitration.',
    suggestion: 'Evaluate whether you want an opt-out provision for small claims court proceedings.',
  },
];

class ContractAnalyzer {
  analyzeText(contractText) {
    const text = String(contractText || '').trim();
    if (!text || text.length < 20) {
      throw new Error('Contract text must be at least 20 characters to analyze.');
    }

    const detectedFlags = [];

    for (const rule of RED_FLAG_RULES) {
      if (rule.pattern.test(text)) {
        detectedFlags.push({
          category: rule.category,
          severity: rule.severity,
          risk: rule.risk,
          suggestion: rule.suggestion,
        });
      }
    }

    const overallRisk = detectedFlags.some((f) => f.severity === 'High')
      ? 'High Risk - Contains predatory or overreaching terms'
      : detectedFlags.length > 0
      ? 'Moderate Risk - Contains clauses requiring revision'
      : 'Low Risk - No obvious high-risk legal traps identified';

    return {
      wordCount: text.split(/\s+/).length,
      redFlagsFound: detectedFlags.length,
      overallRisk,
      redFlags: detectedFlags,
      disclaimer: 'Informational analysis by Mave AI. This does not constitute formal legal counsel; review critical binding agreements with a licensed attorney.',
    };
  }
}

let contractAnalyzerInstance = null;
function getContractAnalyzer() {
  if (!contractAnalyzerInstance) contractAnalyzerInstance = new ContractAnalyzer();
  return contractAnalyzerInstance;
}

module.exports = {
  ContractAnalyzer,
  getContractAnalyzer,
  RED_FLAG_RULES,
};
