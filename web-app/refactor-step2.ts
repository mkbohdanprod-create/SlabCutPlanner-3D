import { Project } from 'ts-morph';
import fs from 'fs';

const project = new Project();
project.addSourceFilesAtPaths("src/**/*.tsx");
const sourceFile = project.getSourceFileOrThrow("src/components/ui/FormsPanel.tsx");

const functionsToExtract = [
  'RectangleDesigner',
  'CircleDesigner',
  'EllipseDesigner',
  'LDesigner',
  'UDesigner',
  'SinkDesigner'
];

const exportedFunctions = [];

for (const fnName of functionsToExtract) {
  const fnDecl = sourceFile.getFunction(fnName);
  if (fnDecl) {
    const fnText = fnDecl.getText().replace(`function ${fnName}`, `export function ${fnName}`);
    
    const fileContent = `import React from 'react';
import type { DetailDraft } from '../../../domain/types';
import type { UiLanguage } from '../../../store/useDictionaryStore';
import { SvgInput, SvgSide, SvgQuantity, SvgCheck, TemplateInput, TemplateSide, TemplateCheck, ArrowDefs } from './SvgComponents';
import type { ShapeKind } from '../utils/draftHelpers';

${fnText}
`;
    fs.writeFileSync(`src/components/forms/shapes/${fnName}.tsx`, fileContent);
    exportedFunctions.push(fnName);
    
    // Remove from source file
    fnDecl.remove();
    console.log(`Extracted ${fnName}`);
  }
}

// Save FormsPanel
sourceFile.saveSync();

// Add imports
let content = fs.readFileSync("src/components/ui/FormsPanel.tsx", "utf8");
const importStatements = exportedFunctions.map(fn => `import { ${fn} } from '../forms/shapes/${fn}';`).join('\n') + '\n';
const formsPanelStart = content.indexOf('export function FormsPanel()');
content = content.substring(0, formsPanelStart) + importStatements + content.substring(formsPanelStart);

fs.writeFileSync("src/components/ui/FormsPanel.tsx", content);
console.log('Step 2 extracted successfully with ts-morph!');
