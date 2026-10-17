'use strict';

/**
 * CareerStrategist - Personal Career, Resume & Executive Compensation Intelligence
 * 
 * Provides:
 * 1. ATS compatibility & keyword alignment scoring against job descriptions
 * 2. STAR impact quantifier (detects quantifiable metrics %, $, X-multiplier)
 * 3. Executive compensation negotiation scripts and leverage points
 */

class CareerStrategist {
  constructor() {}

  /**
   * Evaluates ATS compatibility and skill overlap between resume and target job description.
   */
  evaluateAtsMatch(resumeText = '', jobDescription = '') {
    if (!resumeText || !jobDescription) {
      throw new Error('Both resumeText and jobDescription are required');
    }

    const cleanResume = resumeText.toLowerCase();
    const cleanJob = jobDescription.toLowerCase();

    // Extract significant skill/technology keywords from job description
    const potentialKeywords = [
      'python', 'rust', 'go', 'golang', 'typescript', 'javascript', 'c++', 'java',
      'kubernetes', 'docker', 'aws', 'gcp', 'azure', 'terraform', 'ci/cd',
      'machine learning', 'deep learning', 'llm', 'rag', 'pytorch', 'distributed systems',
      'postgresql', 'redis', 'graphql', 'rest api', 'microservices', 'leadership',
      'system design', 'agile', 'scrum', 'architecture', 'security'
    ];

    const requiredSkills = potentialKeywords.filter(k => cleanJob.includes(k));
    const matchedSkills = requiredSkills.filter(k => cleanResume.includes(k));
    const missingSkills = requiredSkills.filter(k => !cleanResume.includes(k));

    const matchPercentage = requiredSkills.length > 0 
      ? Math.round((matchedSkills.length / requiredSkills.length) * 100) 
      : 100;

    return {
      matchPercentage,
      totalRequiredSkillsFound: requiredSkills.length,
      matchedSkills,
      missingSkills,
      atsPassProbability: matchPercentage >= 80 ? 'VERY_HIGH' : matchPercentage >= 60 ? 'MODERATE' : 'LOW',
      recommendations: missingSkills.length > 0 
        ? `Incorporate keywords for: ${missingSkills.slice(0, 5).join(', ')}.`
        : 'Resume strongly matches all target competencies.'
    };
  }

  /**
   * Audits bullet points for quantifiable business impact (STAR method).
   */
  auditBulletPoints(bullets = []) {
    const results = [];
    let highImpactCount = 0;

    for (const bullet of bullets) {
      const text = bullet.trim();
      const hasMetric = /\b(?:\d+%(?:\s+increase|\s+reduction|\s+growth)?|\$[\d,]+(?:\.\d+)?(?:k|m|b)?|\d+x|\d+\s*(?:ms|seconds|minutes|hours|days|users|engineers|servers|requests))\b/i.test(text);
      const hasActionVerb = /^(?:architected|spearheaded|engineered|deployed|accelerated|optimized|negotiated|scaled|reduced|increased|delivered|mentored|automated)/i.test(text);

      let impactTier = 'WEAK';
      if (hasMetric && hasActionVerb) {
        impactTier = 'EXCEPTIONAL';
        highImpactCount++;
      } else if (hasMetric || hasActionVerb) {
        impactTier = 'ADEQUATE';
      }

      results.push({
        bullet: text,
        hasMetric,
        hasActionVerb,
        impactTier,
        suggestion: !hasMetric 
          ? 'Quantify with specific business metrics (e.g. latency cut by 45%, saved $120k/yr).' 
          : !hasActionVerb 
          ? 'Begin bullet with a strong executive action verb (e.g. Engineered, Spearheaded).' 
          : 'High impact. Well articulated.'
      });
    }

    return {
      totalAudited: bullets.length,
      highImpactCount,
      impactRatio: bullets.length > 0 ? Math.round((highImpactCount / bullets.length) * 100) : 0,
      bulletAudits: results
    };
  }

  /**
   * Drafts compensation negotiation scripts and counter-offer strategies.
   */
  draftCounterOffer({ candidateName = 'Candidate', roleTitle = 'Staff Software Engineer', offeredBase = 180000, targetBase = 210000, equityValuation = 150000, competingOffersCount = 1 }) {
    const baseDiff = targetBase - offeredBase;

    const subject = `Offer Discussion: ${roleTitle} - ${candidateName}`;
    const script = `Dear Hiring Team,

Thank you very much for extending the offer for the ${roleTitle} role. I am genuinely excited about the team's technical mission and confident in my ability to immediately accelerate your product roadmap.

After evaluating current market data for this scope and considering my background in distributed systems and AI architecture, I would like to discuss adjusting the base compensation to $${targetBase.toLocaleString()} (a difference of $${baseDiff.toLocaleString()}).

${competingOffersCount > 0 ? `I also have a competing opportunity offering total compensation in this range, but your team and mission remain my clear first choice.\n\n` : ''}If we can align on this base and the proposed equity package ($${equityValuation.toLocaleString()}), I am prepared to sign immediately and decline other ongoing discussions.

Thank you again for your time and partnership.

Warm regards,
${candidateName}`;

    return {
      subject,
      targetBase,
      offeredBase,
      gap: baseDiff,
      negotiationScript: script
    };
  }
}

let _careerStrategist = null;
function getCareerStrategist() {
  if (!_careerStrategist) {
    _careerStrategist = new CareerStrategist();
  }
  return _careerStrategist;
}

module.exports = { CareerStrategist, getCareerStrategist };
