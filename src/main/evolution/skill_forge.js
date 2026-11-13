'use strict';

const EventEmitter = require('events');
const { getVirtualComputerSession } = require('../virtual_computer');

class SkillForge extends EventEmitter {
  constructor(options = {}) {
    super();
    this.session = options.session || getVirtualComputerSession();
    this.forgedSkills = new Map();
  }

  /**
   * Author and verify a new skill inside the isolated guest environment.
   * @param {object} spec
   * @param {string} spec.name - Skill identifier (e.g. 'csv_analyzer')
   * @param {string} spec.description - Skill capability description
   * @param {string} spec.code - JavaScript implementation code
   * @param {string} spec.testCode - Test verification code
   */
  async forgeSkill(spec = {}) {
    const { name, description, code, testCode } = spec;
    if (!name || !code) {
      throw new Error('Skill Forge requires name and code.');
    }

    const safeName = String(name).toLowerCase().replace(/[^a-z0-9_]/g, '_');
    const skillPath = `workspace/skills/${safeName}.js`;
    const testPath = `workspace/skills/${safeName}.test.js`;

    this.emit('forge-progress', { stage: 'staging', name: safeName });

    // 1. Stage the skill file in the guest isolated filesystem
    await this.session.executeGuestAction('write_file', {
      path: skillPath,
      content: code,
    });

    // 2. Stage the verification test file
    const runnerCode = testCode || `
      const assert = require('assert');
      const skill = require('./${safeName}.js');
      assert(typeof skill === 'object' || typeof skill === 'function', 'Skill export must be valid');
      console.log('Skill ${safeName} passed smoke test.');
    `;

    await this.session.executeGuestAction('write_file', {
      path: testPath,
      content: runnerCode,
    });

    this.emit('forge-progress', { stage: 'testing', name: safeName });

    // 3. Run verification test inside guest terminal runner (runs inside workspaceDir)
    const testResult = await this.session.executeGuestAction('run_command', {
      command: `node skills/${safeName}.test.js`,
    });

    const exitCode = testResult.exitCode != null ? testResult.exitCode : (testResult.code != null ? testResult.code : 0);
    if (exitCode !== 0) {
      this.emit('forge-failed', { name: safeName, error: testResult.stderr || testResult.stdout });
      throw new Error(`Skill verification failed inside guest sandbox: ${testResult.stderr || testResult.stdout}`);
    }

    // 4. Register skill metadata
    const forgedEntry = {
      name: safeName,
      description: description || 'Dynamically forged autonomous skill',
      path: skillPath,
      createdAt: Date.now(),
      status: 'verified',
    };
    this.forgedSkills.set(safeName, forgedEntry);

    this.emit('forge-complete', forgedEntry);
    return { ok: true, skill: forgedEntry };
  }

  getSkill(name) {
    return this.forgedSkills.get(name) || null;
  }

  listSkills() {
    return Array.from(this.forgedSkills.values());
  }
}

let activeSkillForge = null;

function getSkillForge(options = {}) {
  if (!activeSkillForge) {
    activeSkillForge = new SkillForge(options);
  }
  return activeSkillForge;
}

module.exports = {
  SkillForge,
  getSkillForge,
};
