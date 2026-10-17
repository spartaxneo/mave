'use strict';
// Intelligent Interruption & Cross-Talk / Background Noise Filter for Mave.
// Distinguishes when a user is directly addressing or interrupting Mave (barge-in)
// vs when the user is talking to someone else in the room or background noise is present.

const DIRECT_INTERRUPTION_PATTERNS = [
  /^(?:stop|wait|hold on|pause|cancel|listen|shh|shut up|hush)\b/i,
  /\b(?:hey\s+)?(?:mave|bigfoot)\b/i,
  /^(?:no|nope|wait a (?:second|min|minute)|actually|that'?s wrong|not that)\b/i,
  /\b(?:can you\s+)?(?:stop|pause|be quiet|shut up)\b/i,
  /^(?:nevermind|cancel that|forget it)\b/i,
];

const SIDE_CONVERSATION_PATTERNS = [
  /\b(?:mom|mum|dad|brother|sister|bhai|bro|babe|honey|sweetie|dude|guys|john|sarah|alex)\b/i,
  /\b(?:pass (?:the|me)|on the phone|on a call|talk to you later|hello\?|can you hear me)\b/i,
  /\b(?:tell him|tell her|ask him|ask her|what did they say|where are you going)\b/i,
  /\b(?:what are we eating|dinner is ready|lunch is ready|close the door)\b/i,
];

class InterruptionFilter {
  constructor({ minInterruptConfidence = 0.65 } = {}) {
    this.minInterruptConfidence = minInterruptConfidence;
  }

  /**
   * Evaluate whether incoming speech while Mave is talking should interrupt playback.
   *
   * @param {object} params
   * @param {string} params.transcript - Recognized speech text
   * @param {number} [params.rms] - Audio RMS level (0 - 1)
   * @param {object} [params.speaker] - Identified speaker profile { identified, role, confidence }
   * @param {boolean} [params.isMaveSpeaking] - Whether Mave is currently speaking
   * @returns {{ shouldInterrupt: boolean, action: 'interrupt'|'ignore', reason: string, confidence: number }}
   */
  evaluate({ transcript = '', rms = 0.05, speaker = null, isMaveSpeaking = true } = {}) {
    if (!isMaveSpeaking) {
      return { shouldInterrupt: false, action: 'ignore', reason: 'mave_not_speaking', confidence: 1.0 };
    }

    const text = String(transcript || '').trim().toLowerCase();
    if (!text || text.length < 2) {
      return { shouldInterrupt: false, action: 'ignore', reason: 'empty_or_inaudible', confidence: 0.9 };
    }

    // 1. Direct explicit stop or wake-word override -> Definite Interruption
    for (const pat of DIRECT_INTERRUPTION_PATTERNS) {
      if (pat.test(text)) {
        return {
          shouldInterrupt: true,
          action: 'interrupt',
          reason: 'direct_command',
          confidence: 0.98,
        };
      }
    }

    // 2. Clear side-conversation cues -> Ignore (user talking to family/roommate)
    for (const pat of SIDE_CONVERSATION_PATTERNS) {
      if (pat.test(text) && !/\b(?:mave|bigfoot)\b/i.test(text)) {
        return {
          shouldInterrupt: false,
          action: 'ignore',
          reason: 'side_conversation_detected',
          confidence: 0.88,
        };
      }
    }

    // 3. Acoustic Energy / Distance check:
    // Low energy usually indicates background chatter or distant speech in room
    if (rms < 0.025) {
      return {
        shouldInterrupt: false,
        action: 'ignore',
        reason: 'low_energy_background_chatter',
        confidence: 0.82,
      };
    }

    // 4. Speaker identification weighting:
    // If recognized as the enrolled Owner speaking with direct tone, allow interruption
    const isOwner = speaker && (speaker.role === 'owner' || speaker.name === 'Primary User');
    if (isOwner && speaker.confidence >= 0.70 && rms >= 0.04) {
      return {
        shouldInterrupt: true,
        action: 'interrupt',
        reason: 'enrolled_owner_speech_override',
        confidence: 0.85,
      };
    }

    // 5. Default threshold
    return {
      shouldInterrupt: false,
      action: 'ignore',
      reason: 'ambient_or_unaddressed',
      confidence: 0.60,
    };
  }
}

let filterInstance = null;
function getInterruptionFilter() {
  if (!filterInstance) filterInstance = new InterruptionFilter();
  return filterInstance;
}

module.exports = {
  InterruptionFilter,
  getInterruptionFilter,
};
