const fs = require('fs');

const cssPath = 'C:\\hhgh\\SlabCutPlanner\\web-app\\src\\styles\\global.css';
let css = fs.readFileSync(cssPath, 'utf-8');

// Change border-radius globally to make it strict
css = css.replace(/border-radius:\s*\d+px/g, (match) => {
  if (match.includes('999px')) return match; // Keep pill shapes if any
  return 'border-radius: 2px';
});
css = css.replace(/border-radius:\s*[\dpx\s]+;/g, (match) => {
  if (match.includes('999px')) return match;
  return 'border-radius: 2px;';
});

// Tighten paddings for inputs/buttons
css = css.replace(/padding:\s*8px\s+12px;/g, 'padding: 5px 8px;');
css = css.replace(/padding:\s*7px\s+9px;/g, 'padding: 4px 6px;');

// Darken some colors for industrial look
css = css.replace(/background: #eaf0f4;/g, 'background: #e0e6ed;');
css = css.replace(/background: #dfe8ee;/g, 'background: #d4dde5;');

fs.writeFileSync(cssPath, css);
console.log('CSS modernized to industrial style.');
