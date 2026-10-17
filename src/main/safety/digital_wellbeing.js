'use strict';

/**
 * DigitalWellbeingGuardian - Desk Ergonomics, Ocular Health & Focus Architecture
 * 
 * Provides:
 * 1. 20-20-20 Ocular fatigue prevention and posture break tracker
 * 2. Circadian blue-light melatonin suppression risk evaluation
 * 3. Deep work focus session management with distraction shields
 * 4. Daily ergonomic health scoring
 */

class DigitalWellbeingGuardian {
  constructor(options = {}) {
    this.continuousWorkMinutes = 0;
    this.lastBreakTime = options.lastBreakTime ? new Date(options.lastBreakTime) : new Date();
    this.activeFocusSession = null;
    this.dailyErgonomicBreaksTaken = 0;
  }

  recordActivity(minutesActive = 20) {
    this.continuousWorkMinutes += minutesActive;
    return this.checkErgonomicAlerts();
  }

  takeBreak() {
    const elapsed = this.continuousWorkMinutes;
    this.continuousWorkMinutes = 0;
    this.lastBreakTime = new Date();
    this.dailyErgonomicBreaksTaken++;
    return {
      success: true,
      recoveredMinutes: elapsed,
      totalBreaksToday: this.dailyErgonomicBreaksTaken
    };
  }

  checkErgonomicAlerts(currentTime = new Date()) {
    const alerts = [];

    // 20-20-20 Rule for eye strain
    if (this.continuousWorkMinutes >= 20 && this.continuousWorkMinutes < 50) {
      alerts.push({
        type: 'OCULAR_REST_20_20_20',
        urgency: 'MODERATE',
        message: 'Eye strain alert: Shift focus to an object 20 feet away for 20 seconds.',
        action: 'Look out a window or into the distance.'
      });
    }

    // Prolonged sitting / posture alert (>50 minutes)
    if (this.continuousWorkMinutes >= 50) {
      alerts.push({
        type: 'POSTURE_AND_STRETCH',
        urgency: 'HIGH',
        message: `You have been sitting continuously for ${this.continuousWorkMinutes} minutes.`,
        action: 'Stand up, roll shoulders, stretch hamstrings, and drink a glass of water.'
      });
    }

    return {
      continuousWorkMinutes: this.continuousWorkMinutes,
      needsBreak: alerts.length > 0,
      alerts
    };
  }

  evaluateCircadianRisk(date = new Date(), targetBedtimeHour = 23) {
    const hour = date.getHours();
    let riskLevel = 'LOW';
    let recommendations = 'Screen color temperature is appropriate for daytime alertness.';

    if (hour >= 20 && hour < 22) {
      riskLevel = 'MODERATE';
      recommendations = 'Evening detected: Activate warm Night Light (3400K) to limit melatonin suppression.';
    } else if (hour >= 22 || hour < 6) {
      riskLevel = 'HIGH';
      recommendations = 'Critical sleep window: Enable extreme warm amber filter (2700K) or terminate screen exposure 45 mins before sleep.';
    }

    const hoursUntilBed = (targetBedtimeHour - hour + 24) % 24;

    return {
      currentHour: hour,
      hoursUntilBed,
      riskLevel,
      recommendations
    };
  }

  startFocusSession(taskGoal = 'Deep Cognitive Work', durationMinutes = 25) {
    if (this.activeFocusSession && this.activeFocusSession.active) {
      throw new Error(`Focus session '${this.activeFocusSession.taskGoal}' is already in progress.`);
    }

    const startTime = new Date();
    const plannedEnd = new Date(startTime.getTime() + durationMinutes * 60 * 1000);

    this.activeFocusSession = {
      id: `focus_${Date.now()}`,
      taskGoal: taskGoal.trim(),
      durationMinutes,
      startTime: startTime.toISOString(),
      plannedEnd: plannedEnd.toISOString(),
      active: true,
      distractionsBlocked: 0
    };

    return this.activeFocusSession;
  }

  recordBlockedDistraction() {
    if (this.activeFocusSession && this.activeFocusSession.active) {
      this.activeFocusSession.distractionsBlocked++;
    }
  }

  completeFocusSession() {
    if (!this.activeFocusSession || !this.activeFocusSession.active) {
      throw new Error('No active focus session to complete.');
    }

    const session = this.activeFocusSession;
    session.active = false;
    session.completedAt = new Date().toISOString();

    const rating = session.distractionsBlocked === 0 ? 'FLAWLESS_FLOW' : session.distractionsBlocked < 3 ? 'STRONG' : 'CHALLENGING';

    return {
      taskGoal: session.taskGoal,
      durationMinutes: session.durationMinutes,
      distractionsShielded: session.distractionsBlocked,
      focusQuality: rating
    };
  }

  calculateDailyErgonomicScore() {
    let score = 70 + (this.dailyErgonomicBreaksTaken * 10);
    if (this.continuousWorkMinutes > 60) score -= 20;
    score = Math.max(0, Math.min(100, score));

    return {
      score,
      breaksTaken: this.dailyErgonomicBreaksTaken,
      rating: score >= 85 ? 'EXCELLENT' : score >= 65 ? 'GOOD' : 'NEEDS_IMPROVEMENT'
    };
  }
}

let _guardian = null;
function getDigitalWellbeingGuardian() {
  if (!_guardian) {
    _guardian = new DigitalWellbeingGuardian();
  }
  return _guardian;
}

module.exports = { DigitalWellbeingGuardian, getDigitalWellbeingGuardian };
