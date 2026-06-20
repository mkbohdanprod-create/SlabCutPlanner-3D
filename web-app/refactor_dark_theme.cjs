const fs = require('fs');

const cssPath = 'C:\\hhgh\\SlabCutPlanner\\web-app\\src\\styles\\global.css';
let css = fs.readFileSync(cssPath, 'utf-8');

// 1. Add :root variables
css = css.replace(
  /:root\s*{[^}]*}/g,
  `:root {
  --bg-main: #141414;
  --bg-panel: #1e1e1e;
  --bg-panel-hover: #262626;
  --bg-input: #262626;
  --border-color: #333333;
  --border-color-light: #444444;
  --text-primary: #e2e8f0;
  --text-secondary: #8b9bb4;
  --accent-color: #f1f5f9;
  --accent-hover: #ffffff;
  --accent-text: #0f172a;
  
  font-family: Inter, Arial, sans-serif;
  color: var(--text-primary);
  background: var(--bg-main);
  color-scheme: dark;
}`
);

// 2. Body background
css = css.replace(/body\s*{[^}]*}/g, (match) => {
  return match.replace(/background:\s*[^;]+;/, 'background: var(--bg-main);');
});

// 3. Buttons
css = css.replace(/button\s*{[^}]*}/g, (match) => {
  if (match.includes('border: 1px solid')) {
    return match
      .replace(/border: 1px solid [^;]+;/, 'border: 1px solid var(--border-color);')
      .replace(/background:\s*[^;]+;/, 'background: var(--bg-panel);')
      .replace(/color:\s*[^;]+;/, 'color: var(--text-primary);');
  }
  return match;
});
css = css.replace(/button:hover\s*{[^}]*}/g, (match) => {
  return match.replace(/background:\s*[^;]+;/, 'background: var(--bg-panel-hover);');
});

// Primary actions
css = css.replace(/\.primary-action\s*{[^}]*}/g, (match) => {
  return match
    .replace(/background:\s*[^;]+;/, 'background: var(--accent-color);')
    .replace(/border-color:\s*[^;]+;/, 'border-color: var(--accent-hover);')
    .replace(/color:\s*[^;]+;/, 'color: var(--accent-text);');
});
css = css.replace(/\.primary-action:hover\s*{[^}]*}/g, (match) => {
  return match.replace(/background:\s*[^;]+;/, 'background: var(--accent-hover);');
});

// Inputs
css = css.replace(/input, select\s*{[^}]*}/g, (match) => {
  return match
    .replace(/border: 1px solid [^;]+;/, 'border: 1px solid var(--border-color);')
    .replace(/background:\s*[^;]+;/, 'background: var(--bg-input);')
    .replace(/color:\s*[^;]+;/, 'color: var(--text-primary);');
});

// Labels
css = css.replace(/label\s*{[^}]*}/g, (match) => {
  return match.replace(/color:\s*[^;]+;/, 'color: var(--text-secondary);');
});

// Panels
css = css.replace(/\.panel\s*{[^}]*}/g, (match) => {
  return match
    .replace(/background:\s*[^;]+;/, 'background: var(--bg-panel);')
    .replace(/border: 1px solid [^;]+;/, 'border: 1px solid var(--border-color);')
    .replace(/box-shadow:\s*[^;]+;/, 'box-shadow: none;');
});

// App brand
css = css.replace(/\.app-brand\s*{[^}]*}/g, (match) => {
  return match
    .replace(/background:\s*[^;]+;/, 'background: var(--bg-panel);')
    .replace(/border: 1px solid [^;]+;/, 'border: 1px solid var(--border-color);')
    .replace(/color:\s*[^;]+;/, 'color: var(--accent-color);');
});

// Status bar
css = css.replace(/\.status-bar > div\s*{[^}]*}/g, (match) => {
  return match.replace(/background:\s*[^;]+;/, 'background: var(--bg-panel);');
});

css = css.replace(/\.meta-list > div\s*{[^}]*}/g, (match) => {
  return match.replace(/background:\s*[^;]+;/, 'background: var(--bg-panel);');
});

// File field
css = css.replace(/\.file-field\s*{[^}]*}/g, (match) => {
  return match
    .replace(/border: 1px dashed [^;]+;/, 'border: 1px dashed var(--border-color-light);')
    .replace(/background:\s*[^;]+;/, 'background: var(--bg-panel);');
});
css = css.replace(/\.file-field\.button-like\s*{[^}]*}/g, (match) => {
  return match
    .replace(/background:\s*[^;]+;/, 'background: var(--bg-panel);')
    .replace(/color:\s*[^;]+;/, 'color: var(--text-primary);');
});

// Canvas shells
css = css.replace(/\.slab-scroll-shell\s*{[^}]*}/g, (match) => {
  return match
    .replace(/background:\s*[^;]+;/, 'background: #111111;')
    .replace(/border: 1px solid [^;]+;/, 'border: 1px solid var(--border-color);');
});
css = css.replace(/\.slab-svg, \.texture-svg\s*{[^}]*}/g, (match) => {
  return match
    .replace(/background:\s*[^;]+;/, 'background: #111111;')
    .replace(/border: 1px solid [^;]+;/, 'border: 1px solid var(--border-color);');
});

