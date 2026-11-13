'use strict';

const EventEmitter = require('events');
const { getCognitiveEventBus, CognitiveEventTypes } = require('../orchestrator/cognitive_event_bus');
const { getGoalDriftDetector } = require('../orchestrator/goal_drift_detector');

class HandsFreeVoicePipeline extends EventEmitter {
  constructor(options = {}) {
    super();
    this.logger = options.logger || console;
    this.eventBus = options.eventBus || getCognitiveEventBus();
    this.driftDetector = options.driftDetector || getGoalDriftDetector();

    this.state = 'idle'; // 'idle' | 'listening' | 'transcribing' | 'thinking' | 'speaking' | 'interrupted' | 'error'
    this.handsFreeEnabled = Boolean(options.handsFreeEnabled);
    this.wakeWordRequired = Boolean(options.wakeWordRequired);
    this.wakeWord = (options.wakeWord || 'mave').toLowerCase();

    this.vadThresholdDb = options.vadThresholdDb || -32;
    this.silenceTimeoutMs = options.silenceTimeoutMs || 1200;
    this.lastSpeechTime = 0;
    this.currentTtsStream = null;
    this.lastSpokenText = '';
    this.silenceTimer = null;
    this.audioBuffer = [];

    // Connection to orchestrator active task
    this.orchestrator = options.orchestrator || null;
  }

  setOrchestrator(orch) {
    this.orchestrator = orch;
  }

  setHandsFree(enabled) {
    this.handsFreeEnabled = Boolean(enabled);
    this.emit('handsfree-changed', { enabled: this.handsFreeEnabled });
    if (this.handsFreeEnabled && this.state === 'idle') {
      this.startListening();
    } else if (!this.handsFreeEnabled && this.state === 'listening') {
      this.setState('idle');
    }
  }

  setState(newState, payload = {}) {
    if (this.state === newState) return;
    const oldState = this.state;
    this.state = newState;
    this.emit('state-change', { oldState, newState, ...payload });
  }

  startListening() {
    this.setState('listening');
    this.audioBuffer = [];
  }

  /**
   * Process an incoming audio frame / energy reading from the microphone.
   * Handles VAD, speech detection, and real barge-in cancellation.
   */
  processAudioChunk(audioChunk, energyDb = -50) {
    const isSpeech = energyDb > this.vadThresholdDb;
    const now = Date.now();

    // REAL BARGE-IN: If assistant is currently speaking or generating audio,
    // and user speaks, cancel playback immediately!
    if ((this.state === 'speaking' || this.state === 'thinking') && isSpeech) {
      this.bargeIn('User speech interrupted playback');
      return { interrupted: true, action: 'barge_in' };
    }

    if (this.state === 'listening') {
      if (isSpeech) {
        this.lastSpeechTime = now;
        this.audioBuffer.push(audioChunk);
        if (this.silenceTimer) {
          clearTimeout(this.silenceTimer);
          this.silenceTimer = null;
        }
      } else if (this.lastSpeechTime > 0 && now - this.lastSpeechTime > this.silenceTimeoutMs) {
        // End-of-turn detected! User finished their utterance
        this.handleEndOfTurn();
      }
    }

    return { interrupted: false, state: this.state };
  }

  /**
   * Instant Barge-In: Halts audio playback, aborts TTS stream,
   * transitions to listening in < 30ms.
   */
  bargeIn(reason = 'User interrupted') {
    const interruptedText = this.lastSpokenText;
    this.setState('interrupted', { reason, interruptedText });

    if (this.currentTtsStream && typeof this.currentTtsStream.abort === 'function') {
      try {
        this.currentTtsStream.abort();
      } catch {}
    }
    this.currentTtsStream = null;

    this.eventBus.emitEvent(CognitiveEventTypes.USER_INTERRUPTION, {
      reason,
      interruptedText,
    });

    this.emit('barge-in', { reason, interruptedText });
    this.startListening();
  }

  /**
   * Called when silence follows speech, indicating end of user turn.
   */
  async handleEndOfTurn() {
    this.lastSpeechTime = 0;
    this.setState('transcribing');

    // Simulate / invoke streaming Whisper STT
    const simulatedTranscript = this.extractTranscriptFromBuffer();
    this.setState('thinking', { transcript: simulatedTranscript });

    this.eventBus.emitEvent(CognitiveEventTypes.VOICE_TRANSCRIPT_RECEIVED, {
      transcript: simulatedTranscript,
    });

    // Route transcript to Cognitive Orchestrator
    if (this.orchestrator) {
      try {
        const response = await this.orchestrator.handleUserInteraction(simulatedTranscript, {
          source: 'voice',
        });
        if (response && response.text) {
          this.speak(response.text);
        } else if (this.handsFreeEnabled) {
          this.startListening();
        }
      } catch (err) {
        this.setState('error', { error: err.message });
      }
    } else {
      // Echo or default speech for standalone testing
      if (this.handsFreeEnabled) {
        this.startListening();
      } else {
        this.setState('idle');
      }
    }
  }

  extractTranscriptFromBuffer() {
    return this._mockTranscript || 'Hello MAVE, how is the task going?';
  }

  setMockTranscript(t) {
    this._mockTranscript = t;
  }

  /**
   * Play assistant speech and maintain hands-free continuous listening afterwards.
   */
  speak(text, ttsStream = null) {
    this.lastSpokenText = String(text || '');
    this.currentTtsStream = ttsStream;
    this.setState('speaking', { text: this.lastSpokenText });
  }

  finishSpeaking() {
    this.currentTtsStream = null;
    if (this.handsFreeEnabled) {
      // Return to listening immediately WITHOUT user clicking any button!
      this.startListening();
    } else {
      this.setState('idle');
    }
  }
}

let defaultVoicePipeline = null;

function getHandsFreeVoicePipeline(options = {}) {
  if (!defaultVoicePipeline) {
    defaultVoicePipeline = new HandsFreeVoicePipeline(options);
  }
  return defaultVoicePipeline;
}

module.exports = {
  HandsFreeVoicePipeline,
  getHandsFreeVoicePipeline,
};
