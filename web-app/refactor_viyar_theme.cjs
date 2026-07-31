const fs = require('fs');

const cssPath = 'C:\\hhgh\\SlabCutPlanner\\web-app\\src\\styles\\global.css';
let css = fs.readFileSync(cssPath, 'utf-8');

// 1. Replace :root variables
css = css.replace(
  /:root\s*{[^}]*}/g,
  `:root {
  --bg-main: #f5f6f8;
  --bg-panel: #ffffff;
  --bg-panel-hover: #f8f9fa;
  --bg-input: #ffffff;
  --border-color: #dce1e6;
  --border-color-light: #e9ecef;
  --text-primary: #212529;
  --text-secondary: #6c757d;
  --accent-color: #0084ff;
  --accent-hover: #006bce;
  --accent-text: #ffffff;
  --header-bg: #2b303b;
  --header-text: #ffffff;
  --danger-color: #dc3545;
  --danger-hover: #c82333;
  
  font-family: 'Roboto', Inter, Arial, sans-serif;
  color: var(--text-primary);
  background: var(--bg-main);
  color-scheme: light;
}`
);

// We keep the rest of the replacements from the previous script because they just map to the variables.
// Except for hardcoded dark colors in canvas shells. Let's fix them to light theme.

css = css.replace(/\.slab-scroll-shell\s*{[^}]*}/g, (match) => {
  return match
    .replace(/background:\s*#111111;/, 'background: var(--bg-main);')
    .replace(/border: 1px solid var\(--border-color\);/, 'border: 1px solid var(--border-color);');
});
css = css.replace(/\.slab-svg, \.texture-svg\s*{[^}]*}/g, (match) => {
  return match
    .replace(/background:\s*#111111;/, 'background: var(--bg-panel);')
    .replace(/border: 1px solid var\(--border-color\);/, 'border: 1px solid var(--border-color);');
});
css = css.replace(/\.slab-magnifier-view\s*{[^}]*}/g, (match) => {
  return match
    .replace(/background:\s*#111111;/, 'background: var(--bg-panel);')
    .replace(/border: 1px solid var\(--border-color\);/, 'border: 1px solid var(--border-color);');
});


fs.writeFileSync(cssPath, css, 'utf-8');