// Lists panel
css = css.replace(/\.list-item\s*{[^}]*}/g, (match) => {
  return match.replace(/background:\s*[^;]+;/, 'background: var(--bg-input);');
});

// Modals
css = css.replace(/\.detail-modal\s*{[^}]*}/g, (match) => {
  return match
    .replace(/background:\s*[^;]+;/, 'background: var(--bg-panel);')
    .replace(/border: 1px solid [^;]+;/, 'border: 1px solid var(--border-color);');
});
css = css.replace(/\.detail-modal-header p\s*{[^}]*}/g, (match) => {
  return match.replace(/color:\s*[^;]+;/, 'color: var(--text-secondary);');
});

// Split menu
css = css.replace(/\.split-menu\s*{[^}]*}/g, (match) => {
  return match
    .replace(/background:\s*[^;]+;/, 'background: var(--bg-panel);')
    .replace(/border: 1px solid [^;]+;/, 'border: 1px solid var(--border-color);');
});
css = css.replace(/\.split-menu button:hover, \.split-menu button\.active\s*{[^}]*}/g, (match) => {
  return match
    .replace(/background:\s*[^;]+;/, 'background: var(--bg-panel-hover);')
    .replace(/border-color:\s*[^;]+;/, 'border-color: var(--border-color-light);');
});

// Context menu
css = css.replace(/\.canvas-context-menu\s*{[^}]*}/g, (match) => {
  return match
    .replace(/background:\s*[^;]+;/, 'background: var(--bg-panel);')
    .replace(/border: 1px solid [^;]+;/, 'border: 1px solid var(--border-color);');
});
css = css.replace(/\.canvas-context-menu button:hover\s*{[^}]*}/g, (match) => {
  return match
    .replace(/background:\s*[^;]+;/, 'background: var(--bg-panel-hover);')
    .replace(/border-color:\s*[^;]+;/, 'border-color: var(--border-color-light);');
});

// Segmented / Chips
css = css.replace(/\.segmented \.active, \.chip\.active\s*{[^}]*}/g, (match) => {
  return match.replace(/background:\s*[^;]+;/, 'background: var(--accent-color); color: var(--accent-text);');
});

// Texture floating
css = css.replace(/\.texture-preview-floating\s*{[^}]*}/g, (match) => {
  return match
    .replace(/background:\s*[^;]+;/, 'background: var(--bg-panel);')
    .replace(/border: 1px solid [^;]+;/, 'border: 1px solid var(--border-color);');
});
css = css.replace(/\.texture-preview-header\s*{[^}]*}/g, (match) => {
  return match.replace(/border-bottom: 1px solid [^;]+;/, 'border-bottom: 1px solid var(--border-color);');
});
css = css.replace(/\.slab-magnifier-window\s*{[^}]*}/g, (match) => {
  return match
    .replace(/background:\s*[^;]+;/, 'background: var(--bg-panel);')
    .replace(/border: 1px solid [^;]+;/, 'border: 1px solid var(--border-color);');
});
css = css.replace(/\.slab-magnifier-header\s*{[^}]*}/g, (match) => {
  return match.replace(/border-bottom: 1px solid [^;]+;/, 'border-bottom: 1px solid var(--border-color);');
});
css = css.replace(/\.slab-magnifier-zoom\s*{[^}]*}/g, (match) => {
  return match
    .replace(/border-bottom: 1px solid [^;]+;/, 'border-bottom: 1px solid var(--border-color);')
    .replace(/background:\s*[^;]+;/, 'background: var(--bg-panel);');
});
css = css.replace(/\.slab-magnifier-body\s*{[^}]*}/g, (match) => {
  return match.replace(/background:\s*[^;]+;/, 'background: var(--bg-main);');
});
css = css.replace(/\.slab-magnifier-view\s*{[^}]*}/g, (match) => {
  return match
    .replace(/background:\s*[^;]+;/, 'background: #111111;')
    .replace(/border: 1px solid [^;]+;/, 'border: 1px solid var(--border-color);');
});

// Scheme inputs
css = css.replace(/\.scheme-input-wrap input\s*{[^}]*}/g, (match) => {
  return match
    .replace(/background:\s*[^;]+;/, 'background: var(--bg-input);')
    .replace(/color:\s*[^;]+;/, 'color: var(--text-primary);');
});
css = css.replace(/\.scheme-side-wrap button\s*{[^}]*}/g, (match) => {
  return match
    .replace(/background:\s*[^;]+;/, 'background: var(--bg-panel);')
    .replace(/color:\s*[^;]+;/, 'color: var(--text-primary);');
});

fs.writeFileSync(cssPath, css, 'utf-8');
