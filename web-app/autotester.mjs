import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import https from 'https';

const token = process.env.TELEGRAM_BOT_TOKEN || "";
const chat_id = process.env.TELEGRAM_CHAT_ID || "";
const watchFile = path.resolve('src/utils/approvalImport.ts');
const blanksDir = 'C:/hhgh/cad 20/Бланки';
const outDir = 'C:/Users/b_dulysh/.gemini/antigravity-ide/scratch';

const files = [
  'Бланк погодження для Замовлення 81-1305719 від 13_02_2026_Стеклянкин Алексей Николаевич.pdf',
  'Бланк погодження для Замовлення 81-1343228 від 20_02_2026_СКАЙ ІНТЕРІОР.pdf',
  'Бланк погодження для Замовлення 81-1594713 від 06_04_2026_Ференц Андрій Тарасович.pdf',
  'Бланк погодження для Замовлення VK-0013348 від 28_04_2026_Prokopenko Tetiana.pdf'
];

function sendTelegramMessage(text) {
  const payload = JSON.stringify({
    chat_id: chat_id,
    text: text,
    parse_mode: "Markdown",
    disable_web_page_preview: true
  });

  const options = {
    hostname: 'api.telegram.org',
    port: 443,
    path: `/bot${token}/sendMessage`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload)
    }
  };

  const req = https.request(options, (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
      console.log('Telegram API response:', data);
    });
  });

  req.on('error', (e) => {
    console.error('Failed to send message to Telegram:', e);
  });

  req.write(payload);
  req.end();
}

function runCommandAsync(cmd) {
  return new Promise((resolve) => {
    exec(cmd, (error, stdout, stderr) => {
      resolve({ error, stdout, stderr });
    });
  });
}

let isRunning = false;
let pendingRun = false;

async function runTestsAndCompare() {
  if (isRunning) {
    pendingRun = true;
    return;
  }
  isRunning = true;
  console.log(`[${new Date().toLocaleTimeString()}] Starting autotest run...`);
  
  // Step 1: Run port 5173 tests for each file
  const testResults = [];
  for (const file of files) {
    const shortName = file.match(/Замовлення ([A-Z0-9-]+)/)?.[1] || 'unknown';
    const fullPath = path.join(blanksDir, file);
    const outFile = path.join(outDir, `result_5173_${shortName}.json`);
    
    console.log(`Testing ${shortName} on port 5173...`);
    const { error, stderr } = await runCommandAsync(`node test_pdf_import.mjs "http://localhost:5173/" "${fullPath}" "${outFile}"`);
    if (error) {
      console.error(`Error testing ${shortName}:`, stderr);
    }
  }

  // Step 2: Compare results with reference (5174)
  let report = `*🔄 Звіт автотесту SlabCutPlanner*\n`;
  report += `Час: ${new Date().toLocaleTimeString()}\n\n`;
  
  let totalMismatches = 0;
  let summaryDetails = '';

  for (const file of files) {
    const shortName = file.match(/Замовлення ([A-Z0-9-]+)/)?.[1] || 'unknown';
    const fileActive = path.join(outDir, `result_5173_${shortName}.json`);
    const fileRef = path.join(outDir, `result_5174_${shortName}.json`);
    
    if (!fs.existsSync(fileActive) || !fs.existsSync(fileRef)) {
      summaryDetails += `⚠️ *${shortName}*: Відсутні файли результатів\n`;
      continue;
    }
    
    try {
      const active = JSON.parse(fs.readFileSync(fileActive, 'utf-8'));
      const ref = JSON.parse(fs.readFileSync(fileRef, 'utf-8'));
      
      let docErrors = 0;
      let docInfo = `*Бланк ${shortName}* (Активний: ${active.items.length} дет., Референс: ${ref.items.length} дет.):\n`;
      
      const maxLen = Math.max(active.items.length, ref.items.length);
      for (let i = 0; i < maxLen; i++) {
        const actItem = active.items[i];
        const refItem = ref.items[i];
        
        if (actItem && refItem) {
          const sizeMismatch = actItem.width !== refItem.width || actItem.height !== refItem.height;
          const errorMismatch = actItem.isError !== refItem.isError;
          
          if (sizeMismatch || errorMismatch) {
            docErrors++;
            totalMismatches++;
            docInfo += `  ❌ Дет. #${i+1} *${actItem.name}*:\n`;
            if (sizeMismatch) {
              docInfo += `    Розмір: ${actItem.width}x${actItem.height} vs ${refItem.width}x${refItem.height} мм\n`;
            }
            if (errorMismatch) {
              docInfo += `    Помилка: activeError=${actItem.isError} vs refError=${refItem.isError}\n`;
            }
          }
        } else {
          docErrors++;
          totalMismatches++;
          docInfo += `  ❌ Розбіжність у наявності деталі #${i+1}\n`;
        }
      }
      
      if (docErrors === 0) {
        summaryDetails += `✅ *${shortName}*: 100% співпадіння (${active.items.length} дет.)\n`;
      } else {
        summaryDetails += `⚠️ *${shortName}*: ${docErrors} розбіжностей!\n${docInfo}\n`;
      }
    } catch (e) {
      summaryDetails += `❌ *${shortName}*: Помилка парсингу JSON: ${e.message}\n`;
    }
  }
  
  if (totalMismatches === 0) {
    report += `🎉 *Усі 4 бланки розпізнано ідеально!* 100% відповідність референсу.\n\n`;
  } else {
    report += `⚠️ *Виявлено ${totalMismatches} розбіжностей з референсом!*\n\n`;
  }
  
  report += summaryDetails;
  
  sendTelegramMessage(report);
  console.log(`[${new Date().toLocaleTimeString()}] Autotest run complete. Telegram notification sent.`);
  
  isRunning = false;
  if (pendingRun) {
    pendingRun = false;
    setTimeout(runTestsAndCompare, 1000);
  }
}

