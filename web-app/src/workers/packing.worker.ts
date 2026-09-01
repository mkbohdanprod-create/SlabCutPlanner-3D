import { autoPack } from '../engines/packing';
import type { DetailPart, PackingMode, Project, Placement } from '../domain/types';

export interface PackingResult {
  placements: Placement[];
  unplacedPartIds: string[];
  unplacedReasons: Record<string, string>;
}

export interface PackingWorkerRequest {
  requestId: number;
  project: Project;
  parts: DetailPart[];
  mode?: PackingMode;
  /** Крок 5.2: зберегти розміщення, зроблені руками (перерахунок після правки). */
  preserveManual?: boolean;
}

export interface PackingWorkerResponse {
  requestId: number;
  result: PackingResult;
}

self.onmessage = (e: MessageEvent<PackingWorkerRequest>) => {
  const { requestId, project, parts, mode, preserveManual } = e.data;

  try {
    const result = autoPack(project, parts, mode, preserveManual);
    
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
