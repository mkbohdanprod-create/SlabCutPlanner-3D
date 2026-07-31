import type { Project, ServiceRequirement, ServiceKey, ServiceOverride, ProductElement, Product } from '../domain/types';
import { type CalculatedService, DEFAULT_SERVICE_CATALOG, type ServiceDefinition } from '../domain/services';


function assertNever(x: never): never {
  throw new Error("Unexpected object: " + x);
}

export function dedupe(reqs: ServiceRequirement[]): ServiceRequirement[] {
  const byKey = new Map<ServiceKey, ServiceRequirement>();
  const rank = (r: ServiceRequirement) => (r.stage === 'final' ? 1 : 0);
  for (const r of reqs) {
    const prev = byKey.get(r.key);
    if (!prev || rank(r) > rank(prev)) byKey.set(r.key, r);
  }
  return [...byKey.values()];
}


export function applyOverrides(reqs: ServiceRequirement[], overrides: ServiceOverride[]): ServiceRequirement[] {
  const byKey = new Map<ServiceKey, ServiceRequirement>();
  reqs.forEach(r => byKey.set(r.key, r));

  overrides.forEach(o => {
    if (o.action === 'remove') {
      byKey.delete(o.key);
    } else if (o.action === 'adjust') {
      const existing = byKey.get(o.key);
      if (existing) {
        if (o.quantity !== undefined) existing.quantity = o.quantity;
        existing.origin = 'manual';
      }
    } else if (o.action === 'add') {
      const parts = o.key.split('#');
      byKey.set(o.key, {
        key: o.key,
        serviceCode: parts[1] || o.key,
        detailId: parts[0] || 'unknown',
        targetRef: parts[2] || 'custom',
        quantity: o.quantity || 1,
        unit: 'pcs',
        origin: 'manual',
        stage: 'final'
      });
    }
  });

  return [...byKey.values()];
}

