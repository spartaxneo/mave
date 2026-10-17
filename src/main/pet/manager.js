'use strict';
// Pet Manager Bridge for Mave / Bigfoot Desktop Pet Companion.
// Exports unified pet engine instance for IPC and windows management.

const { getPetEngine, DEFAULT_SPECIES } = require('./pet_engine');

function getPetManager() {
  return getPetEngine();
}

module.exports = {
  getPetManager,
  getPetEngine,
  DEFAULT_SPECIES,
};
