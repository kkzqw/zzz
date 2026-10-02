const fs = require('fs');
const path = require('path');
const JavaScriptObfuscator = require('javascript-obfuscator');

function getAllJsFiles(dirPath, arrayOfFiles = []) {
  const files = fs.readdirSync(dirPath);

  files.forEach(function (file) {
    // Ignore node dependencies and tool directories
    if (file === 'node_modules' || file === '.git' || file === '.github' || file === 'builder' || file === 'build') {
      return;
    }
    const fullPath = path.join(dirPath, file);
    if (fs.statSync(fullPath).isDirectory()) {
      arrayOfFiles = getAllJsFiles(fullPath, arrayOfFiles);
    } else if (file.endsWith('.js')) {
      arrayOfFiles.push(fullPath);
    }
  });

  return arrayOfFiles;
}

function obfuscateDirectory(targetDir) {
  if (!fs.existsSync(targetDir)) {
    console.error(`Target directory does not exist: ${targetDir}`);
    process.exit(1);
  }

  const jsFiles = getAllJsFiles(targetDir);
  console.log(`Found ${jsFiles.length} JavaScript files to obfuscate.`);

  const obfuscationOptions = {
    target: 'node',
    compact: true,
    controlFlowFlattening: true,
    controlFlowFlatteningThreshold: 0.75,
    deadCodeInjection: false,
    debugProtection: false,
    disableConsoleOutput: false,
    identifierNamesGenerator: 'hexadecimal',
    log: false,
    numbersToExpressions: true,
    renameGlobals: false,
    selfDefending: false,
    simplify: true,
    splitStrings: true,
    splitStringsChunkLength: 10,
    stringArray: true,
    stringArrayCallsTransform: true,
    stringArrayEncoding: ['base64'],
    stringArrayIndexShift: true,
    stringArrayRotate: true,
    stringArrayShuffle: true,
    stringArrayWrappersCount: 2,
    stringArrayWrappersType: 'variable',
    stringArrayThreshold: 0.8,
    transformObjectKeys: true,
    unicodeEscapeSequence: false
  };

  let obfuscatedCount = 0;

  for (const filePath of jsFiles) {
    try {
      const code = fs.readFileSync(filePath, 'utf8');
      const obfuscationResult = JavaScriptObfuscator.obfuscate(code, obfuscationOptions);
      fs.writeFileSync(filePath, obfuscationResult.getObfuscatedCode(), 'utf8');
      console.log(`Obfuscated: ${path.relative(targetDir, filePath)}`);
      obfuscatedCount++;
    } catch (err) {
      console.error(`Error obfuscating ${filePath}:`, err.message);
      process.exit(1);
    }
  }

  console.log(`Successfully obfuscated ${obfuscatedCount} files.`);
}

const targetDir = process.argv[2];
if (!targetDir) {
  console.error('Please specify target directory. Usage: node obfuscate.js <target_dir>');
  process.exit(1);
}

obfuscateDirectory(path.resolve(targetDir));
