import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  await page.goto('http://localhost:5173/');
  
  console.log('Page loaded. Waiting for UI...');
  
  // Click "Імпортувати бланк погодження"
  const importBtn = await page.waitForSelector('::-p-xpath(//button[contains(text(), "Імпортувати бланк погодження")])');
  
  // We need to intercept the file chooser
  const [fileChooser] = await Promise.all([
    page.waitForFileChooser(),
    importBtn.click(),
  ]);
  
  console.log('Uploading file...');
  // Upload VK-0013348
  await fileChooser.accept(['C:/hhgh/SlabCutPlanner/Бланк погодження/Бланк погодження для Замовлення VK-0013348 від 28_04_2026_Prokopenko Tetiana.pdf']);
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));
  
  console.log('Waiting for approval preview...');
  // Wait for the modal rows

  await page.waitForSelector('.approval-preview-row', { timeout: 90000 });
  
  console.log('Analyzing items...');
  const items = await page.$$eval('.approval-preview-row', rows => {
    return rows.map(row => {
      const name = row.querySelector('.approval-preview-item-head strong')?.textContent || 'Unknown';
      const isError = row.classList.contains('approval-preview-row-error');
      const textContent = row.textContent || '';
      return {
        name,
        isError,
        hasSpecGenerated: textContent.includes('spec-generated'),
        status: row.querySelector('.approval-status')?.textContent || '?',
        splitCheckboxCount: row.querySelectorAll('input[type="checkbox"]').length // simple heuristic to check if checkboxes exist
      };
    });
  });
  
  console.log(`Found ${items.length} items in preview:`);
  items.forEach((item, i) => {
    console.log(`${i + 1}. ${item.name} | Error: ${item.isError} | Status: ${item.status} | spec-generated: ${item.hasSpecGenerated} | Checkboxes: ${item.splitCheckboxCount}`);
  });
  
  // Click Split
  console.log('Checking "Split" (Розділити) checkboxes if available...');
  const splitCheckboxes = await page.$$('.approval-split-check input[type="checkbox"]');
  console.log(`Found ${splitCheckboxes.length} split checkboxes.`);
  for (const cb of splitCheckboxes) {
    await cb.click();
  }
  
  // Click Import
  console.log('Clicking Import button...');
  const importSubmitBtn = await page.waitForSelector('::-p-xpath(//button[contains(text(), "Імпортувати") and not(contains(text(), "бланк"))])');
  await importSubmitBtn.click();
  
  // Wait for it to close
  await page.waitForTimeout(1000);
  
  // Count imported details
  const details = await page.$$('.detail-row');
  console.log(`Imported ${details.length} details into the project.`);
  
  await browser.close();
})();
