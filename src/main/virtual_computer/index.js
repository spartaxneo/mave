'use strict';

const { VirtualMachineManager } = require('./vm_manager');
const { VirtualDisplayServer } = require('./display_server');
const { VirtualBrowserController } = require('./browser_controller');
const { VirtualDesktopController } = require('./desktop_controller');
const { ExecutionTargetRouter, ENVIRONMENTS } = require('./router');
const { VirtualComputerSession, getVirtualComputerSession } = require('./session');
const { VirtualScreenTarget } = require('./screen_target');
const { RealVMDriver, getRealVMDriver } = require('./real_vm_driver');

module.exports = {
  VirtualMachineManager,
  VirtualDisplayServer,
  VirtualBrowserController,
  VirtualDesktopController,
  ExecutionTargetRouter,
  VirtualComputerSession,
  getVirtualComputerSession,
  VirtualScreenTarget,
  RealVMDriver,
  getRealVMDriver,
  ENVIRONMENTS,
};
