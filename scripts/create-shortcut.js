const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const rootDir = 'C:\\Users\\ryzen\\Documents\\antigravity\\dazzling-archimedes';
const electronExe = path.join(rootDir, 'node_modules', 'electron', 'dist', 'electron.exe');
const iconFile = path.join(rootDir, 'build', 'icon.ico');
const startBat = path.join(rootDir, 'start-mave.bat');

const candidates = [
  path.join(process.env.USERPROFILE || '', 'Desktop'),
  path.join(process.env.USERPROFILE || '', 'OneDrive', 'Desktop'),
  path.join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs')
].filter(Boolean);

const existingDirs = [...new Set(candidates.filter(dir => fs.existsSync(dir)))];

console.log('Target directories found:', existingDirs);

for (const targetDir of existingDirs) {
  const shortcutPath = path.join(targetDir, 'Mave.lnk');
  
  // Create shortcut pointing directly to electron.exe with '.' argument
  const vbsLines = [
    'Set WshShell = CreateObject("WScript.Shell")',
    `Set oLink = WshShell.CreateShortcut("${shortcutPath}")`,
    `oLink.TargetPath = "${electronExe}"`,
    'oLink.Arguments = "."',
    `oLink.WorkingDirectory = "${rootDir}"`,
    `oLink.IconLocation = "${iconFile},0"`,
    'oLink.WindowStyle = 1',
    'oLink.Description = "Mave - Desktop AI Companion"',
    'oLink.Save'
  ];

  const tmpVbs = path.join(__dirname, `create-shortcut-${Date.now()}.vbs`);
  fs.writeFileSync(tmpVbs, vbsLines.join('\r\n'));

  try {
    execSync(`cscript //nologo "${tmpVbs}"`, { stdio: 'inherit' });
    if (fs.existsSync(shortcutPath)) {
      console.log(`Successfully created shortcut: ${shortcutPath}`);
    }
  } catch (err) {
    console.error(`Error creating shortcut for ${shortcutPath}:`, err.message);
  } finally {
    try { fs.unlinkSync(tmpVbs); } catch {}
  }

  // If this is a Desktop folder, also place a direct Start Mave.bat for 100% guarantee
  if (targetDir.toLowerCase().includes('desktop')) {
    const batPath = path.join(targetDir, 'Start Mave.bat');
    fs.copyFileSync(startBat, batPath);
    console.log(`Successfully copied fallback launcher: ${batPath}`);
  }
}
