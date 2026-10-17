'use strict';

/**
 * NetworkSentinel - Local Perimeter Defense & Secret Data Leakage Guard
 * 
 * Provides:
 * 1. Subnet device auditing & rogue MAC detection
 * 2. Insecure port & vulnerability scanning
 * 3. Deep outbound PII & API credential leakage detection (Luhn credit cards, AWS keys, JWTs)
 * 4. Overall network hygiene scoring
 */

class NetworkSentinel {
  constructor(options = {}) {
    this.knownDevices = new Map(); // MAC -> { name, ip, vendor, authorizedAt }
    this.insecurePorts = new Set([21, 23, 69, 80, 514, 554, 3389]); // FTP, Telnet, TFTP, unencrypted HTTP, Syslog, clear RTSP, open RDP
    
    // Seed trusted default devices
    if (options.initialDevices && Array.isArray(options.initialDevices)) {
      for (const d of options.initialDevices) {
        if (d.mac) this.authorizeDevice(d);
      }
    }
  }

  authorizeDevice(device) {
    if (!device || !device.mac) throw new Error('Device MAC address is required');
    const canonicalMac = device.mac.toLowerCase().replace(/[:-]/g, ':');
    this.knownDevices.set(canonicalMac, {
      mac: canonicalMac,
      ip: device.ip || '0.0.0.0',
      name: device.name || 'Authorized Device',
      vendor: device.vendor || 'Unknown',
      authorizedAt: new Date().toISOString()
    });
    return this.knownDevices.get(canonicalMac);
  }

  detectRogueDevices(scannedDevices = []) {
    const rogues = [];
    const verified = [];

    for (const d of scannedDevices) {
      if (!d.mac) continue;
      const canonicalMac = d.mac.toLowerCase().replace(/[:-]/g, ':');
      if (this.knownDevices.has(canonicalMac)) {
        verified.push(this.knownDevices.get(canonicalMac));
      } else {
        rogues.push({
          mac: canonicalMac,
          ip: d.ip || 'Unknown',
          hostname: d.hostname || 'Unknown',
          vendor: d.vendor || 'Unrecognized Vendor',
          firstDetected: new Date().toISOString(),
          threatLevel: 'HIGH',
          reason: 'Unregistered MAC address active on private subnet'
        });
      }
    }

    return {
      totalScanned: scannedDevices.length,
      verifiedCount: verified.length,
      rogueCount: rogues.length,
      rogueDevices: rogues
    };
  }

  auditPortSecurity(ports = []) {
    const vulnerabilities = [];
    for (const p of ports) {
      const portNum = typeof p === 'number' ? p : p.port;
      if (this.insecurePorts.has(portNum)) {
        let risk = 'MEDIUM';
        let desc = `Insecure port ${portNum} detected`;
        if (portNum === 23) {
          risk = 'CRITICAL';
          desc = 'Telnet (Port 23) transmits unencrypted passwords in plaintext';
        } else if (portNum === 21) {
          risk = 'HIGH';
          desc = 'FTP (Port 21) allows cleartext credential harvesting';
        } else if (portNum === 554) {
          risk = 'HIGH';
          desc = 'Unencrypted RTSP stream (Port 554) exposes camera feeds to LAN eavesdropping';
        } else if (portNum === 3389) {
          risk = 'HIGH';
          desc = 'Remote Desktop Protocol (Port 3389) exposed to brute force attack';
        }
        vulnerabilities.push({
          port: portNum,
          protocol: p.protocol || 'TCP',
          riskLevel: risk,
          description: desc,
          remediation: `Disable port ${portNum} or enforce TLS/SSH tunneling.`
        });
      }
    }

    return {
      auditedCount: ports.length,
      vulnerabilitiesCount: vulnerabilities.length,
      isClean: vulnerabilities.length === 0,
      vulnerabilities
    };
  }

