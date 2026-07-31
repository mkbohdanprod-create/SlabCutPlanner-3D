import { describe, it, expect } from 'vitest';
import { extractServices, dedupe, applyOverrides } from '../servicesExtractor';
import type { Project, ProductElement, ServiceRequirement, ServiceDefinition, ServiceOverride } from '../../domain/types';

const mockCatalog: Record<string, ServiceDefinition> = {
  MEASUREMENT: { id: 'MEASUREMENT', name: 'Measurement', unit: 'pcs', price: 100, category: 'base' },
  CUTOUT_HOLE: { id: 'CUTOUT_HOLE', name: 'Hole', unit: 'pcs', price: 50, category: 'processing' },
  GLUING_45: { id: 'GLUING_45', name: 'Glue 45', unit: 'm', price: 200, category: 'processing' },
  EDGE_POLISH: { id: 'EDGE_POLISH', name: 'Edge Polish', unit: 'm', price: 300, category: 'processing' }
};

describe('servicesExtractor', () => {
  it('should guarantee unique keys', () => {
    const reqs: ServiceRequirement[] = [
      { key: 'p1#EDGE_POLISH#edge:A', serviceCode: 'EDGE_POLISH', detailId: 'p1', targetRef: 'edge:A', quantity: 2, unit: 'm', origin: 'auto', stage: 'preliminary' },
      { key: 'p1#EDGE_POLISH#edge:A', serviceCode: 'EDGE_POLISH', detailId: 'p1', targetRef: 'edge:A', quantity: 1, unit: 'm', origin: 'auto', stage: 'final' },
    ];
    const deduped = dedupe(reqs);
    expect(deduped).toHaveLength(1);
    expect(deduped[0].stage).toBe('final');
    expect(deduped[0].quantity).toBe(1);
  });

  it('should process glue pairs as a single entry', () => {
    // If element A and element B are glued, the key should be sorted slotA~slotB
    const project: any = {
      products: [{
        id: 'prod1',
        elements: [{
          id: 'prod1/element:main',
          baseDefinition: { type: 'Стільниця', width: 1000, height: 600 },
          joints: [{ id: 'j1', a: { elementPath: 'main', from: 0, to: 1000 }, b: { elementPath: 'skirting_A', from: 0, to: 1000 }, type: 'miter45' }]
        }]
      }]
    };
    const reqs = extractServices(project, mockCatalog);
    const glues = reqs.filter(r => r.serviceCode === 'GLUING_45');
    expect(glues).toHaveLength(1);
    expect(glues[0].key).toContain('main~skirting_A');
    expect(glues[0].quantity).toBe(1); // 1000mm = 1m
  });

  it('should handle custom services (manual overrides: add and adjust)', () => {
    const reqs: ServiceRequirement[] = [
      { key: 'p1#EDGE_POLISH#edge:A', serviceCode: 'EDGE_POLISH', detailId: 'p1', targetRef: 'edge:A', quantity: 1, unit: 'm', origin: 'auto', stage: 'final' },
    ];
    const overrides: ServiceOverride[] = [
      { key: 'p1#EDGE_POLISH#edge:A', action: 'adjust', quantity: 5 },
      { key: 'p1#MANUAL_CUT#custom', action: 'add', quantity: 2 }
    ];
    const result = applyOverrides(reqs, overrides);
    expect(result).toHaveLength(2);
    const adjusted = result.find(r => r.key === 'p1#EDGE_POLISH#edge:A');
    expect(adjusted?.quantity).toBe(5);
    expect(adjusted?.origin).toBe('manual');
    const added = result.find(r => r.key === 'p1#MANUAL_CUT#custom');
    expect(added?.quantity).toBe(2);
    expect(added?.origin).toBe('manual');
  });

  it('KNOWN LIMITATION: UI manual customServices duplicate auto-services due to targetRef mismatch', () => {
    const project: any = {
      products: [{
        id: 'prod1',
        elements: [{
          id: 'element1',
          baseDefinition: { 
            type: 'Стільниця', 
            width: 1000, 
            height: 600,
            edgeProfiles: { A: 'profile_1' },
            customServices: [
              { serviceId: 'EDGE_POLISH', quantity: 1 } // User manually added EDGE_POLISH via UI
            ] 
          }
        }]
      }],
      referenceData: {
        edgeProfiles: [{ id: 'profile_1', operations: [{ serviceId: 'EDGE_POLISH', multiplier: 1 }] }]
      }
    };

    const reqs = extractServices(project, mockCatalog);
    
    // We expect TWO entries for EDGE_POLISH because keys differ (edge:A_profile_1_top vs custom)
    const polishReqs = reqs.filter(r => r.serviceCode === 'EDGE_POLISH');
    expect(polishReqs).toHaveLength(2);
    
    const autoReq = polishReqs.find(r => r.key.includes('#edge:A'));
    const manualReq = polishReqs.find(r => r.key.includes('#custom'));
    
    expect(autoReq).toBeDefined();
    expect(manualReq).toBeDefined();
    
    // This highlights the bug: customServices currently cannot cleanly "adjust" an auto-service 
    // without the UI providing the specific targetRef (like edge:A_profile_1_top).
  });
});
