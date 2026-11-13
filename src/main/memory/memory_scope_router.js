'use strict';

const ScopeCategory = {
  CODING_PROJECT: 'CODING_PROJECT',
  USER_PREFERENCES: 'USER_PREFERENCES',
  DEVICE_TELEMETRY: 'DEVICE_TELEMETRY',
  PERSON_DIRECTORY: 'PERSON_DIRECTORY',
  GENERAL_SEMANTIC: 'GENERAL_SEMANTIC',
  PROCEDURAL_SKILL: 'PROCEDURAL_SKILL',
};

class MemoryScopeRouter {
  /**
   * Classify the current user query or task into an isolated knowledge scope.
   * Prevents loading unrelated memories (e.g. household or camera memories during coding).
   */
  classifyScope(taskOrQuery = '') {
    const text = String(taskOrQuery || '').toLowerCase().trim();

    // 1. Coding & Software Development Scope
    if (/\b(?:code|function|bug|debug|website|script|error|syntax|compile|test|git|repo|react|html|css|javascript|python|api|server|endpoint|database)\b/i.test(text)) {
      return {
        category: ScopeCategory.CODING_PROJECT,
        targetNamespaces: ['coding', 'project_knowledge', 'debug_episodes'],
        allowedTables: ['semantic_memory', 'procedural_memory', 'episodic_memory'],
        prohibitedNamespaces: ['personal_life', 'camera_observations', 'household', 'family'],
        reason: 'Coding directive detected: limiting scope strictly to project and procedural code memory.',
      };
    }

    // 2. User Preferences & Style
    if (/\b(?:shorter|longer|concise|preference|preferences|prefer|prefers|preferred|theme|favorite|tone|call me|remember that i (?:like|prefer|want)|my style|how you speak)\b/i.test(text)) {
      return {
        category: ScopeCategory.USER_PREFERENCES,
        targetNamespaces: ['preferences', 'communication_style', 'profile'],
        allowedTables: ['semantic_memory', 'session_memory'],
        prohibitedNamespaces: ['camera_observations', 'coding', 'device_telemetry'],
        reason: 'User preference query: scoping strictly to user profile and communication style.',
      };
    }

    // 3. Hardware & Device Telemetry
    if (/\b(?:laptop|pc|slow|cpu|ram|vram|gpu|hardware|fan|temperature|battery|disk space|memory leak|performance)\b/i.test(text)) {
      return {
        category: ScopeCategory.DEVICE_TELEMETRY,
        targetNamespaces: ['device_telemetry', 'hardware_profile', 'system_incidents'],
        allowedTables: ['semantic_memory', 'procedural_memory'],
        prohibitedNamespaces: ['personal_life', 'family', 'camera_observations'],
        reason: 'Device health query: scoping strictly to hardware telemetry and diagnostic procedures.',
      };
    }

    // 4. Authorized Person Directory (Explicit Consent)
    if (/\b(?:who is (?:this|that)|recognize|person|face|friend|family member|colleague)\b/i.test(text)) {
      return {
        category: ScopeCategory.PERSON_DIRECTORY,
        targetNamespaces: ['authorized_people'],
        allowedTables: ['authorized_people'],
        prohibitedNamespaces: ['*'], // strictly search only authorized_people table
        reason: 'Person identification query: strictly scoped to authorized, enrolled consenting person directory.',
      };
    }

    // 5. Procedural Skill Query
    if (/\b(?:how do i|how to|steps to|guide for|procedure for|tutorial for)\b/i.test(text)) {
      return {
        category: ScopeCategory.PROCEDURAL_SKILL,
        targetNamespaces: ['procedural_skills', 'workflows'],
        allowedTables: ['procedural_memory', 'semantic_memory'],
        prohibitedNamespaces: ['camera_observations', 'personal_life'],
        reason: 'How-to query: scoping strictly to procedural skills.',
      };
    }

    // 6. Default General Semantic
    return {
      category: ScopeCategory.GENERAL_SEMANTIC,
      targetNamespaces: ['general', 'verified_facts'],
      allowedTables: ['semantic_memory'],
      prohibitedNamespaces: ['camera_observations'],
      reason: 'General semantic inquiry.',
    };
  }
}

let defaultScopeRouter = null;

function getMemoryScopeRouter() {
  if (!defaultScopeRouter) {
    defaultScopeRouter = new MemoryScopeRouter();
  }
  return defaultScopeRouter;
}

module.exports = {
  ScopeCategory,
  MemoryScopeRouter,
  getMemoryScopeRouter,
};
