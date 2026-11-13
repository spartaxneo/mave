'use strict';

class MultimodalFusionEngine {
  constructor(options = {}) {
    this.screenService = options.screenService || null;
    this.cameraService = options.cameraService || null;
    this.observations = [];
  }

  /**
   * Fuse user verbal/text request with active multimodal observations.
   * Example: "What's wrong with this?" + screen observation of code error -> unified diagnostic context.
   */
  async fuseContext(userRequest, contextOptions = {}) {
    const text = String(userRequest || '').trim();
    let screenObservation = null;
    let cameraObservation = null;

    // Check if user request is indexical ("this", "here", "on screen", "camera", "look at")
    const isVisualQuery = /\b(this|here|screen|look at|see|camera|photo|error on screen|window)\b/i.test(text);

    if (this.screenService && this.screenService.enabled && isVisualQuery) {
      const scr = await this.screenService.captureContext(contextOptions);
      if (scr.allowed) {
        screenObservation = scr.observation;
      }
    }

    if (this.cameraService && this.cameraService.enabled && /\b(camera|photo|desk|room|object)\b/i.test(text)) {
      const cam = await this.cameraService.processFrame(null, contextOptions);
      if (cam.allowed) {
        cameraObservation = cam.observation;
      }
    }

    const observationRecord = {
      observationId: `obs_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: Date.now(),
      userRequest: text,
      isVisualQuery,
      screenObservation,
      cameraObservation,
    };

    this.observations.push(observationRecord);
    if (this.observations.length > 50) this.observations.shift();

    // Format concise fused prompt context without wasting tokens
    let fusedContextNote = '';
    if (screenObservation) {
      fusedContextNote += `\n[Active Screen Observation: Front window "${screenObservation.windowTitle}". Summary: ${screenObservation.summary}]`;
    }
    if (cameraObservation) {
      fusedContextNote += `\n[Active Camera Observation: ${cameraObservation.description}]`;
    }

    return {
      fusedContextNote,
      observationRecord,
    };
  }
}

let defaultFusionEngine = null;

function getMultimodalFusionEngine(options = {}) {
  if (!defaultFusionEngine) {
    defaultFusionEngine = new MultimodalFusionEngine(options);
  }
  return defaultFusionEngine;
}

module.exports = {
  MultimodalFusionEngine,
  getMultimodalFusionEngine,
};
