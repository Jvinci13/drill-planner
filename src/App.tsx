import { useRef } from 'react';
import { downloadBlob, exportBackup, importBackup } from './db';
import { useRoute } from './router';
import { DrillEditorView } from './views/DrillEditorView';
import { LibraryView } from './views/LibraryView';
import { SessionEditorView } from './views/SessionEditorView';
import { SessionsView } from './views/SessionsView';

export function App() {
  const { route, nav } = useRoute();
  const fileRef = useRef<HTMLInputElement>(null);

  const backup = async () => {
    downloadBlob(await exportBackup(), `drill-planner-backup-${new Date().toISOString().slice(0, 10)}.json`);
  };

  const restore = async (file: File) => {
    try {
      const r = await importBackup(file);
      alert(`Restored ${r.drills} drills and ${r.sessions} sessions.`);
    } catch (e) {
      alert((e as Error).message);
    }
  };

  const section = route.name === 'sessions' || route.name === 'session' ? 'sessions' : 'library';

  return (
    <div className="app">
      <header className="topbar">
        <a className="brand" href="#/">
          <svg viewBox="0 0 32 32" width={26} height={26} aria-hidden>
            <rect width="32" height="32" rx="7" fill="#2f7d3b" />
            <rect x="5" y="7" width="22" height="18" rx="1" fill="none" stroke="#fff" strokeWidth="1.6" />
            <line x1="16" y1="7" x2="16" y2="25" stroke="#fff" strokeWidth="1.6" />
            <circle cx="16" cy="16" r="3.6" fill="none" stroke="#fff" strokeWidth="1.6" />
          </svg>
          Drill Planner
        </a>
        <nav>
          <a className={section === 'library' ? 'on' : ''} href="#/">
            Drill library
          </a>
          <a className={section === 'sessions' ? 'on' : ''} href="#/sessions">
            Sessions
          </a>
        </nav>
        <div className="topbar-actions">
          <button className="btn ghost sm" onClick={backup} title="Download all drills and sessions as a JSON file">
            Back up
          </button>
          <button className="btn ghost sm" onClick={() => fileRef.current?.click()} title="Load drills and sessions from a backup file">
            Restore
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) restore(f);
              e.target.value = '';
            }}
          />
        </div>
      </header>
      <main>
        {route.name === 'library' && <LibraryView />}
        {route.name === 'drill' && <DrillEditorView key={nav} id={route.id} />}
        {route.name === 'sessions' && <SessionsView />}
        {route.name === 'session' && <SessionEditorView key={nav} id={route.id} />}
      </main>
    </div>
  );
}
