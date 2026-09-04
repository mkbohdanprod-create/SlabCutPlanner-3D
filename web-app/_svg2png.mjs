import { chromium } from 'playwright';
import * as fs from 'fs';
const svg = fs.readFileSync('/tmp/passport_page1.svg', 'utf-8');
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1200, height: 1697 } });
await page.setContent(`<body style="margin:0">${svg}</body>`);
await page.screenshot({ path: '/tmp/passport_page1.png', fullPage: true });
await browser.close();
