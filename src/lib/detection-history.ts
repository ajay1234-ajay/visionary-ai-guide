// Detection history stored in localStorage
export interface DetectedObject {
  name: string;
  confidence: number;
  bbox: [number, number, number, number]; // [x, y, width, height]
}

export interface DetectionRecord {
  id: string;
  userId: string;
  imageDataUrl: string;
  objects: DetectedObject[];
  timestamp: string;
}

const HISTORY_KEY = 'aiguide_detection_history';

function getAll(): DetectionRecord[] {
  const data = localStorage.getItem(HISTORY_KEY);
  return data ? JSON.parse(data) : [];
}

function saveAll(records: DetectionRecord[]) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(records));
}

export function saveDetection(userId: string, imageDataUrl: string, objects: DetectedObject[]): DetectionRecord {
  const record: DetectionRecord = {
    id: crypto.randomUUID(),
    userId,
    imageDataUrl,
    objects,
    timestamp: new Date().toISOString(),
  };
  const all = getAll();
  all.unshift(record);
  // Keep last 50 records max to avoid localStorage limits
  saveAll(all.slice(0, 50));
  return record;
}

export function getUserHistory(userId: string): DetectionRecord[] {
  return getAll().filter(r => r.userId === userId);
}

export function deleteRecord(id: string) {
  const all = getAll().filter(r => r.id !== id);
  saveAll(all);
}
