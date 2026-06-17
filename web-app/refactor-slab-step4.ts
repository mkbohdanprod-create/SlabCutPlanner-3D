import { Project } from 'ts-morph';
import fs from 'fs';

const project = new Project();
project.addSourceFilesAtPaths("src/**/*.tsx");
const sourceFile = project.getSourceFileOrThrow("src/components/2d/SlabBoard.tsx");

const fns = ['ManualDimensions', 'SlabDimensionHints', 'SlabMagnifierWindow'];
let extracted = '';

for (const fn of fns) {
  const node = sourceFile.getFunction(fn);
  if (node) {
    extracted += node.getText().replace(`function ${fn}`, `export function ${fn}`) + '\n\n';
    node.remove();
    console.log(`Extracted ${fn}`);
  }
}

const imports = `import React, { useState, useEffect, useRef, MouseEvent as ReactMouseEvent } from 'react';
import type { SlabInstance, Placement, DetailPart, ManualDimension, CanvasDrag, UiLanguage } from '../../../domain/types';
import { dimensionSegmentsForSlab, clampNumber, polygonCentroid, placementPolygon, pointString, defectPoints, pointsForPlacement } from '../../../engines/geometry';
import { t } from '../../../i18n';
import { SlabLayer } from './SlabLayer';
import { PartShape } from './PartShape';

`;

fs.writeFileSync('src/components/2d/board/BoardOverlays.tsx', imports + extracted);

// Add imports to SlabBoard.tsx
sourceFile.addImportDeclaration({
  namedImports: ['ManualDimensions', 'SlabDimensionHints', 'SlabMagnifierWindow'],
  moduleSpecifier: './board/BoardOverlays'
});

sourceFile.saveSync();
console.log('Step 4 complete');
