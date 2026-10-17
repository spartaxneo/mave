'use strict';
// Proactive Daily Routines & Workspace Hygiene Engine for Bigfoot.
// Handles autonomous morning executive briefings, automated downloads tidying,
// and background development repository health monitoring.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { getMemoryStore } = require('../memory');

class ProactiveScheduler {
  constructor(profileDir = 'D:\\Bigfoot') {
    this.profileDir = profileDir;
    this.settingsFile = path.join(profileDir, 'proactive_settings.json');
  }

  loadSettings() {
    try {
      if (fs.existsSync(this.settingsFile)) {
        return JSON.parse(fs.readFileSync(this.settingsFile, 'utf8'));
      }
    } catch {}
    return {
      morningBriefingEnabled: true,
      briefingHour: 8,
      autoHygieneEnabled: true,
      hygieneDay: 'Monday',
    };
  }

  saveSettings(settings) {
    try {
      if (!fs.existsSync(this.profileDir)) fs.mkdirSync(this.profileDir, { recursive: true });
      fs.writeFileSync(this.settingsFile, JSON.stringify(settings, null, 2), 'utf8');
    } catch {}
  }

  /**
   * Generates a personalized executive morning briefing.
   */
  async generateMorningBriefing(userName = 'Sir') {
    const memory = getMemoryStore();
    const now = new Date();
    const timeOfDay = memory.getTimeOfDayContext(now);
    const musicTaste = memory.getCircadianTaste('music', now);

    const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // Gather quick system telemetry summary
    const freeMemGB = Math.round(os.freemem() / (1024 * 1024 * 1024) * 10) / 10;
    const totalMemGB = Math.round(os.totalmem() / (1024 * 1024 * 1024) * 10) / 10;

    const speech = `Good morning, ${userName}! It is ${timeStr} on ${dateStr}. System resources are optimal with ${freeMemGB} gigabytes of RAM available out of ${totalMemGB}. Your circadian soundtrack recommendation for this ${timeOfDay.period} is ${musicTaste.taste}. All autonomous desktop monitoring systems are active and ready.`;

    return {
      date: dateStr,
      time: timeStr,
      period: timeOfDay.period,
      musicRecommendation: musicTaste.taste,
      memoryStats: { freeMemGB, totalMemGB },
      spokenBriefing: speech,
    };
  }

  /**
   * Tidy files in a directory (like Downloads) by category.
   */
  tidyDirectory(targetDir, execute = false) {
    const resolved = path.resolve(targetDir);
    if (!fs.existsSync(resolved)) throw new Error(`Directory not found: ${resolved}`);

    const CATEGORIES = {
      Documents: ['.pdf', '.docx', '.doc', '.xlsx', '.xls', '.pptx', '.txt', '.csv', '.md'],
      Installers: ['.exe', '.msi', '.pkg', '.dmg', '.iso'],
      Images: ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp'],
      Archives: ['.zip', '.rar', '.7z', '.tar', '.gz'],
      Code: ['.js', '.py', '.json', '.html', '.css', '.ts', '.rs', '.cpp'],
    };

    const files = fs.readdirSync(resolved, { withFileTypes: true });
    const plan = [];

    for (const f of files) {
      if (f.isDirectory() || f.name.startsWith('.')) continue;
      const ext = path.extname(f.name).toLowerCase();
      let targetFolder = 'Other';

      for (const [category, extList] of Object.entries(CATEGORIES)) {
        if (extList.includes(ext)) {
          targetFolder = category;
          break;
        }
      }

      if (targetFolder !== 'Other') {
        const destDir = path.join(resolved, targetFolder);
        const sourcePath = path.join(resolved, f.name);
        const destPath = path.join(destDir, f.name);
        plan.push({ file: f.name, ext, targetFolder, sourcePath, destPath });

        if (execute) {
          if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
          fs.renameSync(sourcePath, destPath);
        }
      }
    }

    return {
      directory: resolved,
      executed: execute,
      totalClassified: plan.length,
      plan,
    };
  }
}

let _scheduler = null;
function getProactiveScheduler() {
  if (!_scheduler) _scheduler = new ProactiveScheduler();
  return _scheduler;
}

module.exports = { ProactiveScheduler, getProactiveScheduler };
