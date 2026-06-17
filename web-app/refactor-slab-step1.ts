import { Project } from 'ts-morph';
import fs from 'fs';

const project = new Project();
project.addSourceFilesAtPaths("src/**/*.tsx");
const sourceFile = project.getSourceFileOrThrow("src/components/2d/SlabBoard.tsx");

// 1. SlabLayer
const slabLayerFn = sourceFile.getFunction('SlabLayer');
if (slabLayerFn) {
  const text = slabLayerFn.getText().replace('function SlabLayer', 'export function SlabLayer');
  const imports = `import React from 'react';
import type { SlabInstance } from '../../../domain/types';

`;
  fs.writeFileSync('src/components/2d/board/SlabLayer.tsx', imports + text);
  slabLayerFn.remove();
  console.log('Extracted SlabLayer');
}

// 2. PartShape
const partShapeFn = sourceFile.getFunction('PartShape');
if (partShapeFn) {
  const text = partShapeFn.getText().replace('function PartShape', 'export function PartShape');
  const imports = `import React from 'react';
import type { DetailPart, Placement } from '../../../domain/types';
import { placementPolygon, pointString, partColor } from '../../../engines/geometry';
import { dxfCanvasSize, dxfSvgPath } from '../../../parsers/dxf';

`;
  fs.writeFileSync('src/components/2d/board/PartShape.tsx', imports + text);
  partShapeFn.remove();
  console.log('Extracted PartShape');
}

// Add imports to SlabBoard.tsx
sourceFile.addImportDeclaration({
  namedImports: ['SlabLayer'],
  moduleSpecifier: './board/SlabLayer'
});
sourceFile.addImportDeclaration({
  namedImports: ['PartShape'],
  moduleSpecifier: './board/PartShape'
});

sourceFile.saveSync();
console.log('Step 1 complete');
