import { autoPack } from '../engines/packing';
import type { DetailPart, PackingMode, Project, PackingResult } from '../domain/types';

export interface PackingWorkerRequest {
  requestId: number;
  project: Project;
  parts: DetailPart[];
  mode?: PackingMode;
}

export interface PackingWorkerResponse {
  requestId: number;
  result: PackingResult;
}

self.onmessage = (e: MessageEvent<PackingWorkerRequest>) => {
  const { requestId, project, parts, mode } = e.data;

  try {
    const result = autoPack(project, parts, mode);
    
    const response: PackingWorkerResponse = {
      requestId,
      result,
    };
    
    self.postMessage(response);
  } catch (error) {
    // We send back the error so the main thread can handle it
    // Using string serialization because Error objects might not clone perfectly across browsers
    self.postMessage({
      requestId,
      error: error instanceof Error ? error.message : String(error)
    });
  }
};
