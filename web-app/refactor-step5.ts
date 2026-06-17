import { Project } from 'ts-morph';
import fs from 'fs';

const project = new Project();
project.addSourceFilesAtPaths("src/**/*.tsx");
const sourceFile = project.getSourceFileOrThrow("src/components/ui/FormsPanel.tsx");

const functionsToExtract = [
  'DimInput',
  'QuantityInput',
  'ShapeIcon',
  'Field'
];

let sharedContent = '';

for (const fnName of functionsToExtract) {
  const fnDecl = sourceFile.getFunction(fnName);
  if (fnDecl) {
    const fnText = fnDecl.getText().replace(`function ${fnName}`, `export function ${fnName}`);
    sharedContent += fnText + '\n\n';
    fnDecl.remove();
    console.log(`Extracted ${fnName}`);
  }
}

const importsCommon = `import React, { ReactNode } from 'react';
import type { ShapeKind } from './draftHelpers';
`;

fs.writeFileSync(`src/components/forms/utils/sharedInputs.tsx`, importsCommon + '\n' + sharedContent);

sourceFile.saveSync();

let content = fs.readFileSync("src/components/ui/FormsPanel.tsx", "utf8");
const importStatements = `import { DimInput, QuantityInput, ShapeIcon, Field } from '../forms/utils/sharedInputs';\n`;
const formsPanelStart = content.indexOf('export function FormsPanel()');
content = content.substring(0, formsPanelStart) + importStatements + content.substring(formsPanelStart);
fs.writeFileSync("src/components/ui/FormsPanel.tsx", content);

// Add import to FeatureDesigner
let featureContent = fs.readFileSync("src/components/forms/editors/FeatureDesigner.tsx", "utf8");
featureContent = featureContent.replace("import { allSides", "import { Field } from '../utils/sharedInputs';\nimport { allSides");
fs.writeFileSync("src/components/forms/editors/FeatureDesigner.tsx", featureContent);

console.log('Shared inputs extracted successfully!');
