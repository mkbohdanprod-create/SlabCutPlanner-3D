import { execSync } from 'child_process';
import path from 'path';

const files = [
  'Бланк погодження для Замовлення 81-1305719 від 13_02_2026_Стеклянкин Алексей Николаевич.pdf',
  'Бланк погодження для Замовлення 81-1343228 від 20_02_2026_СКАЙ ІНТЕРІОР.pdf',
  'Бланк погодження для Замовлення 81-1594713 від 06_04_2026_Ференц Андрій Тарасович.pdf',
  'Бланк погодження для Замовлення VK-0013348 від 28_04_2026_Prokopenko Tetiana.pdf'
];

const ports = [5173, 5174];
const blanksDir = 'C:/hhgh/cad 20/Бланки';
const outDir = 'C:/Users/b_dulysh/.gemini/antigravity-ide/scratch';

for (const file of files) {
  const shortName = file.match(/Замовлення ([A-Z0-9-]+)/)?.[1] || 'unknown';
  for (const port of ports) {
    const url = `http://localhost:${port}/`;
    const fullPath = path.join(blanksDir, file);
    const outFile = path.join(outDir, `result_${port}_${shortName}.json`);
    
    console.log(`\n==================================================`);
    console.log(`Running import test for ${shortName} on port ${port}...`);
    console.log(`==================================================`);
    try {
      execSync(`node test_pdf_import.mjs "${url}" "${fullPath}" "${outFile}"`, { stdio: 'inherit' });
    } catch (e) {
      console.error(`Failed on port ${port} for ${file}:`, e.message);
    }
  }
}
