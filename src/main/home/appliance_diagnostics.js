'use strict';

/**
 * ApplianceDiagnostics - Home Infrastructure, Error Code Troubleshooter & Maintenance Vault
 * 
 * Provides:
 * 1. Manufacturer appliance error code diagnosis (Bosch, Samsung, LG, Whirlpool)
 * 2. Step-by-step DIY remediation workflows and tool checklists
 * 3. Household preventative maintenance schedules (HVAC, water filters, smoke alarms)
 * 4. Warranty expiration countdown and service provider triage
 */

class ApplianceDiagnostics {
  constructor() {
    this.errorCodes = {
      // Dishwashers
      'BOSCH_E15': {
        appliance: 'Dishwasher',
        brand: 'Bosch',
        code: 'E15',
        meaning: 'Water detected in base pan safety float switch (Leak Protection triggered).',
        severity: 'HIGH',
        diySteps: [
          'Unplug dishwasher or switch off circuit breaker.',
          'Turn off water supply under sink.',
          'Gently tilt dishwasher backward 45 degrees over a towel to drain base pan reservoir.',
          'Inspect spray arm and door gasket seal for tears or blockages.',
          'Power back on; if E15 clears, run short rinse cycle to verify.'
        ],
        toolsRequired: ['Towels', 'Phillips Screwdriver', 'Flashlight'],
        estimatedProCost: '$180 - $300',
        diyCost: '$0'
      },
      'BOSCH_E24': {
        appliance: 'Dishwasher',
        brand: 'Bosch',
        code: 'E24',
        meaning: 'Drain fault: drain hose kinked or pump impeller jammed.',
        severity: 'MEDIUM',
        diySteps: [
          'Remove bottom rack and untwist cylindrical filter.',
          'Remove plastic pump impeller cover using spoon or Torx T20.',
          'Inspect impeller chamber for trapped glass, bone, or fruit pit.',
          'Verify sink garbage disposal knockout plug was removed if recently installed.'
        ],
        toolsRequired: ['Torx T20 or Spoon', 'Bucket', 'Gloves'],
        estimatedProCost: '$150 - $250',
        diyCost: '$0'
      },

      // Washing Machines
      'SAMSUNG_4E': {
        appliance: 'Washing Machine',
        brand: 'Samsung',
        code: '4E / 4C',
        meaning: 'Water supply failure: machine is not filling within allocated time window.',
        severity: 'MEDIUM',
        diySteps: [
          'Verify hot and cold water shut-off valves are fully open.',
          'Disconnect inlet hoses and check internal mesh filter screens for calcium sediment.',
          'Rinse mesh screens under running water with a soft toothbrush.',
          'Ensure hoses are free of sharp kinks behind washer.'
        ],
        toolsRequired: ['Pliers', 'Toothbrush', 'Bucket'],
        estimatedProCost: '$120 - $220',
        diyCost: '$0'
      },
      'LG_OE': {
        appliance: 'Washing Machine',
        brand: 'LG',
        code: 'OE',
        meaning: 'Drain error: water unable to drain out of drum within 13 minutes.',
        severity: 'MEDIUM',
        diySteps: [
          'Locate small access door at lower-front corner of washer.',
          'Place baking dish under drain hose, pull black plug, and drain residual water.',
          'Unscrew large cylindrical pump filter counter-clockwise and clear debris (lint, coins, hairpins).',
          'Rinse and screw firmly back in place.'
        ],
        toolsRequired: ['Shallow pan / baking dish', 'Towel'],
        estimatedProCost: '$140 - $240',
        diyCost: '$0'
      },

      // Refrigerators
      'LG_ER_FF': {
        appliance: 'Refrigerator',
        brand: 'LG',
        code: 'Er FF',
        meaning: 'Freezer Fan Motor failure or frost buildup on fan blades.',
        severity: 'HIGH',
        diySteps: [
          'Unplug refrigerator for 6-8 hours with doors open to allow frost buildup to melt.',
          'If fan still fails to spin upon restart, replace freezer evaporator fan motor.'
        ],
        toolsRequired: ['Quarter-inch nut driver', 'Towels'],
        estimatedProCost: '$250 - $400',
        diyCost: '$35 - $60 (parts)'
      }
    };

    this.maintenanceTasks = [];
    this._initDefaultMaintenance();
  }

