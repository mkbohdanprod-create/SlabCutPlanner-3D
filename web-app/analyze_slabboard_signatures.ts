import { Project } from 'ts-morph';
import fs from 'fs';

const project = new Project();
project.addSourceFilesAtPaths("src/**/*.tsx");
const sourceFile = project.getSourceFileOrThrow("src/components/2d/SlabBoard.tsx");

const fns = [
  'SlabMagnifierWindow', 'SelectionRect', 'PlacementStateBadges',
  'PartShape', 'EdgeProfileMarks', 'GroupDragPreview',
  'PlacementDragGhost', 'ManualDimensions', 'SlabDimensionHints', 'SlabLayer'
];

for (const fn of fns) {
  const fnDecl = sourceFile.getFunction(fn);
  if (fnDecl) {
    const params = fnDecl.getParameters().map(p => p.getText()).join(', ');
    console.log(`Function: ${fn}(${params})`);
  }
}
