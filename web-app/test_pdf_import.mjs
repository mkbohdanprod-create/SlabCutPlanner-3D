import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

const url = process.argv[2] || 'http://localhost:5173/';
const pdfPath = process.argv[3] || 'C:/hhgh/cad 20/Бланки/Бланк погодження для Замовлення 81-1343228 від 20_02_2026_СКАЙ ІНТЕРІОР.pdf';
const outputPath = process.argv[4] || 'C:/Users/b_dulysh/.gemini/antigravity-ide/scratch/import_result.json';

(async () => {
  console.log(`Testing URL: ${url}`);
  console.log(`Uploading PDF: ${pdfPath}`);
  
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  
  await page.setViewport({ width: 1440, height: 900 });
  
  page.on('console', msg => {
    if (msg.text().includes('[APPROVAL_DEBUG]') || msg.text().includes('OCR')) {
      console.log('PAGE LOG:', msg.text());
    }
  });
  
  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
    
    const importBtn = await page.waitForSelector('::-p-xpath(//button[contains(text(), "Імпортувати бланку") or contains(text(), "Імпортувати бланк") or contains(text(), "Імпорт бланку")])', { timeout: 15000 });
    
    const [fileChooser] = await Promise.all([
      page.waitForFileChooser(),
      importBtn.click(),
    ]);
    
    await fileChooser.accept([pdfPath]);
    console.log('File submitted, waiting for parsing/OCR (up to 120s)...');
    
    await page.waitForSelector('.approval-preview-row', { timeout: 120000 });
    
    const items = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('.approval-preview-row'));
      return rows.map(row => {
        const name = row.querySelector('.approval-preview-item-head strong')?.textContent?.trim() || 'Unknown';
        const status = row.querySelector('.approval-status')?.textContent?.trim() || '';
        const isError = row.classList.contains('approval-preview-row-error');
        
        // Extract side dimensions from .approval-dimension-editor
        const sideDimensions = {};
        row.querySelectorAll('.approval-dimension-editor .field').forEach(f => {
          const side = f.querySelector('label')?.textContent?.trim();
          const inputEl = f.querySelector('input');
          if (side && side.length === 1 && /^[A-I]$/.test(side) && inputEl) {
            sideDimensions[side] = parseFloat(inputEl.value || '0');
          }
        });

        if (Object.keys(sideDimensions).length === 0) {
          row.querySelectorAll('.approval-dimension-editor label').forEach(f => {
            const side = f.querySelector('span')?.textContent?.trim();
            const inputEl = f.querySelector('input');
            if (side && side.length === 1 && /^[A-I]$/.test(side) && inputEl) {
              sideDimensions[side] = parseFloat(inputEl.value || '0');
            }
          });
        }

        const numberInputs = Array.from(row.querySelectorAll('.dxf-preview-controls input[type="number"]'));
        let width = numberInputs[0] ? parseFloat(numberInputs[0].value) : 0;
        let height = numberInputs[1] ? parseFloat(numberInputs[1].value) : 0;
        let quantity = numberInputs[2] ? parseFloat(numberInputs[2].value) : 0;

        // Fallback for port 5174 where width/height are not separate inputs
        if (width === 0 && height === 0) {
          width = Math.max(
            sideDimensions.A || 0,
            sideDimensions.C || 0,
            sideDimensions.E || 0,
            sideDimensions.G || 0,
            sideDimensions.I || 0
          );
          height = Math.max(
            sideDimensions.B || 0,
            sideDimensions.D || 0,
            sideDimensions.F || 0,
            sideDimensions.H || 0
          );
        }

        const specs = Array.from(row.querySelectorAll('.approval-spec-summary span')).map(el => el.textContent?.trim());
        const warnings = Array.from(row.querySelectorAll('.approval-warning-text')).map(el => el.textContent?.trim());
        const infoText = row.querySelector('.approval-preview-item-info')?.textContent?.trim() || '';
        
        return {
          name,
          status,
          isError,
          width,
          height,
          quantity,
          sideDimensions,
          infoText,
          specs,
          warnings
        };
      });
    });
    
    const result = {
      timestamp: new Date().toISOString(),
      url,
      pdfPath: path.basename(pdfPath),
      items
    };
    
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), 'utf-8');
    console.log(`Successfully saved results to ${outputPath}`);
    
  } catch (err) {
    console.error('Error during import test:', err);
  } finally {
    await browser.close();
  }
})();