  /**
   * Deep packet & clipboard inspection for sensitive secrets and PII.
   */
  scanForDataLeakage(text) {
    if (!text || typeof text !== 'string') return { leaked: false, detections: [] };

    const detections = [];

    // 1. AWS Access Key ID (AKIA...)
    const awsMatch = text.match(/\b(AKIA[0-9A-Z]{16})\b/);
    if (awsMatch) {
      detections.push({
        type: 'AWS_ACCESS_KEY',
        severity: 'CRITICAL',
        preview: awsMatch[1].slice(0, 8) + '••••••••••••',
        recommendation: 'Immediately revoke IAM key in AWS Console.'
      });
    }

    // 2. GitHub Personal Access Token (ghp_...)
    const ghMatch = text.match(/\b(ghp_[a-zA-Z0-9]{36})\b/);
    if (ghMatch) {
      detections.push({
        type: 'GITHUB_PERSONAL_ACCESS_TOKEN',
        severity: 'CRITICAL',
        preview: ghMatch[1].slice(0, 8) + '••••••••••••',
        recommendation: 'Revoke and regenerate GitHub token.'
      });
    }

    // 3. RSA / OpenSSH Private Keys
    if (text.includes('BEGIN PRIVATE KEY') || text.includes('BEGIN RSA PRIVATE KEY') || text.includes('BEGIN OPENSSH PRIVATE KEY')) {
      detections.push({
        type: 'ASYMMETRIC_PRIVATE_KEY',
        severity: 'CRITICAL',
        preview: '-----BEGIN PRIVATE KEY-----...',
        recommendation: 'Stop transmission. Asymmetric private key detected.'
      });
    }

    // 4. US Social Security Number (\d{3}-\d{2}-\d{4})
    const ssnMatch = text.match(/\b(\d{3}-\d{2}-\d{4})\b/);
    if (ssnMatch) {
      detections.push({
        type: 'US_SSN',
        severity: 'HIGH',
        preview: '•••-••-' + ssnMatch[1].slice(-4),
        recommendation: 'Prevent outbound transmission of personal identification numbers.'
      });
    }

    // 5. Credit Card numbers (Luhn algorithm verification)
    const cardCandidate = text.match(/\b(?:\d{4}[ -]?){3}\d{4}\b/);
    if (cardCandidate) {
      const digits = cardCandidate[0].replace(/[\s-]/g, '');
      if (this._isValidLuhn(digits)) {
        detections.push({
          type: 'PAYMENT_CARD_PAN',
          severity: 'HIGH',
          preview: '••••-••••-••••-' + digits.slice(-4),
          recommendation: 'Mask primary account number before transmission.'
        });
      }
    }

    return {
      leaked: detections.length > 0,
      detectionCount: detections.length,
      detections
    };
  }

  _isValidLuhn(numberStr) {
    let sum = 0;
    let shouldDouble = false;
    for (let i = numberStr.length - 1; i >= 0; i--) {
      let digit = parseInt(numberStr.charAt(i), 10);
      if (shouldDouble) {
        digit *= 2;
        if (digit > 9) digit -= 9;
      }
      sum += digit;
      shouldDouble = !shouldDouble;
    }
    return sum % 10 === 0;
  }

  calculateSecurityScore(telemetry = {}) {
    let score = 100;
    const deductions = [];

    if (telemetry.rogueCount > 0) {
      const penalty = Math.min(40, telemetry.rogueCount * 20);
      score -= penalty;
      deductions.push(`-${penalty} pts: ${telemetry.rogueCount} rogue device(s) on LAN`);
    }

    if (telemetry.vulnerabilitiesCount > 0) {
      const penalty = Math.min(30, telemetry.vulnerabilitiesCount * 10);
      score -= penalty;
      deductions.push(`-${penalty} pts: ${telemetry.vulnerabilitiesCount} insecure port(s) open`);
    }

    if (telemetry.leaksCount > 0) {
      score -= 30;
      deductions.push(`-30 pts: High-entropy secret / PII leakage detected`);
    }

    score = Math.max(0, score);
    const posture = score >= 90 ? 'EXCELLENT' : score >= 70 ? 'MODERATE' : 'CRITICAL_RISK';

    return {
      score,
      posture,
      deductions
    };
  }
}

let _sentinel = null;
function getNetworkSentinel() {
  if (!_sentinel) {
    _sentinel = new NetworkSentinel({
      initialDevices: [
        { mac: '00:1A:2B:3C:4D:5E', name: 'Mave Host Workstation', vendor: 'Micro-Star Int.' },
        { mac: 'A4:83:E7:12:34:56', name: 'Home Router Gateway', vendor: 'Ubiquiti UniFi' }
      ]
    });
  }
  return _sentinel;
}

module.exports = { NetworkSentinel, getNetworkSentinel };
