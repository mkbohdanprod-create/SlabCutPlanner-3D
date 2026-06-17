import fs from 'fs';

const panelPath = 'src/components/ui/FormsPanel.tsx';
let content = fs.readFileSync(panelPath, 'utf8');

function extractFunction(source, fnName) {
  const startStr = `function ${fnName}(`;
  const startIndex = source.indexOf(startStr);
  if (startIndex === -1) return null;

  let braceCount = 0;
  let inFunction = false;
  let endIndex = -1;

  for (let i = startIndex; i < source.length; i++) {
    if (source[i] === '{') {
      braceCount++;
      inFunction = true;
    } else if (source[i] === '}') {
      braceCount--;
      if (inFunction && braceCount === 0) {
        endIndex = i;
        break;
      }
    }
  }

  if (endIndex === -1) return null;
  
  const fnContent = source.substring(startIndex, endIndex + 1);
  return { fnContent, startIndex, endIndex };
}

const functionsToExtract = [
  'RectangleDesigner',
  'CircleDesigner',
  'EllipseDesigner',
  'LDesigner',
  'UDesigner',
  'SinkDesigner'
];

let newContent = content;
const exportedFunctions = [];

for (const fnName of functionsToExtract) {
  const result = extractFunction(newContent, fnName);
  if (result) {
    let fnText = result.fnContent;
    newContent = newContent.substring(0, result.startIndex) + newContent.substring(result.endIndex + 1);
    
    fnText = fnText.replace(`function ${fnName}`, `export function ${fnName}`);
    
    const fileContent = `import React from 'react';
import type { DetailDraft } from '../../../domain/types';
import type { UiLanguage } from '../../../store/useDictionaryStore';
import { SvgInput, SvgSide, SvgQuantity, SvgCheck, TemplateInput, TemplateSide, TemplateCheck, ArrowDefs } from './SvgComponents';
import type { ShapeKind } from '../utils/draftHelpers';

${fnText}
`;
    fs.writeFileSync(`src/components/forms/shapes/${fnName}.tsx`, fileContent);
    exportedFunctions.push(fnName);
    console.log(`Extracted ${fnName}`);
  }
}

const importStatements = exportedFunctions.map(fn => `import { ${fn} } from '../forms/shapes/${fn}';`).join('\n') + '\n';

const formsPanelStart = newContent.indexOf('export function FormsPanel()');
newContent = newContent.substring(0, formsPanelStart) + importStatements + newContent.substring(formsPanelStart);

fs.writeFileSync(panelPath, newContent);
console.log('Step 2 extracted successfully!');
