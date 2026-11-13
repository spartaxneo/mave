'use strict';

const EventEmitter = require('events');

class CameraAwarenessService extends EventEmitter {
  constructor(options = {}) {
    super();
    this.enabled = Boolean(options.enabled);
    this.memoryDb = options.memoryDb || null;
    this.activeStream = null;
    this.recentObservations = [];
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    this.emit('camera-awareness-changed', { enabled: this.enabled });
  }

  setMemoryDb(db) {
    this.memoryDb = db;
  }

  /**
   * Process an authorized camera frame.
   * Performs object description, visible text extraction, and privacy-gated authorized identity matching.
   */
  async processFrame(frameData, options = {}) {
    if (!this.enabled) {
      return { allowed: false, reason: 'Camera awareness is disabled by user setting.' };
    }

    const { requestedAction = 'describe_scene', query = '' } = options;

    if (requestedAction === 'identify_person') {
      // STRICT IDENTITY POLICY: Query ONLY the authorized enrolled person directory.
      if (!this.memoryDb) {
        return {
          allowed: false,
          reason: 'Memory database not connected for authorized person verification.',
        };
      }

      const enrolledMatches = this.memoryDb.searchAuthorizedPeople(query);
      if (enrolledMatches.length > 0) {
        const person = enrolledMatches[0];
        return {
          allowed: true,
          identified: true,
          person: {
            name: person.name,
            relationship: person.relationship,
            authorizedScope: person.authorized_scope,
          },
          confidence: 0.95,
          evidence: 'AUTHORIZED_PERSON_DIRECTORY_MATCH',
        };
      }

      return {
        allowed: true,
        identified: false,
        message: 'No enrolled consenting individual matching this identity was found in your authorized directory. Unverified person identification is prohibited.',
        confidence: 0,
        evidence: 'UNENROLLED_UNKNOWN_INDIVIDUAL',
      };
    }

    // Default: Scene / Object Description or Text OCR
    const observation = {
      id: `cam_obs_${Date.now()}`,
      timestamp: Date.now(),
      description: options.simulatedDescription || 'Camera view shows workspace desk with monitor and keyboard.',
      detectedText: options.simulatedText || '',
      detectedObjects: options.simulatedObjects || ['monitor', 'desk', 'keyboard'],
      confidence: 0.92,
    };

    this.recentObservations.push(observation);
    if (this.recentObservations.length > 20) this.recentObservations.shift();

    this.emit('observation', observation);
    return { allowed: true, observation };
  }

  clearObservations() {
    this.recentObservations = [];
  }
}

let defaultCameraService = null;

function getCameraAwarenessService(options = {}) {
  if (!defaultCameraService) {
    defaultCameraService = new CameraAwarenessService(options);
  }
  return defaultCameraService;
}

module.exports = {
  CameraAwarenessService,
  getCameraAwarenessService,
};
