import { Project } from 'ts-morph';
import fs from 'fs';

const project = new Project();
project.addSourceFilesAtPaths("src/**/*.tsx");
const sourceFile = project.getSourceFileOrThrow("src/components/ui/FormsPanel.tsx");

const functionsToExtract = [
  { name: 'FeatureDesigner', file: 'FeatureDesigner' },
  { name: 'EdgeProfileDesigner', file: 'EdgeProfileDesigner' },
  { name: 'EdgeProfileIcon', file: 'EdgeProfileDesigner' }, // Put icon in same file
];

const exportedFunctions = new Set();
let featureDesignerContent = '';
let edgeProfileDesignerContent = '';

for (const fn of functionsToExtract) {
  const fnDecl = sourceFile.getFunction(fn.name);
  if (fnDecl) {
    const fnText = fnDecl.getText().replace(`function ${fn.name}`, `export function ${fn.name}`);
    if (fn.file === 'FeatureDesigner') {
      featureDesignerContent += fnText + '\n\n';
    } else {
      edgeProfileDesignerContent += fnText + '\n\n';
    }
    exportedFunctions.add(fn.name);
    fnDecl.remove();
    console.log(`Extracted ${fn.name}`);
  }
}

const importsCommon = `import React, { ReactNode } from 'react';
import { Target, Maximize, Scissors, AlertCircle, Move } from 'lucide-react';
import type { DetailDraft, EdgeFeature, EdgeProfileType, EdgeProfileSelection, UiLanguage } from '../../../domain/types';
import { allSides, curveSides } from '../utils/draftHelpers';
import { EDGE_PROFILE_OPTIONS, DEFAULT_EDGE_PROFILE } from '../../../utils/edgeProfiles';
`;

fs.writeFileSync(`src/components/forms/editors/FeatureDesigner.tsx`, importsCommon + '\n' + featureDesignerContent);
fs.writeFileSync(`src/components/forms/editors/EdgeProfileDesigner.tsx`, importsCommon + '\n' + edgeProfileDesignerContent);

sourceFile.saveSync();

let content = fs.readFileSync("src/components/ui/FormsPanel.tsx", "utf8");
const importStatements = `import { FeatureDesigner } from '../forms/editors/FeatureDesigner';\nimport { EdgeProfileDesigner, EdgeProfileIcon } from '../forms/editors/EdgeProfileDesigner';\n`;
const formsPanelStart = content.indexOf('export function FormsPanel()');
content = content.substring(0, formsPanelStart) + importStatements + content.substring(formsPanelStart);

fs.writeFileSync("src/components/ui/FormsPanel.tsx", content);
console.log('Step 3 extracted successfully with ts-morph!');
