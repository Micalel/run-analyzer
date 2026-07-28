import { useEffect, useState, useCallback } from 'react';
import { getRun } from './api';
import type { Run, RunDetail } from './api';
import { EncounterForm } from './components/Encounterforms';
import { ItemForm } from './components/Itemforms';
import { RunDashboard } from './components/Rundashboard';
import { StartRunForm } from './components/Startrunforms';
import { EndRunForm } from './components/Endrunforms';
import { RunHistory } from './components/RunHistory';
import './App.scss';

function App() {
  const [runId, setRunId] = useState<string | null>(null);
  const [run, setRun] = useState<RunDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [historyRefreshSignal, setHistoryRefreshSignal] = useState<number>(0);

  const refreshRun = useCallback(async (id: string) => {
    try {
      const latest = await getRun(id);
      setRun(latest);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the run.');
    }
  }, []);

  // Runs whenever runId changes: on the very first render (still null, so
  // the fetch is skipped) and again right after StartRunForm sets a real
  // id. refreshRun is a dependency too, but useCallback keeps it at the
  // same reference across renders, so it doesn't cause extra re-runs on
  // its own.
  useEffect(() => {
    if (runId) {
      refreshRun(runId);
    }
  }, [runId, refreshRun]);

  function handleRunCreated(newRun: Run) {
    setRunId(newRun.id);
    setHistoryRefreshSignal((n) => n + 1); // trigger a refresh of the run history
  }

  // Same effect as handleRunCreated (switch the active run), but starting
  // from just an id — used when resuming an existing run from RunHistory,
  // where there's no freshly created Run object, only the id of one
  // already in the list.
  function handleRunSelected(id: string) {
    setRunId(id);
  }

  function handleFormSuccess() {
    if (runId) {
      refreshRun(runId);
    }
  }

  function handleRunEnded() {
    handleFormSuccess();
    setHistoryRefreshSignal((n) => n + 1); // trigger a refresh of the run history
    }

  return (
    <main className="app">
      <h1 className="app__title">Run Analyzer</h1>

      {error && <p className="app__error">{error}</p>}

      <section className="app__section">
        <h2 className="app__section-title">Run history</h2>
        <RunHistory onRunSelected={handleRunSelected} refreshSignal={historyRefreshSignal} />
      </section>

      {(!runId || run?.status === 'ENDED') && (
        <section className="app__section">
          <h2 className="app__section-title">Start a run</h2>
          <StartRunForm onRunCreated={handleRunCreated} />
        </section>
      )}

      {runId && run && run.status === 'ACTIVE' && (
        <>
          <section className="app__section">
            <h2 className="app__section-title">Encounters</h2>
            <EncounterForm runId={runId} onSuccess={handleFormSuccess} />
          </section>

          <section className="app__section">
            <h2 className="app__section-title">Items</h2>
            <ItemForm runId={runId} onSuccess={handleFormSuccess} />
          </section>

          <section className="app__section">
            <h2 className="app__section-title">End this run</h2>
            <EndRunForm runId={runId} onSuccess={handleRunEnded} />
          </section>
        </>
      )}

      {runId && run && run.status === 'ENDED' && (
        <p className="app__run-ended">This run has ended.</p>
      )}

      {runId && run && (
        <section className="app__section">
          <h2 className="app__section-title">Live dashboard</h2>
          <RunDashboard
            encounters={run.encounters}
            items={run.inventoryItems}
          />
        </section>
      )}
    </main>
  );
}

export default App;