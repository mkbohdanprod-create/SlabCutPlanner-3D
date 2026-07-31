const fs = require('fs');
let code = fs.readFileSync('src/engines/servicesExtractor.ts', 'utf8');

if (!code.includes('ProductElement')) {
  code = code.replace(
    "import type { Detail, Project, ServiceRequirement, ServiceKey } from '../domain/types';",
    "import type { Detail, Project, ServiceRequirement, ServiceKey, ServiceOverride, ProductElement, Product } from '../domain/types';"
  );
}

const assertNeverCode = `
function assertNever(x: never): never {
  throw new Error("Unexpected object: " + x);
}
`;
if (!code.includes('assertNever(')) {
  code = code.replace('export function dedupe', assertNeverCode + '\nexport function dedupe');
}

const applyOverridesCode = `
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
`;
if (!code.includes('export function applyOverrides')) {
  code = code.replace('export function extractServices', applyOverridesCode + '\nexport function extractServices');
}

fs.writeFileSync('src/engines/servicesExtractor.ts', code);
console.log("Done prep");
