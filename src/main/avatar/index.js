'use strict';

const { LipSyncEngine, getLipSyncEngine, VISEMES, VISEME_GEOMETRIES } = require('./lip_sync_engine');
const { MotionSynthesizer, getMotionSynthesizer } = require('./motion_synthesizer');
const { AvatarProducer, getAvatarProducer } = require('./avatar_producer');

module.exports = {
  LipSyncEngine,
  getLipSyncEngine,
  VISEMES,
  VISEME_GEOMETRIES,
  MotionSynthesizer,
  getMotionSynthesizer,
  AvatarProducer,
  getAvatarProducer
};
