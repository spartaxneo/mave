'use strict';
// ChatGPT-Style Custom Instructions & Long-Term Memory Personalization for Mave.
// Persists user identity, personal context, response directives, and discrete memory facts.
// Seamlessly compiles into the system prompt context for all interactions.

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

class ChatGPTPersonalization {
  constructor(options = {}) {
    this.dir = path.join(os.homedir(), '.mave');
    this.filePath = path.join(this.dir, 'personalization.json');
    this.data = {
      aboutUser: 'Power user, software engineer & systems architect. RTX 5060 GPU workstation.',
      responseInstructions: 'Be direct, highly competent, concise, and provide complete working code.',
      memories: [
        {
          id: 'mem_1',
          text: 'Prefers on-device local execution with zero cloud telemetry.',
          createdAt: Date.now() - 86400000,
          category: 'preference'
        },
        {
          id: 'mem_2',
          text: 'Primary programming languages: JavaScript/Node.js, TypeScript, and Python.',
          createdAt: Date.now() - 43200000,
          category: 'technical'
        },
        {
          id: 'mem_3',
          text: 'System identity must always be Mave.',
          createdAt: Date.now() - 21600000,
          category: 'identity'
        }
      ]
    };

    this.init();
  }

  init() {
    try {
      if (!fs.existsSync(this.dir)) fs.mkdirSync(this.dir, { recursive: true });
      if (fs.existsSync(this.filePath)) {
        const loaded = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
        this.data = { ...this.data, ...loaded };
      } else {
        this.save();
      }
    } catch {}
  }

  save() {
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf8');
    } catch {}
  }

  getInstructions() {
    return {
      aboutUser: this.data.aboutUser || '',
      responseInstructions: this.data.responseInstructions || '',
      memoryCount: this.data.memories.length,
    };
  }

  updateInstructions({ aboutUser, responseInstructions }) {
    if (aboutUser !== undefined) this.data.aboutUser = String(aboutUser || '').trim();
    if (responseInstructions !== undefined) this.data.responseInstructions = String(responseInstructions || '').trim();
    this.save();
    return this.getInstructions();
  }

  listMemories() {
    return this.data.memories || [];
  }

  addMemory(text, category = 'general') {
    if (!text || !text.trim()) return null;
    const mem = {
      id: `mem_${crypto.randomUUID().slice(0, 8)}`,
      text: text.trim(),
      category,
      createdAt: Date.now(),
    };
    this.data.memories.unshift(mem);
    if (this.data.memories.length > 200) this.data.memories.pop();
    this.save();
    return mem;
  }

  deleteMemory(id) {
    const initialLen = this.data.memories.length;
    this.data.memories = this.data.memories.filter((m) => m.id !== id);
    if (this.data.memories.length !== initialLen) {
      this.save();
      return true;
    }
    return false;
  }

  clearMemories() {
    this.data.memories = [];
    this.save();
    return true;
  }

  formatPromptContext() {
    const parts = [];
    if (this.data.aboutUser) {
      parts.push(`[User Context]: ${this.data.aboutUser}`);
    }
    if (this.data.responseInstructions) {
      parts.push(`[Response Guidelines]: ${this.data.responseInstructions}`);
    }
    if (this.data.memories && this.data.memories.length > 0) {
      const memList = this.data.memories.slice(0, 20).map((m) => `• ${m.text}`).join('\n');
      parts.push(`[Personal Knowledge & Memories]:\n${memList}`);
    }
    return parts.join('\n\n');
  }
}

let instance = null;

function getChatGPTPersonalization(options) {
  if (!instance) {
    instance = new ChatGPTPersonalization(options);
  }
  return instance;
}

module.exports = {
  ChatGPTPersonalization,
  getChatGPTPersonalization,
};
