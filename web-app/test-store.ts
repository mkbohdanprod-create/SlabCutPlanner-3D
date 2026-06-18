import { useProjectStore } from './src/store/useProjectStore';

const store = useProjectStore.getState();
console.log('Initial project viewMode (should be undefined as we removed it):', (store as any).viewMode);
console.log('Initial project:', store.project.slabs.length);

try {
  store.updateProjectHeader({ orderNumber: '123' });
  console.log('Updated orderNumber:', useProjectStore.getState().project.orderNumber);
  
  store.addSlab({
    id: 'test-slab',
    width: 1000,
    height: 1000,
    thickness: 20,
    minMargin: 5,
    material: 'Керамограніт',
    defects: [],
    textureTransform: { scale: 1, offsetX: 0, offsetY: 0, rotation: 0, opacity: 1 },
  });
  console.log('Added slab, total slabs:', useProjectStore.getState().project.slabs.length);

  console.log('SUCCESS');
} catch (e) {
  console.error('ERROR during mutation:', e);
}
