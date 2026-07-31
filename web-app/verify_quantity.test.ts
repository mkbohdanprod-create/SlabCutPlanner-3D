import { describe, it } from 'vitest';
import { flattenProductToDetails } from './src/store/projectHelpers';
import { explodeDetailsWrapped } from './src/store/projectHelpersLogic';
import { extractServices } from './src/engines/servicesExtractor';
import { DEFAULT_SERVICE_CATALOG } from './src/domain/defaults';

describe('Verify quantity calculation', () => {
  it('should prove derivedJoints count and final quantity', () => {
    const project = {
      products: [{
        id: 'prod_u',
        elements: [{
          id: 'prod_u/element:element_u',
          type: 'Стільниця',
          baseDefinition: { 
            type: 'Стільниця', 
            width: 3000, 
            height: 1000, 
            quantity: 2, 
            kind: 'u',
            jointOmegaDirection: 'vertical',
            jointLambdaDirection: 'vertical'
          },
          joints: [],
          additions: []
        }]
      }]
    };

    const details = flattenProductToDetails(project.products[0] as any);
    details[0].geometry = details[0].geometry || {};
    details[0].geometry.wholeDetail = false;
    details[0].geometry.innerCutSide = 'bottom';
    details[0].geometry.width = 3000;
    details[0].geometry.height = 1000;
    details[0].geometry.innerCutWidth = 1000;
    details[0].geometry.innerCutDepth = 500;
    details[0].geometry.innerCutOffset = 500;
    details[0].geometry.jointOmegaDirection = 'vertical';
    details[0].geometry.jointLambdaDirection = 'vertical';

    const { derivedJoints } = explodeDetailsWrapped(details);
    console.log('--- DERIVED JOINTS BEFORE DEDUPE ---');
    console.log(`Number of derived joints: ${derivedJoints.length}`);
    derivedJoints.forEach(j => {
      console.log(`- ID: ${j.id}, from: ${j.a.from}, to: ${j.a.to} (length: ${(j.a.to - j.a.from) / 1000}m)`);
    });

    const reqs = extractServices(project as any, DEFAULT_SERVICE_CATALOG, [], derivedJoints);
    const glues = reqs.filter(r => r.serviceCode === 'GLUING_STRAIGHT');

    console.log('\n--- EXTRACTED SERVICES AFTER DEDUPE ---');
    console.log(`GLUING_STRAIGHT rows: ${glues.length}`);
    glues.forEach(r => {
      console.log(`- Key: ${r.key}, Quantity: ${r.quantity}m (Expected: 1.0m (2 joints * 0.5m) * 2 (element qty) = 2.0m)`);
    });
  });
});
