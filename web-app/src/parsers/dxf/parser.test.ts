import { describe, it } from 'vitest';
import fs from 'fs';
import { parseDxfContours } from './parser';

describe('DXF Parser Test', () => {
  it('should parse 0001_1.dxf and log contours', () => {
    const filePath = 'C:/hhgh/SlabCutPlanner/mstcs/0001_1.dxf';
    const text = fs.readFileSync(filePath, 'utf-8');
    const result = parseDxfContours(text);
    console.log('Total parsed contours:', result.contours.length);
    result.contours.forEach((contour, idx) => {
      console.log(`Contour ${idx + 1}:`, {
        name: contour.suggestedName,
        layer: contour.layer,
        width: contour.width,
        height: contour.height,
        holesCount: contour.holes.length,
        pointsCount: contour.points.length
      });
    });
  });
});
