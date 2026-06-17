import fs from 'fs';

const panelPath = 'src/components/ui/FormsPanel.tsx';
let content = fs.readFileSync(panelPath, 'utf8');
const lines = content.split('\n');

// draft helpers: lines 26 to 184 -> array index 25 to 183
const draftHelpersLines = lines.slice(25, 184);

// Svg components: lines 2272 to 2362 -> array index 2271 to 2361
const svgLines = lines.slice(2271, 2362);

const draftHelpersContent = `import { referenceData } from '../../../domain/defaults';
import type { Detail, DetailShape, DetailType, EdgeFeature, EdgeProfileSelection, Point } from '../../../domain/types';

${draftHelpersLines.join('\n').replace(/^type /gm, 'export type ').replace(/^const /gm, 'export const ').replace(/^function /gm, 'export function ')}
`;
fs.writeFileSync('src/components/forms/utils/draftHelpers.ts', draftHelpersContent);

const svgComponentsContent = `import React from 'react';
import { Target, Move } from 'lucide-react';

${svgLines.join('\n').replace(/^function /gm, 'export function ')}
`;
fs.writeFileSync('src/components/forms/shapes/SvgComponents.tsx', svgComponentsContent);

const newLines = [
  ...lines.slice(0, 25),
  `import { ShapeKind, CircleSizeMode, DetailDraft, detailTypes, TYPE_COUNTERTOP, TYPE_WALL_PANEL, TYPE_SINK, TYPE_SUPPORT, SHAPE_RECT, SHAPE_L, SHAPE_U, SHAPE_CIRCLE, SHAPE_ELLIPSE, baseDesigns, sinkDesigns, allSides, curveSides, feature, createDraft, defaultsForKind, cloneFeature, cloneEdgeProfiles, draftFromDetail } from '../utils/draftHelpers';`,
  ...lines.slice(184, 2271),
  `import { SvgInput, SvgSide, SvgQuantity, SvgCheck, TemplateInput, TemplateSide, TemplateCheck, ArrowDefs } from './SvgComponents';`,
  ...lines.slice(2362)
];

fs.writeFileSync(panelPath, newLines.join('\n'));
console.log('Step 1 extracted successfully!');
