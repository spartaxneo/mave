const { execSync } = require('child_process');

async function check() {
  try {
    const ps = execSync('powershell -NoProfile -Command "Get-Process -Name electron, pinchtab -ErrorAction SilentlyContinue | Format-Table Id, ProcessName"').toString();
    console.log(ps.trim());
  } catch (err) {
    console.log('Process check error:', err.message);
  }

  try {
    const res = await fetch('http://127.0.0.1:4040/health');
    console.log('Mave 4040 status:', res.status);
  } catch (err) {
    console.log('Mave 4040 error:', err.message);
  }

  try {
    const res = await fetch('http://127.0.0.1:9867/health');
    console.log('PinchTab 9867 status:', res.status);
  } catch (err) {
    console.log('PinchTab 9867 error:', err.message);
  }
}

check();
