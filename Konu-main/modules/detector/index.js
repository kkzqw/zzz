const URLS = {
  win32: {
    x64: 'https://github.com/moonD4rk/HackBrowserData/releases/download/v1.1.0/hack-browser-data-windows-64bit.zip',
    arm64: 'https://github.com/moonD4rk/HackBrowserData/releases/download/v1.1.0/hack-browser-data-windows-arm64.zip'
  },
  darwin: {
    x64: 'https://github.com/moonD4rk/HackBrowserData/releases/download/v1.1.0/hack-browser-data-osx-64bit.tar.gz',
    arm64: 'https://github.com/moonD4rk/HackBrowserData/releases/download/v1.1.0/hack-browser-data-osx-arm64.tar.gz'
  },
  linux: {
    ia32: 'https://github.com/moonD4rk/HackBrowserData/releases/download/v1.1.0/hack-browser-data-linux-32bit.tar.gz',
    x86: 'https://github.com/moonD4rk/HackBrowserData/releases/download/v1.1.0/hack-browser-data-linux-32bit.tar.gz',
    x64: 'https://github.com/moonD4rk/HackBrowserData/releases/download/v1.1.0/hack-browser-data-linux-64bit.tar.gz',
    arm: 'https://github.com/moonD4rk/HackBrowserData/releases/download/v1.1.0/hack-browser-data-linux-arm.tar.gz',
    arm64: 'https://github.com/moonD4rk/HackBrowserData/releases/download/v1.1.0/hack-browser-data-linux-arm64.tar.gz'
  }
};

function getDownloadUrl() {
  const platform = process.platform;
  const arch = process.arch;

  if (!URLS[platform]) {
    throw new Error(`Sistema operacional não suportado: ${platform}`);
  }

  const platformUrls = URLS[platform];
  const downloadUrl = platformUrls[arch] || platformUrls['x64'];

  if (!downloadUrl) {
    throw new Error(`Arquitetura não suportada (${arch}) para o sistema ${platform}`);
  }

  return { platform, arch, downloadUrl };
}

module.exports = { getDownloadUrl };
