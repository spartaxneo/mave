'use strict';

/**
 * MeetingCopilot - Real-Time In-Meeting Whisper Intelligence & Pacing Co-Pilot
 * 
 * Provides:
 * 1. Live agenda pacing & time overrun warnings
 * 2. Real-time fact-checking against past agreements / records
 * 3. Proactive whisper cues for diplomatic reframing and questions
 * 4. Live commitments and owner extraction
 */

class MeetingCopilot {
  constructor() {
    this.activeAgenda = null;
    this.pastAgreements = new Map(); // topicKey -> { fact, date, source }
  }

  loadReferenceFacts(facts = []) {
    for (const f of facts) {
      if (f.key && f.fact) {
        this.pastAgreements.set(f.key.toLowerCase(), f);
      }
    }
  }

  setAgenda(agendaItems = [], totalAllocatedMinutes = 60) {
    if (!Array.isArray(agendaItems) || agendaItems.length === 0) {
      throw new Error('Valid array of agenda items is required');
    }

    this.activeAgenda = {
      startTime: new Date().toISOString(),
      totalAllocatedMinutes,
      items: agendaItems.map((item, idx) => ({
        index: idx,
        title: typeof item === 'string' ? item : item.title,
        allocatedMinutes: typeof item === 'object' && item.minutes ? item.minutes : Math.floor(totalAllocatedMinutes / agendaItems.length),
        status: 'pending' // pending | active | completed
      }))
    };

    return this.activeAgenda;
  }

  checkPacing(currentItemIndex, elapsedMinutes) {
    if (!this.activeAgenda) throw new Error('No active agenda set');
    const items = this.activeAgenda.items;
    if (currentItemIndex < 0 || currentItemIndex >= items.length) {
      throw new Error('Invalid agenda item index');
    }

    const currentItem = items[currentItemIndex];
    let allocatedUpToCurrent = 0;
    for (let i = 0; i <= currentItemIndex; i++) {
      allocatedUpToCurrent += items[i].allocatedMinutes;
    }

    const diff = elapsedMinutes - allocatedUpToCurrent;
    let pacingStatus = 'ON_TRACK';
    let cue = `Topic "${currentItem.title}" is on schedule.`;

    if (diff > 5) {
      pacingStatus = 'SIGNIFICANT_OVERRUN';
      cue = `⚠️ Pacing warning: Over schedule by ${diff} mins on "${currentItem.title}". Suggest transitioning to next item.`;
    } else if (diff > 0) {
      pacingStatus = 'SLIGHT_DELAY';
      cue = `Notice: Approaching time limit for "${currentItem.title}" (+${diff} mins). Wrap up key action items.`;
    } else if (diff < -5) {
      pacingStatus = 'AHEAD_OF_SCHEDULE';
      cue = `Running ${Math.abs(diff)} mins ahead of schedule on "${currentItem.title}".`;
    }

    return {
      currentItemTitle: currentItem.title,
      elapsedMinutes,
      allocatedTotalMinutes: this.activeAgenda.totalAllocatedMinutes,
      allocatedForTopic: currentItem.allocatedMinutes,
      pacingStatus,
      whisperCue: cue
    };
  }

  /**
   * Evaluates spoken utterance against known facts to whisper discrepancies.
   */
  factCheckUtterance(utterance, customFacts = []) {
    if (!utterance || typeof utterance !== 'string') return { flagged: false, whisper: null };

    const factsToCheck = [...Array.from(this.pastAgreements.values()), ...customFacts];
    const flaggedDiscrepancies = [];

    const lowerUtterance = utterance.toLowerCase();

    for (const f of factsToCheck) {
      const keywords = (f.keywords || f.key || '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
      const matchesKeywords = keywords.some(k => lowerUtterance.includes(k));

      if (matchesKeywords) {
        // If utterance contradicts or mentions numbers/dates different from stored fact
        if (f.contradictionPattern && new RegExp(f.contradictionPattern, 'i').test(lowerUtterance)) {
          flaggedDiscrepancies.push({
            topic: f.key || 'Discrepancy',
            claimed: utterance.trim(),
            verifiedFact: f.fact,
            source: f.source || 'Previous Records',
            whisperAlert: `💡 WHISPER FACT CHECK: Verified record shows "${f.fact}" (${f.source || 'Historical records'}).`
          });
        }
      }
    }

    return {
      flagged: flaggedDiscrepancies.length > 0,
      discrepancyCount: flaggedDiscrepancies.length,
      discrepancies: flaggedDiscrepancies,
      whisper: flaggedDiscrepancies.length > 0 ? flaggedDiscrepancies[0].whisperAlert : null
    };
  }

  extractLiveCommitments(transcriptEntries = []) {
    const commitments = [];
    const commitmentRegex = /(?<owner>[A-Z][a-z]+)\s+(?:will|agreed to|to take|is responsible for|shall)\s+(?<task>[^.!?\n]+)/gi;

    for (const entry of transcriptEntries) {
      const text = entry.text || '';
      let match;
      while ((match = commitmentRegex.exec(text)) !== null) {
        if (match.groups && match.groups.owner && match.groups.task) {
          commitments.push({
            owner: match.groups.owner.trim(),
            task: match.groups.task.trim(),
            speaker: entry.speaker || match.groups.owner.trim(),
            timestamp: entry.timestamp || new Date().toISOString()
          });
        }
      }
    }

    return {
      totalFound: commitments.length,
      commitments
    };
  }
}

let _copilot = null;
function getMeetingCopilot() {
  if (!_copilot) {
    _copilot = new MeetingCopilot();
    _copilot.loadReferenceFacts([
      {
        key: 'budget_q3',
        keywords: 'budget, q3, cost, spending',
        contradictionPattern: '\\$?(?:30|40|45)k|40,000|45,000',
        fact: 'Q3 agreed budget was $55,000 approved in July Finance Committee',
        source: 'July Financial Minutes'
      },
      {
        key: 'launch_date',
        keywords: 'launch, release, deadline, ship',
        contradictionPattern: 'october|november',
        fact: 'Target release date is committed to December 15th',
        source: 'Executive Roadmap 2026'
      }
    ]);
  }
  return _copilot;
}

module.exports = { MeetingCopilot, getMeetingCopilot };
