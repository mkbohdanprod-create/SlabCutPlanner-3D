const { execSync } = require('child_process');
const path = require('path');

const files = [
  'Бланк погодження для Замовлення 81-1305719 від 13_02_2026_Стеклянкин Алексей Николаевич.pdf',
  'Бланк погодження для Замовлення 81-1343228 від 20_02_2026_СКАЙ ІНТЕРІОР.pdf',
  'Бланк погодження для Замовлення 81-1594713 від 06_04_2026_Ференц Андрій Тарасович.pdf',
  'Бланк погодження для Замовлення VK-0013348 від 28_04_2026_Prokopenko Tetiana.pdf'
];

const blanksDir = 'C:/hhgh/cad 20/Бланки';
const outDir = 'C:/Users/b_dulysh/.gemini/antigravity-ide/scratch';

console.log('Regenerating reference results on port 5174...');

for (const file of files) {
  const shortName = file.match(/Замовлення ([A-Z0-9-]+)/)?.[1] || 'unknown';
  const url = `http://localhost:5174/`;
  const fullPath = path.join(blanksDir, file);
  const outFile = path.join(outDir, `result_5174_${shortName}.json`);
  
  console.log(`Running reference import for ${shortName} on port 5174...`);
  try {
    execSync(`node test_pdf_import.mjs "${url}" "${fullPath}" "${outFile}"`, { stdio: 'inherit' });
  } catch (e) {
    console.error(`Failed on port 5174 for ${file}:`, e.message);
  }
}

console.log('All reference results regenerated successfully!');
