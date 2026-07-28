import { useEffect, useState, useCallback } from 'react';
import { getRuns, getArchive, deleteArchive } from '../api';
import type { RunListItem } from '../api';
import './RunHistory.scss';

interface RunHistoryProps {
  /** The run is parented to an existing runId */
  onRunSelected: (runId: string) => void;
  refreshSignal?: number; // optional signal to trigger a refresh of the run history
}

/**
 * What's currently shown in the archive panel, if any, at most one run's
 * archive is displayed at a time, so a single object (rather than a map
 * keyed by runId) is enough.
 */
interface ViewedArchive {
  runId: string;
  data: unknown;
}

export function RunHistory({ onRunSelected, refreshSignal }: RunHistoryProps) {
  const [runs, setRuns] = useState<RunListItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [viewedArchive, setViewedArchive] = useState<ViewedArchive | null>(null);
  const [archiveError, setArchiveError] = useState<string | null>(null);

  const refreshRuns = useCallback(async () => {
    try {
      const latest = await getRuns();
      setRuns(latest);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load run history.');
    }
  }, []);

  useEffect(() => {
    refreshRuns();
  }, [refreshRuns, refreshSignal]); // refreshSignal is a dependency to trigger a refresh when it changes

  async function handleViewArchive(runId: string) {
    setArchiveError(null);
    try {
      const archive = await getArchive(runId);
      setViewedArchive({ runId, data: archive.data });
    } catch (err) {
      setArchiveError(err instanceof Error ? err.message : 'Could not load the archive.');
    }
  }

  async function handleDeleteArchive(runId: string) {
    setArchiveError(null);
    try {
      await deleteArchive(runId);
      // If the archive currently on screen is the one just deleted, clear
      // it. Otherwise a 404 from the (now-gone) archive would stay
      // displayed as if nothing happened.
      if (viewedArchive?.runId === runId) {
        setViewedArchive(null);
      }

      await refreshRuns();

    } catch (err) {
      setArchiveError(err instanceof Error ? err.message : 'Could not delete the archive.');
    }
  }

  return (
    <div className="run-history">
      {error && (
        <p className="run-history__error" role="alert">
          {error}
        </p>
      )}

      {runs.length === 0 ? (
        <p className="run-history__empty">No runs yet.</p>
      ) : (
        <ul className="run-history__list">
          {runs.map((run) => (
            <li key={run.id} className="run-history__list-item">
              <span className="run-history__seed">{run.seed}</span>
              <span className="run-history__status">{run.status}</span>

              {run.status === 'ACTIVE' && (
                <button
                  className="run-history__resume"
                  type="button"
                  onClick={() => onRunSelected(run.id)}
                >
                  Resume
                </button>
              )}

              {run.status === 'ENDED' && run.archive && (
                <>
                  <button
                    className="run-history__view-archive"
                    type="button"
                    onClick={() => handleViewArchive(run.id)}
                  >
                    View archive
                  </button>
                  <button
                    className="run-history__delete-archive"
                    type="button"
                    onClick={() => handleDeleteArchive(run.id)}
                  >
                    Delete archive
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {archiveError && (
        <p className="run-history__archive-error" role="alert">
          {archiveError}
        </p>
      )}

      {viewedArchive && (
        <pre className="run-history__archive-content">
          {JSON.stringify(viewedArchive.data, null, 2)}
        </pre>
      )}
    </div>
  );
}