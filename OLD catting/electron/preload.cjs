const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('slabCutPlannerDesktop', {
  isDesktop: true,
  version: 'portable-electron'
});
