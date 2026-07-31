const fs = require('fs');
let log = '';
try {
  log = fs.readFileSync('tsc_all.log', 'utf16le');
  if (!log.includes('TS6133')) log = fs.readFileSync('tsc_all.log', 'utf8');
} catch (e) {
  log = fs.readFileSync('tsc_all.log', 'utf8');
}

const regex = /(.+\.tsx?)\((\d+),(\d+)\):\s*error TS6133: '([^']+)' is declared but its value is never read/g;
let match;
const unusedByFile = {};

while ((match = regex.exec(log)) !== null) {
  const file = match[1].trim();
  const line = parseInt(match[2]);
  const varName = match[4];
  if (!unusedByFile[file]) unusedByFile[file] = [];
  unusedByFile[file].push({ line, varName });
}

for (const file of Object.keys(unusedByFile)) {
  if (!fs.existsSync(file)) continue;
  let lines = fs.readFileSync(file, 'utf8').split('\n');
  const vars = unusedByFile[file];
  vars.sort((a, b) => b.line - a.line);
  
  for (const v of vars) {
    const l = v.line - 1;
    let lineContent = lines[l];
    if (!lineContent) continue;
    
    // only attempt to remove if it's an import statement
    if (lineContent.trim().startsWith('import ')) {
      let newContent = lineContent.replace(new RegExp('\\b' + v.varName + '\\b\\s*,?'), '');
      
      // Cleanup empty {} or trailing commas
      newContent = newContent.replace(/,\s*\}/, '}');
      newContent = newContent.replace(/\{\s*,\s*/, '{ ');
      newContent = newContent.replace(/\{\s*\}/, '');
      
      // If the import becomes empty
      if (newContent.match(/import\s+(type\s+)?(from\s+)?['\"].*['\"]/)) {
        newContent = ''; 
      }
      lines[l] = newContent;
    }
  }
  
  // Filter out empty lines caused by import deletion
  lines = lines.filter(l => l !== '');
  fs.writeFileSync(file, lines.join('\n'));
}
console.log('Unused imports removed.');
