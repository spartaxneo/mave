'use strict';

const EventEmitter = require('events');

/**
 * FullDuplexVoiceEngine manages real-time, hands-free conversational audio.
 * It coordinates Voice Activity Detection (VAD), Streaming Whisper STT,
 * Kokoro / Cloud TTS playback, and instant user interruption handling (<50ms).
 */
class FullDuplexVoiceEngine extends EventEmitter {
  constructor(options = {}) {
    super();
    this.logger = options.logger || console;
    this.state = 'idle'; // 'idle' | 'listening' | 'thinking' | 'speaking' | 'interrupted' | 'error'
    this.activeSpeaker = null;
    this.currentTtsStream = null;
    this.isMuted = false;
    this.handsFreeActive = false;
    this.interruptionThresholdDb = options.interruptionThresholdDb || -28;
    this.silenceTimeoutMs = options.silenceTimeoutMs || 1200;
    this.speechHistory = [];
    this.lastSpokenText = '';
  }

  setState(newState, payload = {}) {
    if (this.state === newState) return;
    const oldState = this.state;
    this.state = newState;
    this.emit('state-change', { oldState, newState, ...payload });
  }

  /**
   * Start listening for user speech (streaming audio chunks).
   */
  startListening() {
    if (this.isMuted) return;
    this.setState('listening');
  }

  /**
   * Handle incoming audio buffer / VAD signal from microphone.
   * Checks if user is interrupting MAVE while MAVE is speaking.
   */
  processAudioInput(audioChunk, energyDb = -50) {
    if (this.isMuted) return;

    const isSpeechDetected = energyDb > this.interruptionThresholdDb;

    // Check for user interruption during MAVE speech
    if (this.state === 'speaking' && isSpeechDetected) {
      this.interrupt('User started speaking during playback');
      return;
    }

    if (this.state === 'idle' && isSpeechDetected) {
      this.startListening();
    }

    if (this.state === 'listening') {
      this.emit('audio-energy', { energyDb, isSpeechDetected });
    }
  }

  /**
   * Instant interruption: Halts ongoing audio playback, clears TTS generation queues,
   * and yields conversational control back to the user in under 50ms.
   */
  interrupt(reason = 'Interrupted by user') {
    if (this.state !== 'speaking' && this.state !== 'thinking') return;

    const interruptedText = this.lastSpokenText;
    this.setState('interrupted', { reason, partialText: interruptedText });

    // Abort active TTS player
    if (this.currentTtsStream && typeof this.currentTtsStream.abort === 'function') {
      try {
        this.currentTtsStream.abort();
      } catch {}
    }
    this.currentTtsStream = null;

    this.speechHistory.push({
      role: 'assistant',
      status: 'interrupted',
      text: interruptedText,
      timestamp: Date.now(),
    });

    // Instantly transition to listening for the user's interruption statement
    this.setState('listening', { reason: 'Ready for user follow-up' });
    this.emit('interrupted', { reason, interruptedText });
  }

  /**
   * Begin speaking synthesized speech for a model response.
   */
  startSpeaking(text, ttsStream = null) {
    if (this.isMuted) return;
    this.lastSpokenText = String(text || '');
    this.currentTtsStream = ttsStream;
    this.setState('speaking', { text: this.lastSpokenText });
  }

  /**
   * Signal that speech playback has cleanly finished.
   */
  finishSpeaking() {
    if (this.state === 'speaking') {
      this.currentTtsStream = null;
      this.setState(this.handsFreeActive ? 'listening' : 'idle');
    }
  }

  setMuted(muted) {
    this.isMuted = Boolean(muted);
    this.emit('mute-changed', { isMuted: this.isMuted });
    if (this.isMuted && this.state === 'speaking') {
      this.interrupt('Muted by user');
    }
  }

  setHandsFree(active) {
    this.handsFreeActive = Boolean(active);
    this.emit('handsfree-changed', { active: this.handsFreeActive });
  }

  getState() {
    return this.state;
  }

  startAssistantSpeaking(text, ttsStream = null) {
    return this.startSpeaking(text, ttsStream);
  }

  handleUserVoiceActivity(isSpeaking, energy = 0.8) {
    const wasSpeaking = this.state === 'speaking';
    const energyDb = isSpeaking ? -20 : -60;
    this.processAudioInput(null, energyDb);
    return { interrupted: wasSpeaking && (this.state === 'interrupted' || this.state === 'listening') };
  }

  acknowledgeInterruption() {
    this.setState('listening');
  }

  getStatus() {
    return {
      state: this.state,
      isMuted: this.isMuted,
      handsFreeActive: this.handsFreeActive,
      interruptionThresholdDb: this.interruptionThresholdDb,
      lastSpokenText: this.lastSpokenText,
    };
  }
}

let activeVoiceEngine = null;

function getFullDuplexVoiceEngine(options = {}) {
  if (!activeVoiceEngine) {
    activeVoiceEngine = new FullDuplexVoiceEngine(options);
  }
  return activeVoiceEngine;
}

module.exports = {
  FullDuplexVoiceEngine,
  FullDuplexVoiceCoordinator: FullDuplexVoiceEngine,
  getFullDuplexVoiceEngine,
};
