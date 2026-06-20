const fs = require('fs');

const appTsxPath = 'C:\\hhgh\\SlabCutPlanner\\web-app\\src\\App.tsx';
let appTsx = fs.readFileSync(appTsxPath, 'utf-8');

// Header height
appTsx = appTsx.replace(/<header className="h-\[60px\] min-h-\[60px\][^"]*"/, '<header className="h-12 min-h-[48px] bg-[#22252a] flex items-center justify-between px-4 sticky top-0 z-50"');

// Title size
appTsx = appTsx.replace(/<h1 className="text-xl font-bold text-\[var\(--header-text\)\] tracking-tight">/, '<h1 className="text-lg font-bold text-[var(--header-text)] tracking-tight">');

// Divider
appTsx = appTsx.replace(/<div className="h-8 w-px bg-\[#3f4756\] mx-2"><\/div>/g, '<div className="h-6 w-px bg-white/10 mx-2"></div>');

// Login / Project Buttons
appTsx = appTsx.replace(/bg-\[#3f4756\] border-transparent text-white hover:bg-\[#4a5363\]/g, 'bg-white/10 border-transparent text-white hover:bg-white/20');

// Tabs wrapper
appTsx = appTsx.replace(/<div className="flex items-end z-10 relative">/, '<div className="flex items-end z-10 relative bg-[#f0f3f5] pt-2 px-4 border-b border-[var(--border-color)]">');

// Tab filler remove (we have border-b on the wrapper now)
appTsx = appTsx.replace(/<div className="flex-1 border-b border-\[var\(--border-color\)\] relative top-\[1px\]"><\/div>/, '');

fs.writeFileSync(appTsxPath, appTsx, 'utf-8');


const headerTsxPath = 'C:\\hhgh\\SlabCutPlanner\\web-app\\src\\components\\ui\\HeaderToolbar.tsx';
let headerTsx = fs.readFileSync(headerTsxPath, 'utf-8');

// Inputs
headerTsx = headerTsx.replace(/bg-\[var\(--bg-input\)\] border border-\[var\(--border-color\)\] rounded-sm px-2 text-sm font-medium text-\[var\(--text-primary\)\] focus:outline-none focus:border-\[var\(--accent-color\)\]/g, 'bg-white/10 border border-transparent rounded-sm px-2 text-sm font-medium text-white placeholder:text-slate-400 focus:outline-none focus:border-white/30 focus:bg-white/20 transition-colors');

// Labels
headerTsx = headerTsx.replace(/text-\[11px\] text-slate-500 font-bold uppercase tracking-wider/g, 'text-[11px] text-slate-400 font-bold uppercase tracking-wider');

// Checkbox text
headerTsx = headerTsx.replace(/text-slate-600 ml-4/g, 'text-slate-300 ml-4');

// Language
headerTsx = headerTsx.replace(/bg-\[var\(--bg-panel\)\] border border-\[var\(--border-color\)\] rounded-sm px-2 relative ml-2/, 'bg-white/10 border border-transparent hover:bg-white/20 transition-colors rounded-sm px-2 relative ml-2');
headerTsx = headerTsx.replace(/text-\[var\(--text-primary\)\] focus:outline-none appearance-none pr-4 cursor-pointer/, 'text-white focus:outline-none appearance-none pr-4 cursor-pointer');

// Clear button
headerTsx = headerTsx.replace(/text-xs font-bold uppercase text-red-700 bg-red-50 hover:bg-red-100 border border-red-200/g, 'text-xs font-bold uppercase text-white bg-white/10 hover:bg-white/20 border border-transparent');


fs.writeFileSync(headerTsxPath, headerTsx, 'utf-8');
