import { Project } from 'ts-morph';
import fs from 'fs';

const project = new Project();
project.addSourceFilesAtPaths("src/**/*.tsx");
const sourceFile = project.getSourceFileOrThrow("src/components/ui/FormsPanel.tsx");

const dxfFunctions = [
  'DxfPreviewShape',
  'DxfOverview'
];

const approvalFunctions = [
  'approvalItemPoints',
  'approvalItemHasExtractedGeometry',
  'approvalPreviewDebugDumpFromState',
  'approvalPreviewDebugSummary',
  'ApprovalItemCrop',
  'ApprovalOverview'
];

let dxfContent = '';
let approvalContent = '';

const processFunction = (fnName, group) => {
  const fnDecl = sourceFile.getFunction(fnName);
  if (fnDecl) {
    const fnText = fnDecl.getText();
    // Only export the main ones
    let modifiedText = fnText;
    if (fnName === 'DxfOverview' || fnName === 'ApprovalOverview') {
      modifiedText = modifiedText.replace(`function ${fnName}`, `export function ${fnName}`);
    }
    
    if (group === 'dxf') {
      dxfContent += modifiedText + '\n\n';
    } else {
      approvalContent += modifiedText + '\n\n';
    }
    
    fnDecl.remove();
    console.log(`Extracted ${fnName}`);
  }
};

for (const fn of dxfFunctions) processFunction(fn, 'dxf');
for (const fn of approvalFunctions) processFunction(fn, 'approval');

const importsDxf = `import React, { useRef, useEffect } from 'react';
import { Upload, X, ZoomIn, ZoomOut, Check } from 'lucide-react';
import type { DxfPreviewContour, DxfBlockDraft, DxfBindingSession, DxfModalResize, DxfPreviewDrag, DxfImportRole } from '../../../parsers/dxf';
import { dxfBounds, dxfSvgPath, dxfCanvasSize, dxfViewportForContours, dxfSelectionBounds, rotateDxfPreviewContour, parseDxfContours, inferDxfShape, inferDxfType, inferDxfRole, inferDxfEdgeProfile, inferDxfEdgeSide, inferDxfParentDetailId, inferDxfBindingPair, dxfBindingSides, dxfBindingAnchorPoint, detailMainDimensions } from '../../../parsers/dxf';
import type { DetailType } from '../../../domain/types';
import { TYPE_SINK } from '../utils/draftHelpers';
import { translateStaticUiText } from '../../../i18n';
// ... DXF_ROLE_LABELS? Let's check if DXF_ROLE_LABELS is needed.
const DXF_ROLE_LABELS: Record<DxfImportRole, string> = {
  detail: 'Деталь',
  thickening: 'Потовщення',
  fold: 'Підворот',
};
`;

const importsApproval = `import React from 'react';
import type { ApprovalImportItem, ApprovalImportPreview } from '../../../utils/approvalImport';
import type { DxfPoint } from '../../../parsers/dxf';
`;

fs.writeFileSync(`src/components/forms/import/DxfOverview.tsx`, importsDxf + '\n' + dxfContent);
fs.writeFileSync(`src/components/forms/import/ApprovalOverview.tsx`, importsApproval + '\n' + approvalContent);

sourceFile.saveSync();

let content = fs.readFileSync("src/components/ui/FormsPanel.tsx", "utf8");
// Remove DXF_ROLE_LABELS from FormsPanel since we copied it.
content = content.replace(/const DXF_ROLE_LABELS[\s\S]*?};\n/, '');

const importStatements = `import { DxfOverview } from '../forms/import/DxfOverview';\nimport { ApprovalOverview } from '../forms/import/ApprovalOverview';\n`;
const formsPanelStart = content.indexOf('export function FormsPanel()');
content = content.substring(0, formsPanelStart) + importStatements + content.substring(formsPanelStart);

fs.writeFileSync("src/components/ui/FormsPanel.tsx", content);
console.log('Step 4 extracted successfully with ts-morph!');
