import { useState } from 'react';
import { endRun } from '../api';
import './Endrunforms.scss';

interface EndRunFormProps {
  runId: string;
  /** Same reasoning as EncounterForm/ItemForm's onSuccess: the parent
   * re-fetches the run itself rather than being told the new state directly. */
  onSuccess?: () => void;
}

export function EndRunForm({ runId, onSuccess }: EndRunFormProps) {
  const [causeOfEnd, setCauseOfEnd] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    setIsSubmitting(true);
    setError(null);

    try {
      await endRun(runId, causeOfEnd.trim() === '' ? undefined : causeOfEnd.trim());
      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="end-run-form" onSubmit={handleSubmit}>
      <div className="end-run-form__field">
        <label className="end-run-form__label" htmlFor="causeOfEnd">
          Cause of end (optional)
        </label>
        <input
          className="end-run-form__input"
          id="causeOfEnd"
          type="text"
          value={causeOfEnd}
          onChange={(event) => setCauseOfEnd(event.target.value)}
          disabled={isSubmitting}
        />
      </div>

      {error && (
        <p className="end-run-form__error" role="alert">
          {error}
        </p>
      )}

      <button className="end-run-form__submit" type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Ending…' : 'End run'}
      </button>
    </form>
  );
}