// Watch file changes
let watchTimeout = null;
fs.watch(watchFile, (eventType) => {
  if (eventType === 'change') {
    if (watchTimeout) clearTimeout(watchTimeout);
    watchTimeout = setTimeout(() => {
      console.log(`File approvalImport.ts changed, triggering autotests...`);
      runTestsAndCompare();
    }, 1500); // Debounce 1.5s
  }
});

console.log(`Autotester is watching for changes in: ${watchFile}`);
sendTelegramMessage(`🚀 *Автотестер запущено!*\nСкрипт спостерігає за змінами в \`approvalImport.ts\`. Будь-яке збереження автоматично запустить тести та надішле звіт сюди.`);

// Periodic heartbeat status reports (every 20 mins day/evening, every 60 mins night)
setInterval(() => {
  const hour = new Date().getHours();
  const intervalMinutes = (hour >= 22 || hour < 8) ? 60 : 20;
  
  // To implement exact timing, we check if the current minute matches the interval.
  // But since setInterval is used, we can just check elapsed time or do a simplified check.
  // Actually, let's just send a heartbeat message every 20 minutes if daytime, or 60 minutes if nighttime.
  // We can track the last heartbeat time.
}, 60000);

let lastHeartbeat = Date.now();
setInterval(() => {
  const hour = new Date().getHours();
  const thresholdMs = (hour >= 22 || hour < 8) ? 60 * 60 * 1000 : 20 * 60 * 1000;
  
  if (Date.now() - lastHeartbeat >= thresholdMs - 5000) {
    lastHeartbeat = Date.now();
    sendTelegramMessage(`⏰ *Періодичний звіт (Heartbeat)*\nАвтотестер активний і чекає на зміни коду. Система працює стабільно.`);
  }
}, 30000);

// Run initially to confirm start state
runTestsAndCompare();
