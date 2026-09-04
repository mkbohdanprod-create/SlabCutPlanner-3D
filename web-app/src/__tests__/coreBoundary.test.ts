// =====================================================================
//  МЕЖА ЯДРА (03.09.2026, рішення власника: «одне ядро — різні
//  програми»; Конструктор перший, Архітектура паралельно).
//
//  Ядро — engines/ + domain/ + core/ — знає камінь і НЕ знає, хто його
//  показує. Тому воно не імпортує ні екранів, ні стору, ні React. Аудит
//  03.09 знайшов рівно один місток (shapeBuilder → draftHelpers, тип);
//  його прибрано, а цей тест не дає з'явитись наступному: дочки
//  (vs3d / constructor / architecture) спираються на одне ядро, і будь-
//  який імпорт UI звідси — це початок «двох правд».
//
//  Правило свідомо тримається тестом, а не домовленістю: домовленості
//  не переживають місяць, тест — переживає.
// =====================================================================

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC = path.resolve(__dirname, '..');
const CORE_DIRS = ['engines', 'domain', 'core'];

/** Що ядру заборонено: екрани, стор, реакт, застосунок. */
const FORBIDDEN = [
  /from\s+['"](\.\.\/)+components\//,
  /from\s+['"](\.\.\/)+store\//,
  /from\s+['"](\.\.\/)+hooks\//,
  /from\s+['"](\.\.\/)+shell\//,
  /from\s+['"](\.\.\/)+workspaces\//,
  /from\s+['"](\.\.\/)+App['"]/,
  /from\s+['"]react['"]/,
  /from\s+['"]react-dom/,
  /from\s+['"]zustand/,
  /from\s+['"]@react-three/,
];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === '__gen__') continue;
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.(test|spec)\.tsx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

describe('межа ядра', () => {
  const files = CORE_DIRS.flatMap((dir) => walk(path.join(SRC, dir)));

  it('ядро існує і не порожнє', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it('engines/, domain/, core/ не імпортують екранів, стору і React', () => {
    const violations: string[] = [];
    for (const file of files) {
      const text = fs.readFileSync(file, 'utf8');
      const lines = text.split('\n');
      lines.forEach((line, index) => {
        if (!/^\s*import\b/.test(line) && !/^\s*}\s*from\b/.test(line)) return;
        for (const rule of FORBIDDEN) {
          if (rule.test(line)) violations.push(`${path.relative(SRC, file)}:${index + 1}  ${line.trim()}`);
        }
      });
    }
    expect(violations, `Ядро тягне UI:\n${violations.join('\n')}`).toEqual([]);
  });
});
