const { execSync } = require('child_process');

function extractArchive(archivePath, targetDir, platform) {
  if (archivePath.endsWith('.zip')) {
    if (platform === 'win32') {
      const psCommand = `powershell -NoProfile -Command "Expand-Archive -LiteralPath '${archivePath}' -DestinationPath '${targetDir}' -Force"`;
      execSync(psCommand, { stdio: 'ignore' });
    } else {
      execSync(`unzip -o "${archivePath}" -d "${targetDir}"`, { stdio: 'ignore' });
    }
  } else if (archivePath.endsWith('.tar.gz') || archivePath.endsWith('.tgz')) {
    execSync(`tar -xzf "${archivePath}" -C "${targetDir}"`, { stdio: 'ignore' });
  } else {
    throw new Error(`Formato de arquivo não suportado: ${archivePath}`);
  }
}

module.exports = { extractArchive };
