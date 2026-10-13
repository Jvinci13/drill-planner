import Dexie, { type Table } from 'dexie';
import type { Drill, Session } from './types';

class DrillDB extends Dexie {
  drills!: Table<Drill, string>;
  sessions!: Table<Session, string>;

  constructor() {
    super('drill-planner');
    this.version(1).stores({
      drills: 'id, title, category, updatedAt, *tags',
      sessions: 'id, title, date, updatedAt',
    });
  }
}

export const db = new DrillDB();

// Ask the browser not to evict the library under storage pressure.
navigator.storage?.persist?.().catch(() => {});

interface Backup {
  app: 'drill-planner';
  version: 1;
  exportedAt: string;
  drills: Drill[];
  sessions: Session[];
}

export async function exportBackup(): Promise<Blob> {
  const backup: Backup = {
    app: 'drill-planner',
    version: 1,
    exportedAt: new Date().toISOString(),
    drills: await db.drills.toArray(),
    sessions: await db.sessions.toArray(),
  };
  return new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
}

/** Merges a backup into the library; items with the same id are overwritten. */
export async function importBackup(file: File) {
  const data = JSON.parse(await file.text()) as Partial<Backup>;
  if (data.app !== 'drill-planner' || !Array.isArray(data.drills)) {
    throw new Error('This file is not a Drill Planner backup.');
  }
  await db.transaction('rw', db.drills, db.sessions, async () => {
    await db.drills.bulkPut(data.drills!);
    if (Array.isArray(data.sessions)) await db.sessions.bulkPut(data.sessions);
  });
  return { drills: data.drills.length, sessions: data.sessions?.length ?? 0 };
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
