'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const os = require('os');

function getLocalIp() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return '127.0.0.1';
}

function getSslDir() {
  const appData = process.env.APPDATA || path.join(os.homedir(), '.config');
  const dir = path.join(appData, 'mave', 'ssl');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function findOpenSsl() {
  const candidates = [
    'C:\\Program Files\\Git\\usr\\bin\\openssl.exe',
    'C:\\Program Files (x86)\\Git\\usr\\bin\\openssl.exe',
    'openssl.exe',
    'openssl'
  ];
  for (const c of candidates) {
    try {
      if (fs.existsSync(c)) return c;
      execSync(`"${c}" version`, { stdio: 'ignore' });
      return c;
    } catch {
      // continue
    }
  }
  return null;
}

function ensureSslCert() {
  const sslDir = getSslDir();
  const keyPath = path.join(sslDir, 'key.pem');
  const certPath = path.join(sslDir, 'cert.pem');

  if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
    try {
      return {
        key: fs.readFileSync(keyPath),
        cert: fs.readFileSync(certPath)
      };
    } catch (e) {
      // regenerate if corrupted
    }
  }

  const openssl = findOpenSsl();
  if (!openssl) {
    return null;
  }

  const localIp = getLocalIp();
  const cnfPath = path.join(sslDir, 'openssl.cnf');
  const cnfContent = `
[req]
distinguished_name = req_distinguished_name
x509_extensions = v3_req
prompt = no

[req_distinguished_name]
CN = Mave Local Controller
O = Mave

[v3_req]
keyUsage = nonRepudiation, digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth
subjectAltName = @alt_names

[alt_names]
DNS.1 = localhost
DNS.2 = mave.local
IP.1 = 127.0.0.1
IP.2 = ${localIp}
`;
  fs.writeFileSync(cnfPath, cnfContent.trim());

  try {
    const cmd = `"${openssl}" req -x509 -nodes -days 3650 -newkey rsa:2048 -keyout "${keyPath}" -out "${certPath}" -config "${cnfPath}"`;
    execSync(cmd, { stdio: 'ignore' });

    if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
      return {
        key: fs.readFileSync(keyPath),
        cert: fs.readFileSync(certPath)
      };
    }
  } catch (err) {
    console.error('[SSL] Failed to generate self-signed certificate:', err.message);
  }

  return null;
}

module.exports = {
  ensureSslCert,
  getLocalIp
};