export function extractServices(
  project: Project | undefined | null, 
  catalog: Record<string, ServiceDefinition> = DEFAULT_SERVICE_CATALOG,
  manualOverrides: ServiceOverride[] = [],
  derivedJoints: any[] = []
): ServiceRequirement[] {
  const reqs: ServiceRequirement[] = [];
  const localOverrides = [...manualOverrides];
  
  if (!project) return [];
  
  derivedJoints.forEach(j => {
    const len = Math.max(j.a.to - j.a.from, j.b.to - j.b.from) / 1000;
    reqs.push({
      key: `derived_joint_${j.id}`,
      serviceCode: 'Стяжка стику (з клеєм)',
      detailId: j.id,
      targetRef: 'joint',
      quantity: Math.ceil(len),
      unit: 'pcs',
      origin: 'auto',
      stage: 'final'
    });
  });
  
  const addReq = (def: ServiceDefinition, quantity: number, detailId: string = 'project', targetRef: string = 'whole', stage: 'preliminary' | 'final' = 'preliminary') => {
    if (quantity <= 0) return;
    const key = `${detailId}#${def.id}#${targetRef}`;
    reqs.push({
      key,
      serviceCode: def.id,
      detailId,
      targetRef,
      quantity,
      unit: def.unit as any,
      origin: 'auto',
      stage,
    });
  };

  // 1. Base Services
  if (catalog.MEASUREMENT) addReq(catalog.MEASUREMENT, 1);
  if (catalog.ENGINEERING) addReq(catalog.ENGINEERING, 1);
  
  let totalAreaSqM = 0;
  const processElement = (element: ProductElement) => {
    const def = element.baseDefinition;
    const w = (def.width || 0) / 1000;
    const h = (def.height || 0) / 1000;
    const area = w * h;
    if (area > 0) totalAreaSqM += area;

    // Corners
    if (def.corners) {
      Object.entries(def.corners).forEach(([cornerId, processing]) => {
        if (processing.type === 'radius' && catalog.CORNER_RADIUS) {
          addReq(catalog.CORNER_RADIUS, 1, element.id, `corner:${cornerId}`);
        } else if (processing.type === 'chamfer' && catalog.CORNER_CHAMFER) {
          addReq(catalog.CORNER_CHAMFER, 1, element.id, `corner:${cornerId}`);
        }
      });
    }

    // Cutouts
    if (def.cutouts) {
      Object.entries(def.cutouts).forEach(([cutoutId, cutout]) => {
        switch (cutout.type) {
          case 'socket':
          case 'faucet':
            if (catalog.CUTOUT_HOLE) addReq(catalog.CUTOUT_HOLE, 1, element.id, `cutout:${cutoutId}`);
            break;
          case 'custom':
            if (cutout.shape === 'circle') {
               if (catalog.CUTOUT_HOLE) addReq(catalog.CUTOUT_HOLE, 1, element.id, `cutout:${cutoutId}`);
            } else if (cutout.shape === 'rect') {
               if (cutout.edgeProcessing && cutout.edgeProcessing !== 'none') {
                 if (catalog.CUTOUT_CLEAN) addReq(catalog.CUTOUT_CLEAN, 1, element.id, `cutout:${cutoutId}`);
                 const cutoutPerimeterM = ((cutout.width || 500) * 2 + (cutout.height || 400) * 2) / 1000;
                 if (catalog.POLISH_INNER) addReq(catalog.POLISH_INNER, cutoutPerimeterM, element.id, `cutout:${cutoutId}_inner`);
               } else {
                 if (catalog.CUTOUT_ROUGH) addReq(catalog.CUTOUT_ROUGH, 1, element.id, `cutout:${cutoutId}`);
               }
            }
            break;
          default:
            assertNever(cutout.type);
        }
      });
    }

    // Edges (Preliminary from baseDefinition)
    if (def.edgeProfiles) {
      Object.entries(def.edgeProfiles).forEach(([side, profileRaw]) => {
        const profile = typeof profileRaw === 'string' ? profileRaw : undefined;
        if (!profile) return;
        
        let sideLengthM = 0;
        if (side === 'A' || side === 'C') sideLengthM = w;
        if (side === 'B' || side === 'D') sideLengthM = h;

        if (sideLengthM > 0) {
          const edgeProfileDef = project?.referenceData?.edgeProfiles?.find(p => p.id === profile);
          if (edgeProfileDef && edgeProfileDef.operations && edgeProfileDef.operations.length > 0) {
            edgeProfileDef.operations.forEach(op => {
              const serviceDef = catalog[op.serviceId];
              if (serviceDef) {
                // Notice stage is 'preliminary' by default from addReq.
                addReq(serviceDef, sideLengthM * op.multiplier, element.id, `edge:${side}_${profile}_top`);
              }
            });
          }
        }
      });
    }

    // Manual overrides from customServices (legacy extraction into localOverrides)
    if (def.customServices) {
      def.customServices.forEach((cs) => {
        // We push this into localOverrides so it's applied correctly later
        localOverrides.push({
          key: `${element.id}#${cs.serviceId}#custom`,
          action: 'add',
          quantity: cs.quantity
        });
      });
    }

    // Joints (Стики)
    if (element.joints) {
      element.joints.forEach(joint => {
        // Dedupe joint: a~b === b~a
        const slotA = joint.a.elementPath;
        const slotB = joint.b.elementPath;
        const pairKey = slotA.localeCompare(slotB) < 0 ? `${slotA}~${slotB}` : `${slotB}~${slotA}`;
        
        // Compute joint length dynamically from AnchorRef.from and .to
        // // TODO: b.to currently takes parent length, once fixed min() will be accurate
        const lenA = Math.abs((joint.a.to || 0) - (joint.a.from || 0)) / 1000;
        const lengthM = lenA > 0 ? lenA : 1.0; 

        if (joint.type === 'miter45') {
          if (catalog.CUT_45) addReq(catalog.CUT_45, lengthM * 2, pairKey, `joint:${joint.id}`, 'final');
          if (catalog.GLUING_45) addReq(catalog.GLUING_45, lengthM, pairKey, `joint:${joint.id}`, 'final');
        } else if (joint.type === 'glued') {
          if (catalog.GLUING_STRAIGHT) addReq(catalog.GLUING_STRAIGHT, lengthM, pairKey, `joint:${joint.id}`, 'final');
        }
      });
    }

    if (element.additions) {
      element.additions.forEach(add => processElement(add));
    }
  };

  if (project.products) {
    project.products.forEach(prod => {
      if (prod.elements) prod.elements.forEach(el => processElement(el));
    });
  }

  // ----------------------------------------------------
  // РОЗКРІЙ (Placements) - final edges
  // ----------------------------------------------------
  const placedDetailIds = new Set<string>();
  project.placements?.forEach(pl => {
    // Дуже приблизно визначаємо detailId з partId (часто partId = detailId + '-main' тощо)
    const detailIdMatch = pl.partId.split('-')[0];
    placedDetailIds.add(detailIdMatch);

    ['A', 'B', 'C', 'D'].forEach((side) => {
      const rawProfile = pl.edgeProfiles?.[side];
      if (!rawProfile) return;
      const treatment = (typeof rawProfile === 'string') 
        ? { isFullLength: true, top: { profileId: rawProfile } } 
        : rawProfile as any;
        
      if (treatment && (treatment.top?.profileId || treatment.bottom?.profileId)) {
        // We will just use 1.0 as a placeholder if we can't get actual length from baseDefinition easily here
        // Wait, we need actual sideLengthM from baseDefinition!
        // We can find the element from project.products by detailIdMatch.
        let sideLengthM = 0;
        let matchedElement: ProductElement | undefined;
        project.products?.forEach(p => p.elements.forEach(el => {
          const search = (e: ProductElement) => {
            if (e.id === detailIdMatch) matchedElement = e;
            e.additions?.forEach(search);
          };
          search(el);
        }));

        if (matchedElement) {
          const w = (matchedElement.baseDefinition.width || 0) / 1000;
          const h = (matchedElement.baseDefinition.height || 0) / 1000;
          if (side === 'A' || side === 'C') sideLengthM = w;
          if (side === 'B' || side === 'D') sideLengthM = h;
        }

        if (sideLengthM > 0) {
          let treatmentLengthM = sideLengthM;
          if (treatment.isFullLength === false && treatment.size) {
            treatmentLengthM = treatment.size / 1000;
          }

          if (treatment.manualFinish && catalog.MANUAL_FINISH) {
            addReq(catalog.MANUAL_FINISH, 1, detailIdMatch, `edge:${side}`, 'final');
          }

          let maxToolOutM = 0;
          let totalActualLengthM = 0;

          const processProfile = (pId: string | undefined, isTop: boolean) => {
            if (!pId) return;
            const edgeProfileDef = project?.referenceData?.edgeProfiles?.find(p => p.id === pId);
            if (edgeProfileDef && edgeProfileDef.operations && edgeProfileDef.operations.length > 0) {
              const allowance = edgeProfileDef.allowance || 0;
              let toolOutM = 30 / 1000; 
              if (project.projectMaterial === 'Акрил' || project.projectMaterial === 'Компакт-плита') {
                toolOutM = allowance / 1000; 
              }
              maxToolOutM = Math.max(maxToolOutM, toolOutM);
              
              const actualLengthM = Math.max(0, treatmentLengthM - toolOutM);
              totalActualLengthM = Math.max(totalActualLengthM, actualLengthM);

              edgeProfileDef.operations.forEach(op => {
                const serviceDef = catalog[op.serviceId];
                if (serviceDef) {
                  // This is a 'final' stage request, dedupe will prioritize it
                  addReq(serviceDef, actualLengthM * op.multiplier, detailIdMatch, `edge:${side}_${pId}_${isTop ? 'top' : 'bottom'}`, 'final');
                }
              });
            }
          };

          processProfile(treatment.top?.profileId, true);
          processProfile(treatment.bottom?.profileId, false);

          if (project.projectMaterial !== 'Акрил' && project.projectMaterial !== 'Компакт-плита' && catalog.CUT_STRAIGHT) {
            const baseCutM = sideLengthM - totalActualLengthM;
            if (baseCutM > 0) {
              addReq(catalog.CUT_STRAIGHT, baseCutM, detailIdMatch, `edge:${side}_base`, 'final');
            }
          }
        }
      }
    });
  });

  // Material & Installation
  if (project.projectMaterial) {
    let matService = catalog.MATERIAL_QUARTZ;
    if (project.projectMaterial === 'Керамограніт') matService = catalog.MATERIAL_CERAMIC;
    if (project.projectMaterial === 'Натуральний камінь') matService = catalog.MATERIAL_NATURAL;
    if (project.projectMaterial === 'Акрил') matService = catalog.MATERIAL_ACRYLIC;
    
    if (matService) {
      const materialWithWaste = totalAreaSqM * 1.2;
      addReq(matService, materialWithWaste);
    }
  }
  
  if (totalAreaSqM > 0 && catalog.INSTALLATION) {
    addReq(catalog.INSTALLATION, totalAreaSqM);
  }

  const deduped = dedupe(reqs);
  return applyOverrides(deduped, localOverrides);
}
export function calculateServices(
  reqs: ServiceRequirement[],
  catalog: Record<string, ServiceDefinition>
): CalculatedService[] {
  const services: CalculatedService[] = [];
  
  for (const req of reqs) {
    const def = catalog[req.serviceCode];
    if (!def) continue;

    const existing = services.find(s => s.serviceId === req.serviceCode);
    if (existing) {
      existing.quantity += req.quantity;
      existing.totalPrice = existing.quantity * existing.pricePerUnit;
      if (req.detailId && !existing.detailsRef?.includes(req.detailId)) {
        existing.detailsRef?.push(req.detailId);
      }
    } else {
      services.push({
        serviceId: def.id,
        name: def.name,
        unit: def.unit,
        quantity: req.quantity,
        pricePerUnit: def.price,
        totalPrice: req.quantity * def.price,
        category: def.category,
        detailsRef: req.detailId ? [req.detailId] : [],
        metadata: { origin: req.origin, stage: req.stage }
      });
    }
  }
  
  return services;
}