import { Project } from 'ts-morph';
import fs from 'fs';

const project = new Project();
project.addSourceFilesAtPaths("src/**/*.tsx");
const sourceFile = project.getSourceFileOrThrow("src/components/2d/SlabBoard.tsx");

// 1. SelectionRect
const selRectFn = sourceFile.getFunction('SelectionRect');
if (selRectFn) {
  const text = selRectFn.getText().replace('function SelectionRect', 'export function SelectionRect');
  const imports = `import React from 'react';
import type { SelectionBox } from '../../../domain/types';

`;
  fs.writeFileSync('src/components/2d/board/SelectionRect.tsx', imports + text);
  selRectFn.remove();
  console.log('Extracted SelectionRect');
}

// 2. DragPreviews
const groupDragFn = sourceFile.getFunction('GroupDragPreview');
const ghostDragFn = sourceFile.getFunction('PlacementDragGhost');
if (groupDragFn && ghostDragFn) {
  const text1 = groupDragFn.getText().replace('function GroupDragPreview', 'export function GroupDragPreview');
  const text2 = ghostDragFn.getText().replace('function PlacementDragGhost', 'export function PlacementDragGhost');
  const imports = `import React from 'react';
import type { DetailPart, CanvasDrag } from '../../../domain/types';
import { placementPolygon, pointString, partColor } from '../../../engines/geometry';

`;
  fs.writeFileSync('src/components/2d/board/DragPreviews.tsx', imports + text1 + '\n\n' + text2);
  groupDragFn.remove();
  ghostDragFn.remove();
  console.log('Extracted DragPreviews');
}

// Add imports to SlabBoard.tsx
sourceFile.addImportDeclaration({
  namedImports: ['SelectionRect'],
  moduleSpecifier: './board/SelectionRect'
});
sourceFile.addImportDeclaration({
  namedImports: ['GroupDragPreview', 'PlacementDragGhost'],
  moduleSpecifier: './board/DragPreviews'
});

sourceFile.saveSync();
console.log('Step 3 complete');
