'use strict';
// Multi-Thread Isolated Conversation & Task Contexts for Mave.
// Manages distinct conversation threads ("Dockers") per task and per device,
// preventing context pollution and keeping memory organized.

const fs = require('fs');
const path = require('path');
const os = require('os');
const { app } = require('electron');

function defaultThreadsPath() {
  const dir = app && app.getPath ? app.getPath('userData') : path.join(os.homedir(), '.mave');
  return path.join(dir, 'threads.json');
}

class ThreadManager {
  constructor(filePath = defaultThreadsPath()) {
    this.file = filePath;
    this.threads = new Map();
    this.activeThreadPerDevice = new Map(); // deviceId -> threadId
    this.load();
    if (this.threads.size === 0) {
      this.createThread('Main Chat', 'desktop');
    }
  }

  load() {
    try {
      if (fs.existsSync(this.file)) {
        const data = JSON.parse(fs.readFileSync(this.file, 'utf8'));
        if (Array.isArray(data)) {
          for (const item of data) {
            if (item && item.id) this.threads.set(item.id, item);
          }
        }
      }
    } catch {
      // Corrupt file fallback
    }
  }

  save() {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file, JSON.stringify([...this.threads.values()], null, 2), 'utf8');
    } catch {}
  }

  createThread(title = 'New Task', device = 'desktop') {
    const now = Date.now();
    const id = `thread_${now}_${Math.random().toString(36).slice(2, 7)}`;
    const thread = {
      id,
      title: String(title).trim() || 'Untitled Task',
      device,
      createdAt: now,
      updatedAt: now,
      messages: [],
    };
    this.threads.set(id, thread);
    this.activeThreadPerDevice.set(device, id);
    this.save();
    return thread;
  }

  getThread(threadId) {
    if (!threadId) return this.getActiveThread('desktop');
    return this.threads.get(threadId) || null;
  }

  getActiveThread(device = 'desktop') {
    let id = this.activeThreadPerDevice.get(device);
    if (!id || !this.threads.has(id)) {
      const first = this.threads.values().next().value;
      if (first) {
        id = first.id;
        this.activeThreadPerDevice.set(device, id);
      } else {
        const created = this.createThread('Main Chat', device);
        return created;
      }
    }
    return this.threads.get(id);
  }

  setActiveThread(device, threadId) {
    if (this.threads.has(threadId)) {
      this.activeThreadPerDevice.set(device, threadId);
      return true;
    }
    return false;
  }

  addMessage(threadId, role, content) {
    const thread = this.getThread(threadId);
    if (!thread) return;
    thread.messages.push({
      role,
      content,
      timestamp: Date.now(),
    });
    thread.updatedAt = Date.now();
    // Keep max 40 messages per thread
    if (thread.messages.length > 40) {
      thread.messages = thread.messages.slice(-40);
    }
    this.save();
  }

  listThreads() {
    return [...this.threads.values()]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map(({ id, title, device, createdAt, updatedAt, messages }) => ({
        id,
        title,
        device,
        createdAt,
        updatedAt,
        messageCount: messages ? messages.length : 0,
      }));
  }

  deleteThread(threadId) {
    if (this.threads.has(threadId)) {
      this.threads.delete(threadId);
      this.save();
      return true;
    }
    return false;
  }
}

let instance = null;
function getThreadManager() {
  if (!instance) instance = new ThreadManager();
  return instance;
}

module.exports = { ThreadManager, getThreadManager };