  _initDefaultMaintenance() {
    this.maintenanceTasks = [
      { id: 'hvac_filter', name: 'HVAC Air Filter Replacement', intervalMonths: 3, lastCompletedDate: '2026-07-15T00:00:00Z', location: 'Main Furnace Air Return' },
      { id: 'fridge_water', name: 'Refrigerator Water & Ice Filter', intervalMonths: 6, lastCompletedDate: '2026-04-10T00:00:00Z', location: 'Kitchen Fridge' },
      { id: 'smoke_detector', name: 'Smoke & CO Detector Battery Audit', intervalMonths: 6, lastCompletedDate: '2026-05-01T00:00:00Z', location: 'All Hallways' },
      { id: 'dryer_vent', name: 'Dryer Exhaust Vent Duct Cleanout', intervalMonths: 12, lastCompletedDate: '2025-11-20T00:00:00Z', location: 'Laundry Room' }
    ];
  }

  diagnoseErrorCode(brand, code) {
    if (!brand || !code) throw new Error('Both brand and error code are required');
    const normalizedKey = `${brand.trim().toUpperCase()}_${code.trim().toUpperCase().replace(/[\s/]/g, '')}`;

    // Direct lookup or partial search
    let match = this.errorCodes[normalizedKey];
    if (!match) {
      for (const [k, v] of Object.entries(this.errorCodes)) {
        if (k.includes(brand.trim().toUpperCase()) && k.includes(code.trim().toUpperCase())) {
          match = v;
          break;
        }
      }
    }

    if (!match) {
      return {
        found: false,
        brand,
        code,
        message: `Error code '${code}' for '${brand}' not found in local offline diagnostic manual. Recommend checking manufacturer manual.`
      };
    }

    return {
      found: true,
      ...match
    };
  }

  checkMaintenanceSchedule(currentDate = new Date()) {
    const now = currentDate instanceof Date ? currentDate : new Date(currentDate);
    const dueTasks = [];
    const upcomingTasks = [];

    for (const task of this.maintenanceTasks) {
      const last = new Date(task.lastCompletedDate);
      const nextDue = new Date(last.getTime() + task.intervalMonths * 30.4 * 24 * 60 * 60 * 1000);
      const daysUntilDue = Math.round((nextDue.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      const entry = {
        id: task.id,
        name: task.name,
        location: task.location,
        nextDueDate: nextDue.toISOString().slice(0, 10),
        daysUntilDue,
        isOverdue: daysUntilDue < 0
      };

      if (daysUntilDue <= 0) {
        dueTasks.push(entry);
      } else {
        upcomingTasks.push(entry);
      }
    }

    return {
      totalTracked: this.maintenanceTasks.length,
      dueCount: dueTasks.length,
      overdueTasks: dueTasks,
      upcomingTasks
    };
  }

  logCompletedMaintenance(taskId, completedDate = new Date()) {
    const task = this.maintenanceTasks.find(t => t.id === taskId);
    if (!task) throw new Error(`Maintenance task '${taskId}' not found`);

    task.lastCompletedDate = (completedDate instanceof Date ? completedDate : new Date(completedDate)).toISOString();
    return {
      success: true,
      taskName: task.name,
      updatedLastDate: task.lastCompletedDate
    };
  }
}

let _applianceDiagnostics = null;
function getApplianceDiagnostics() {
  if (!_applianceDiagnostics) {
    _applianceDiagnostics = new ApplianceDiagnostics();
  }
  return _applianceDiagnostics;
}

module.exports = { ApplianceDiagnostics, getApplianceDiagnostics };
