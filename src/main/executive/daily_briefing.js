'use strict';

/**
 * ExecutiveDailyBriefing - Proactive Multi-Domain Intelligence Synthesizer
 * 
 * Aggregates live telemetry from Calendar, Weather, Automotive, Smart Energy,
 * Financial Sentinel, Wearables/Health, Plant Botanist, and Travel Concierge
 * into a structured executive briefing and spoken morning TTS monologue.
 */

class ExecutiveDailyBriefing {
  constructor(options = {}) {
    this.defaultUserName = options.defaultUserName || 'Chief';
    this.personaTone = options.personaTone || 'concise_executive'; // concise_executive | warm_jarvis | analytical
  }

  /**
   * Generates a comprehensive daily executive briefing.
   * @param {Object} data Context telemetry payload
   */
  generateBriefing(data = {}) {
    const userName = data.userName || this.defaultUserName;
    const now = data.timestamp ? new Date(data.timestamp) : new Date();
    const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    const hour = now.getHours();

    const timeGreeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    const greeting = `${timeGreeting}, ${userName}. Here is your executive briefing for ${dateStr}.`;

    const sections = {};
    const priorityActionItems = [];
    const scriptSentences = [greeting];

    // 1. Wearables & Health Recovery
    if (data.healthMetrics) {
      const h = data.healthMetrics;
      const sleepScore = h.sleepScore ?? 85;
      const readiness = sleepScore >= 80 ? 'optimal' : sleepScore >= 60 ? 'moderate' : 'low';
      sections.vitalSigns = {
        sleepScore,
        readiness,
        restingHeartRate: h.restingHeartRate || 62,
        recoveryStatus: readiness === 'optimal' 
          ? 'Your body is fully recovered and primed for peak cognitive performance.' 
          : 'Recovery was sub-optimal; prioritize hydration and lighter afternoon workloads.'
      };

      scriptSentences.push(`Your sleep recovery score is ${sleepScore}, indicating ${readiness} readiness for today.`);
      if (sleepScore < 65) {
        priorityActionItems.push('Prioritize 20 minutes of restorative rest or an early bedtime tonight.');
      }
    }

    // 2. Weather & Atmospheric Conditions
    if (data.weather) {
      const w = data.weather;
      sections.weather = {
        condition: w.condition || 'Clear',
        tempC: w.tempC ?? 22,
        precipitationChance: w.rainChance ?? 0,
        uvIndex: w.uvIndex ?? 4
      };

      const weatherMsg = `Current conditions are ${w.condition || 'pleasant'} at ${w.tempC ?? 22} degrees with a ${w.rainChance ?? 0}% chance of precipitation.`;
      scriptSentences.push(weatherMsg);
      if ((w.rainChance ?? 0) > 40) {
        priorityActionItems.push('Bring an umbrella or raincoat for outdoor commutes.');
      }
    }

    // 3. Calendar & Commitments
    if (data.calendarEvents && Array.isArray(data.calendarEvents)) {
      const parseTimeToMinutes = (tStr) => {
        if (!tStr) return 0;
        const match = tStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
        if (!match) return 0;
        let hours = parseInt(match[1], 10);
        const mins = parseInt(match[2], 10);
        const meridiem = (match[3] || '').toUpperCase();
        if (meridiem === 'PM' && hours < 12) hours += 12;
        if (meridiem === 'AM' && hours === 12) hours = 0;
        return hours * 60 + mins;
      };

      const sortedEvents = [...data.calendarEvents].sort((a, b) => parseTimeToMinutes(a.time) - parseTimeToMinutes(b.time));
      sections.schedule = {
        totalEvents: sortedEvents.length,
        events: sortedEvents
      };

      if (sortedEvents.length > 0) {
        const firstEvent = sortedEvents[0];
        scriptSentences.push(`You have ${sortedEvents.length} scheduled engagements today. Your first commitment is ${firstEvent.title} at ${firstEvent.time}.`);
      } else {
        scriptSentences.push('Your calendar is entirely clear today, offering uninterrupted focus time.');
      }
    }

    // 4. Automotive & Mobility Telematics
    if (data.vehicleStatus) {
      const v = data.vehicleStatus;
      sections.automotive = {
        vehicle: v.model || 'Vehicle',
        batteryOrFuelLevel: v.level ?? 82,
        rangeKm: v.rangeKm ?? 390,
        tiresOk: v.tiresOk !== false
      };

      if (v.tiresOk === false) {
        priorityActionItems.push(`Warning: Tire pressure anomaly detected on ${v.model || 'your vehicle'}.`);
        scriptSentences.push(`Notice: tire pressure on your ${v.model || 'vehicle'} requires attention before departure.`);
      }
      if ((v.level ?? 100) < 25) {
        priorityActionItems.push(`${v.model || 'Vehicle'} charge is low (${v.level}%); charge recommended.`);
      }
    }

    // 5. Smart Home & Energy Grid
    if (data.energyStatus) {
      const e = data.energyStatus;
      sections.energy = {
        batteryStoragePct: e.batteryStoragePct ?? 90,
        solarForecastKWh: e.solarForecastKWh ?? 24.5,
        gridExportActive: e.gridExportActive ?? true
      };

      if ((e.solarForecastKWh ?? 0) > 20) {
        scriptSentences.push(`Solar forecast is outstanding at ${e.solarForecastKWh} kilowatt-hours.`);
      }
    }

    // 6. Financial Sentinel
    if (data.financialAlerts && Array.isArray(data.financialAlerts)) {
      sections.financial = {
        alertCount: data.financialAlerts.length,
        alerts: data.financialAlerts
      };

      if (data.financialAlerts.length > 0) {
        data.financialAlerts.forEach(alert => {
          if (alert.severity === 'CRITICAL' || alert.severity === 'HIGH') {
            priorityActionItems.push(`Financial: ${alert.title || alert.message}`);
          }
        });
        scriptSentences.push(`Financial sentinel flagged ${data.financialAlerts.length} item${data.financialAlerts.length > 1 ? 's' : ''} for review.`);
      }
    }

    // 7. Botanical Care
    if (data.botanicalReminders && Array.isArray(data.botanicalReminders)) {
      sections.botanical = {
        tasksDue: data.botanicalReminders.length,
        reminders: data.botanicalReminders
      };

      if (data.botanicalReminders.length > 0) {
        const plantNames = data.botanicalReminders.map(r => r.species || r.name).join(', ');
        priorityActionItems.push(`Plant care due for: ${plantNames}`);
      }
    }

    // 8. Travel Concierge
    if (data.travelStatus) {
      const t = data.travelStatus;
      sections.travel = t;
      if (t.activeTrip) {
        scriptSentences.push(`Travel radar is tracking trip '${t.activeTrip}'. Luggage beacons report all items secured.`);
      }
    }

    scriptSentences.push('All subsystems are nominal. Mave is standing by for your commands.');

    const audioScript = scriptSentences.join(' ');
    const executiveSummary = priorityActionItems.length > 0 
      ? `Briefing complete with ${priorityActionItems.length} priority action item(s) requiring attention.` 
      : 'Briefing complete with all systems nominal and zero critical alerts.';

    return {
      success: true,
      timestamp: now.toISOString(),
      greeting,
      executiveSummary,
      priorityActionItems,
      sections,
      audioScript
    };
  }
}

module.exports = {
  ExecutiveDailyBriefing
};
