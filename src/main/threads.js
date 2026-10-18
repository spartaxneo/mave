'use strict';
// Multi-Thread Isolated Conversation & Task Contexts for Mave.
// Authentic ChatGPT-style persistent conversations, Projects, Folders, and Archiving.

const fs = require('fs');
const path = require('path');
const os = require('os');
const { app } = require('electron');

function defaultBaseDir() {
  return app && app.getPath ? app.getPath('userData') : path.join(os.homedir(), '.mave');
}

function defaultThreadsPath() {
  return path.join(defaultBaseDir(), 'threads.json');
}

function defaultProjectsPath() {
  return path.join(defaultBaseDir(), 'projects.json');
}

function cleanTitle(text) {
  if (!text) return 'New Chat';
  let t = String(text).trim().replace(/\s+/g, ' ');
  t = t.replace(/^(?:please|can you|could you|hey mave|mave|hello|hi)\s+/i, '');
  if (t.length > 36) t = t.slice(0, 36) + '…';
  return t.charAt(0).toUpperCase() + t.slice(1);
}

class ThreadManager {
  constructor(filePath = defaultThreadsPath(), projectsPath = defaultProjectsPath()) {
    this.file = filePath;
    this.projectsFile = projectsPath;
    this.threads = new Map();
    this.projects = new Map();
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
            if (item && item.id) {
              item.messages = Array.isArray(item.messages) ? item.messages : [];
              item.pinned = Boolean(item.pinned);
              item.archived = Boolean(item.archived);
              item.projectId = item.projectId || null;
              this.threads.set(item.id, item);
            }
          }
        }
      }
    } catch {
      // Corrupt file fallback
    }

    try {
      if (fs.existsSync(this.projectsFile)) {
        const pdata = JSON.parse(fs.readFileSync(this.projectsFile, 'utf8'));
        if (Array.isArray(pdata)) {
          for (const p of pdata) {
            if (p && p.id) this.projects.set(p.id, p);
          }
        }
      }
    } catch {
      // Projects fallback
    }
  }

  save() {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file, JSON.stringify([...this.threads.values()], null, 2), 'utf8');
    } catch {}

    try {
      fs.mkdirSync(path.dirname(this.projectsFile), { recursive: true });
      fs.writeFileSync(this.projectsFile, JSON.stringify([...this.projects.values()], null, 2), 'utf8');
    } catch {}
  }

  // --- Project Management ---
  createProject(name = 'New Project', instructions = '', files = []) {
    const now = Date.now();
    const id = `proj_${now}_${Math.random().toString(36).slice(2, 7)}`;
    const project = {
      id,
      name: String(name).trim() || 'Untitled Project',
      instructions: String(instructions || '').trim(),
      files: Array.isArray(files) ? files : [],
      createdAt: now,
      updatedAt: now,
    };
    this.projects.set(id, project);
    this.save();
    return project;
  }

  getProject(projectId) {
    if (!projectId) return null;
    return this.projects.get(projectId) || null;
  }

  updateProject(projectId, updates = {}) {
    const project = this.getProject(projectId);
    if (!project) return null;
    if (updates.name != null) project.name = String(updates.name).trim() || project.name;
    if (updates.instructions != null) project.instructions = String(updates.instructions).trim();
    if (updates.files != null && Array.isArray(updates.files)) project.files = updates.files;
    project.updatedAt = Date.now();
    this.save();
    return project;
  }

  deleteProject(projectId) {
    if (this.projects.has(projectId)) {
      this.projects.delete(projectId);
      // Unlink threads associated with this project
      for (const t of this.threads.values()) {
        if (t.projectId === projectId) t.projectId = null;
      }
      this.save();
      return true;
    }
    return false;
  }

  listProjects() {
    return [...this.projects.values()]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((p) => {
        const threadCount = [...this.threads.values()].filter((t) => t.projectId === p.id && !t.archived).length;
        return {
          ...p,
          threadCount,
        };
      });
  }

  // --- Thread Management ---
  createThread(title = 'New Chat', device = 'desktop', projectId = null) {
    const now = Date.now();
    const id = `thread_${now}_${Math.random().toString(36).slice(2, 7)}`;
    const thread = {
      id,
      title: String(title).trim() || 'New Chat',
      device,
      projectId: projectId || null,
      pinned: false,
      archived: false,
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
      // Find latest unarchived thread
      const unarchived = [...this.threads.values()].filter((t) => !t.archived).sort((a, b) => b.updatedAt - a.updatedAt);
      if (unarchived.length > 0) {
        id = unarchived[0].id;
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

  renameThread(threadId, newTitle) {
    const thread = this.getThread(threadId);
    if (!thread) return null;
    thread.title = String(newTitle).trim() || thread.title;
    thread.updatedAt = Date.now();
    this.save();
    return thread;
  }

  pinThread(threadId, pinned = true) {
    const thread = this.getThread(threadId);
    if (!thread) return null;
    thread.pinned = Boolean(pinned);
    thread.updatedAt = Date.now();
    this.save();
    return thread;
  }

  archiveThread(threadId, archived = true) {
    const thread = this.getThread(threadId);
    if (!thread) return null;
    thread.archived = Boolean(archived);
    thread.updatedAt = Date.now();
    // If archived was active, reset active thread for device
    for (const [dev, curId] of this.activeThreadPerDevice.entries()) {
      if (curId === threadId && archived) {
        this.activeThreadPerDevice.delete(dev);
      }
    }
    this.save();
    return thread;
  }

  unarchiveThread(threadId) {
    return this.archiveThread(threadId, false);
  }

  setThreadProject(threadId, projectId) {
    const thread = this.getThread(threadId);
    if (!thread) return null;
    thread.projectId = projectId || null;
    thread.updatedAt = Date.now();
    this.save();
    return thread;
  }

  addMessage(threadId, roleOrMsg, content, options = {}) {
    const thread = this.getThread(threadId);
    if (!thread) return;

    let role = 'user';
    let text = '';
    let attachments = [];
    let generatedMedia = [];

    if (typeof roleOrMsg === 'object' && roleOrMsg !== null) {
      role = roleOrMsg.role || 'user';
      text = roleOrMsg.content || '';
      attachments = Array.isArray(roleOrMsg.attachments) ? roleOrMsg.attachments : [];
      generatedMedia = Array.isArray(roleOrMsg.generatedMedia) ? roleOrMsg.generatedMedia : [];
    } else {
      role = roleOrMsg;
      text = content;
      if (options && Array.isArray(options.attachments)) attachments = options.attachments;
      if (options && Array.isArray(options.generatedMedia)) generatedMedia = options.generatedMedia;
    }

    // Auto-title thread on first user message if still default placeholder
    const isDefaultTitle = !thread.title || /^(?:Main Chat|New Chat|New Task|Untitled Task)$/i.test(thread.title);
    if (role === 'user' && isDefaultTitle) {
      if (text && text.trim()) {
        thread.title = cleanTitle(text);
      }
    }

    thread.messages.push({
      role,
      content: text,
      attachments,
      generatedMedia,
      timestamp: Date.now(),
    });
    thread.updatedAt = Date.now();

    // Preserve up to 1000 messages per conversation (ChatGPT-grade depth)
    if (thread.messages.length > 1000) {
      thread.messages = thread.messages.slice(-1000);
    }
    this.save();
    return thread;
  }

  listThreads({ projectId = null, includeArchived = false, search = '' } = {}) {
    let list = [...this.threads.values()];

    if (!includeArchived) {
      list = list.filter((t) => !t.archived);
    }

    if (projectId !== null) {
      list = list.filter((t) => t.projectId === projectId);
    }

    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((t) =>
        t.title.toLowerCase().includes(q) ||
        (t.messages && t.messages.some((m) => String(m.content || '').toLowerCase().includes(q)))
      );
    }

    return list
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map(({ id, title, device, projectId: pid, pinned, archived, createdAt, updatedAt, messages }) => {
        const lastMsg = messages && messages.length > 0 ? messages[messages.length - 1].content : '';
        return {
          id,
          title,
          device,
          projectId: pid,
          pinned: Boolean(pinned),
          archived: Boolean(archived),
          createdAt,
          updatedAt,
          messageCount: messages ? messages.length : 0,
          preview: lastMsg ? String(lastMsg).slice(0, 80) : '',
        };
      });
  }

  searchThreads(searchQuery) {
    return this.listThreads({ search: searchQuery });
  }

  listArchivedThreads() {
    return [...this.threads.values()]
      .filter((t) => t.archived)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map(({ id, title, device, projectId, createdAt, updatedAt, messages }) => ({
        id,
        title,
        device,
        projectId,
        createdAt,
        updatedAt,
        messageCount: messages ? messages.length : 0,
      }));
  }

  deleteThread(threadId) {
    if (this.threads.has(threadId)) {
      this.threads.delete(threadId);
      for (const [dev, curId] of this.activeThreadPerDevice.entries()) {
        if (curId === threadId) this.activeThreadPerDevice.delete(dev);
      }
      this.save();
      return true;
    }
    return false;
  }

  /**
   * ChatGPT-Style Timeline Grouping
   * Categorizes chats into: Pinned, Today, Yesterday, Previous 7 Days, Previous 30 Days, Older
   */
  getTimelineGroups({ projectId = null, search = '' } = {}) {
    const threads = this.listThreads({ projectId, includeArchived: false, search });
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfYesterday = startOfToday - 24 * 60 * 60 * 1000;
    const sevenDaysAgo = startOfToday - 6 * 24 * 60 * 60 * 1000;
    const thirtyDaysAgo = startOfToday - 29 * 24 * 60 * 60 * 1000;

    const groups = {
      pinned: [],
      today: [],
      yesterday: [],
      previous7Days: [],
      previous30Days: [],
      older: [],
    };

    for (const t of threads) {
      if (t.pinned) {
        groups.pinned.push(t);
        continue;
      }
      const time = t.updatedAt || t.createdAt;
      if (time >= startOfToday) {
        groups.today.push(t);
      } else if (time >= startOfYesterday) {
        groups.yesterday.push(t);
      } else if (time >= sevenDaysAgo) {
        groups.previous7Days.push(t);
      } else if (time >= thirtyDaysAgo) {
        groups.previous30Days.push(t);
      } else {
        groups.older.push(t);
      }
    }

    return groups;
  }
}

let instance = null;
function getThreadManager(customFile = null, customProjects = null) {
  if (!instance || customFile) {
    instance = new ThreadManager(customFile || defaultThreadsPath(), customProjects || defaultProjectsPath());
  }
  return instance;
}

module.exports = { ThreadManager, getThreadManager };
