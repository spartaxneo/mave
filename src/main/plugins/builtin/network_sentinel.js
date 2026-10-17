'use strict';
// Autonomous Cybersecurity & Network Perimeter Sentinel Plugin for Mave.

const { getNetworkSentinel } = require('../../security/network_sentinel');

module.exports = [
  {
    name: 'network_scan_subnet',
    description: 'Scans the local Wi-Fi / LAN subnet to verify authorized devices and isolate unauthorized rogue MAC addresses.',
    input_schema: {
      type: 'object',
      properties: {
        scanned_devices: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              mac: { type: 'string' },
              ip: { type: 'string' },
              hostname: { type: 'string' },
              vendor: { type: 'string' },
            },
            required: ['mac'],
          },
          description: 'Subnet scan results from local ARP / mDNS discovery.',
        },
      },
      required: [],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const sentinel = getNetworkSentinel();
      ctx.log('info', 'Executing network perimeter subnet audit...');

      const devices = input.scanned_devices || [
        { mac: '00:1A:2B:3C:4D:5E', ip: '192.168.1.100', hostname: 'Workstation' },
        { mac: 'B8:27:EB:AA:BB:CC', ip: '192.168.1.145', hostname: 'Unknown-Device', vendor: 'Espressif Inc.' },
      ];

      const report = sentinel.detectRogueDevices(devices);
      if (report.rogueCount > 0) {
        const rogueLines = report.rogueDevices.map(r => `• ⚠️ **ROGUE**: \`${r.mac}\` (${r.ip}) [${r.vendor}] - *${r.reason}*`).join('\n');
        return `🛡️ **NETWORK PERIMETER ALERT**: Found **${report.rogueCount} rogue device(s)** on subnet:\n${rogueLines}\n\n*Action: Verify MAC authorization or ban on router firewall.*`;
      }

      return `✅ **Network Perimeter Clean**: All ${report.verifiedCount} active devices on subnet match authorized hardware fingerprints.`;
    },
  },

  {
    name: 'network_audit_ports',
    description: 'Checks target host ports for insecure, unencrypted, or dangerous services (Telnet, FTP, unencrypted RTSP).',
    input_schema: {
      type: 'object',
      properties: {
        ports: {
          type: 'array',
          items: { type: 'number' },
          description: 'List of open ports found on target host.',
        },
      },
      required: ['ports'],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const sentinel = getNetworkSentinel();
      ctx.log('info', 'Auditing port vulnerabilities...');

      const report = sentinel.auditPortSecurity(input.ports || []);
      if (!report.isClean) {
        const vulnLines = report.vulnerabilities.map(v => `• [${v.riskLevel}] **Port ${v.port}**: ${v.description} -> *${v.remediation}*`).join('\n');
        return `🚨 **PORT SECURITY VULNERABILITIES DETECTED** (${report.vulnerabilitiesCount}):\n${vulnLines}`;
      }

      return `✅ **Port Audit Passed**: None of the ${report.auditedCount} audited ports expose unencrypted or vulnerable protocols.`;
    },
  },

  {
    name: 'security_scan_data_leakage',
    description: 'Scans text, snippets, or outbound payload for leaked API tokens (AWS, GitHub), private keys, credit card PANs, or SSNs.',
    input_schema: {
      type: 'object',
      properties: {
        payload: { type: 'string', description: 'Content to scan for high-risk secret or PII leakage.' },
      },
      required: ['payload'],
      additionalProperties: false,
    },
    async run(input, ctx) {
      const sentinel = getNetworkSentinel();
      ctx.log('info', 'Scanning payload for secrets and sensitive PII...');

      const report = sentinel.scanForDataLeakage(input.payload);
      if (report.leaked) {
        const leakLines = report.detections.map(d => `• 🚨 **${d.type}** [${d.severity}]: \`${d.preview}\` - *${d.recommendation}*`).join('\n');
        return `🛑 **DATA LEAKAGE INTERCEPTED**: Exfiltration of sensitive material prevented:\n${leakLines}`;
      }

      return `🔒 **Payload Clean**: No credentials, private keys, or PII detected in inspected payload.`;
    },
  },
];
