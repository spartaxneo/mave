'use strict';

/**
 * DisasterReadinessSentinel - Autonomous Emergency Survival & Resilience Architecture
 * 
 * Provides:
 * 1. Severe weather & FEMA alert classification with immediate shelter protocols
 * 2. Emergency Go-Bag inventory & potable water ration calculator
 * 3. Power outage survival endurance calculator (EV V2L, Home UPS, power banks)
 */

class DisasterReadinessSentinel {
  constructor() {
    this.shelterProtocols = {
      TORNADO: {
        action: 'SHELTER_INTERIOR_LOWEST_FLOOR',
        instructions: 'Move immediately to an interior room without windows on the lowest floor (basement, bathroom, center hallway). Protect head and neck with mattress or heavy blankets.',
        essentialGear: ['Flashlight', 'Helmet', 'Sturdy Shoes', 'Phone']
      },
      EARTHQUAKE: {
        action: 'DROP_COVER_HOLD_ON',
        instructions: 'Drop to hands and knees under sturdy desk or table. Cover head and neck. Hold on until shaking stops. Do not run outside during shaking.',
        essentialGear: ['Sturdy Shoes', 'Dust Mask']
      },
      FLASH_FLOOD: {
        action: 'SEEK_HIGHER_GROUND',
        instructions: 'Move to higher ground immediately. Never drive or walk through moving floodwaters (Turn Around, Don’t Drown). 6 inches of water can stall a car.',
        essentialGear: ['Life Vest', 'Waterproof Document Bag']
      },
      WILDFIRE: {
        action: 'EVACUATE_OR_SEAL_STRUCTURE',
        instructions: 'If evacuation order issued, leave immediately via designated escape routes. Close all windows, doors, and vents. Turn on exterior lights for visibility.',
        essentialGear: ['N95 / P100 Respirator', 'Goggles', 'Go-Bag']
      }
    };
  }

  triageWeatherAlert(alert = {}) {
    const event = (alert.event || alert.headline || '').toUpperCase();
    const severity = (alert.severity || 'UNKNOWN').toUpperCase();

    let threatType = 'GENERAL';
    if (event.includes('TORNADO')) threatType = 'TORNADO';
    else if (event.includes('EARTHQUAKE')) threatType = 'EARTHQUAKE';
    else if (event.includes('FLOOD')) threatType = 'FLASH_FLOOD';
    else if (event.includes('WILDFIRE') || event.includes('FIRE')) threatType = 'WILDFIRE';

    const isUrgent = severity === 'EXTREME' || severity === 'SEVERE' || /WARNING/i.test(event);
    const protocol = this.shelterProtocols[threatType] || {
      action: 'MONITOR_LOCAL_RADIO',
      instructions: 'Stay indoors, monitor NOAA emergency broadcast frequencies, and ensure backup batteries are charged.',
      essentialGear: ['NOAA Radio', 'Flashlight']
    };

    return {
      event: alert.event || 'Severe Weather Event',
      threatType,
      urgencyLevel: isUrgent ? 'CRITICAL_IMMEDIATE_ACTION' : 'ADVISORY_WATCH',
      shelterProtocol: protocol.action,
      immediateInstructions: protocol.instructions,
      essentialGear: protocol.essentialGear
    };
  }

  calculateWaterAndRations(familyMemberCount = 4, daysSupply = 3) {
    if (familyMemberCount < 1 || daysSupply < 1) {
      throw new Error('Family member count and days of supply must be at least 1');
    }

    const gallonsPerPersonPerDay = 1.0; // FEMA baseline
    const totalWaterGallons = familyMemberCount * daysSupply * gallonsPerPersonPerDay;
    const totalCaloriesPerDay = familyMemberCount * 2200;
    const totalCaloriesStock = totalCaloriesPerDay * daysSupply;

    return {
      familyMembers: familyMemberCount,
      daysCovered: daysSupply,
      requiredWaterGallons: totalWaterGallons,
      requiredWaterLiters: Math.round(totalWaterGallons * 3.785),
      totalCaloriesRequired: totalCaloriesStock,
      recommendedRationTypes: [
        'High-density emergency food bars',
        'Canned proteins (tuna, salmon, chicken, beans)',
        'Electrolyte replacement drink packets',
        'Ready-to-eat nut butters & dried fruits'
      ]
    };
  }

  calculatePowerOutageEndurance({
    evBatteryKWh = 75,
    evChargePercentage = 80,
    homeUpsWh = 1500,
    portableBanksWh = 300,
    operationalMode = 'BALANCED' // ESSENTIAL (50W), BALANCED (200W), EXTENDED (400W)
  }) {
    const usableEvWh = (evBatteryKWh * 1000 * (evChargePercentage / 100)) * 0.85; // 85% depth of discharge reserve
    const totalWhAvailable = usableEvWh + homeUpsWh + portableBanksWh;

    const wattageDraw = operationalMode === 'ESSENTIAL' ? 50 : operationalMode === 'BALANCED' ? 200 : 400;
    const totalRuntimeHours = Math.round((totalWhAvailable / wattageDraw) * 10) / 10;
    const totalRuntimeDays = Math.round((totalRuntimeHours / 24) * 10) / 10;

    return {
      operationalMode,
      estimatedDrawWatts: wattageDraw,
      totalStoredEnergyWh: Math.round(totalWhAvailable),
      totalRuntimeHours,
      totalRuntimeDays,
      appliancesSupported: operationalMode === 'ESSENTIAL'
        ? 'Wi-Fi router, smartphones, LED emergency illumination, medical radio'
        : operationalMode === 'BALANCED'
        ? 'Wi-Fi, phones, laptop workstations, refrigerator defrost/cooling cycle (intermittent), CPAP'
        : 'Fridge full time, microwave heating, CPAP, lighting, portable cooking induction plate'
    };
  }
}

let _disasterSentinel = null;
function getDisasterReadinessSentinel() {
  if (!_disasterSentinel) {
    _disasterSentinel = new DisasterReadinessSentinel();
  }
  return _disasterSentinel;
}

module.exports = { DisasterReadinessSentinel, getDisasterReadinessSentinel };
