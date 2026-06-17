import { Project } from 'ts-morph';
import fs from 'fs';

const project = new Project();
project.addSourceFilesAtPaths("src/**/*.tsx");
const sourceFile = project.getSourceFileOrThrow("src/components/2d/SlabBoard.tsx");

// 1. PlacementStateBadges
const badgesFn = sourceFile.getFunction('PlacementStateBadges');
if (badgesFn) {
  const text = badgesFn.getText().replace('function PlacementStateBadges', 'export function PlacementStateBadges');
  const imports = `import React from 'react';
import type { Placement } from '../../../domain/types';

`;
  fs.writeFileSync('src/components/2d/board/PlacementStateBadges.tsx', imports + text);
  badgesFn.remove();
  console.log('Extracted PlacementStateBadges');
}

// 2. EdgeProfileMarks
const edgeMarksFn = sourceFile.getFunction('EdgeProfileMarks');
if (edgeMarksFn) {
  const text = edgeMarksFn.getText().replace('function EdgeProfileMarks', 'export function EdgeProfileMarks');
  const imports = `import React from 'react';
import type { DetailPart, Placement, EdgeProfileSelection } from '../../../domain/types';
import { edgeMarkersForPart, edgeProfileShortLabel } from '../../../utils/edgeProfiles';

`;
  fs.writeFileSync('src/components/2d/board/EdgeProfileMarks.tsx', imports + text);
  edgeMarksFn.remove();
  console.log('Extracted EdgeProfileMarks');
}

// Add imports to SlabBoard.tsx
sourceFile.addImportDeclaration({
  namedImports: ['PlacementStateBadges'],
  moduleSpecifier: './board/PlacementStateBadges'
});
sourceFile.addImportDeclaration({
  namedImports: ['EdgeProfileMarks'],
  moduleSpecifier: './board/EdgeProfileMarks'
});

sourceFile.saveSync();
console.log('Step 2 complete');
