'use strict';

/**
 * Vorssaint OS — Standalone Multi-Platform Packaging Engine
 * Windows 10/11, Android, and iOS (iPhone & iPadOS)
 * Upstream Reference: https://github.com/vorssaint/vorssaint-utils.git
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const VORSSAINT_DIR = path.join(ROOT, 'vorssaint');

function checkPrerequisites() {
  console.log('=== Vorssaint OS Build & Package Verifier ===\n');
  
  const platforms = [
    {
      name: 'Windows Desktop (Win 10/11)',
      target: 'electron',
      entry: path.join(ROOT, 'src', 'vorssaint', 'standalone.js'),
      manifest: path.join(ROOT, 'package.json'),
      status: fs.existsSync(path.join(ROOT, 'src', 'vorssaint', 'standalone.js')) ? 'READY' : 'MISSING'
    },
    {
      name: 'Android Phones & Tablets (API 29+)',
      target: 'gradle',
      entry: path.join(VORSSAINT_DIR, 'android', 'app', 'src', 'main', 'java', 'com', 'vorssaint', 'utils', 'MainActivity.kt'),
      manifest: path.join(VORSSAINT_DIR, 'android', 'app', 'src', 'main', 'AndroidManifest.xml'),
      status: fs.existsSync(path.join(VORSSAINT_DIR, 'android', 'build.gradle')) ? 'READY' : 'MISSING'
    },
    {
      name: 'iOS & iPadOS (iOS 16+, iPadOS 16+)',
      target: 'swiftui',
      entry: path.join(VORSSAINT_DIR, 'ios', 'App', 'VorssaintMainView.swift'),
      manifest: path.join(VORSSAINT_DIR, 'ios', 'App', 'VorssaintApp.swift'),
      status: fs.existsSync(path.join(VORSSAINT_DIR, 'ios', 'App', 'VorssaintApp.swift')) ? 'READY' : 'MISSING'
    },
    {
      name: 'Mobile Web & PWA Standalone Companion',
      target: 'pwa',
      entry: path.join(VORSSAINT_DIR, 'android', 'mobile_web', 'index.html'),
      manifest: path.join(VORSSAINT_DIR, 'android', 'mobile_web', 'manifest.json'),
      status: fs.existsSync(path.join(VORSSAINT_DIR, 'android', 'mobile_web', 'manifest.json')) ? 'READY' : 'MISSING'
    }
  ];

  let allReady = true;
  for (const p of platforms) {
    const ok = p.status === 'READY';
    console.log(`[${ok ? '✓ PASS' : '✗ FAIL'}] ${p.name.padEnd(42)} Target: ${p.target.padEnd(8)} Status: ${p.status}`);
    if (!ok) allReady = false;
  }

  console.log('\n--- Build Instructions ---');
  console.log('1. Run Windows Standalone:');
  console.log('   npm run vorssaint\n');
  console.log('2. Build Android APK:');
  console.log('   cd vorssaint/android && ./gradlew assembleDebug\n');
  console.log('3. Build iOS / iPadOS Project:');
  console.log('   cd vorssaint/ios && xcodebuild -project Vorssaint.xcodeproj -scheme Vorssaint -destination "generic/platform=iOS" build\n');
  console.log('4. Standalone Mobile PWA:');
  console.log('   Served at http://<your-ip>:3000/vorssaint with auto-registered service worker & manifest\n');

  return allReady;
}

if (require.main === module) {
  const ok = checkPrerequisites();
  process.exit(ok ? 0 : 1);
}

module.exports = { checkPrerequisites };
