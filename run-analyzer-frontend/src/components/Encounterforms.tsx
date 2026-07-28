import { useState } from 'react';
import { addEncounter } from '../api'
import type { EncounterContext } from '../api';
import './Encounterforms.scss';

/**
 * Props this component needs from its parent (the active-run page). Only
 * `runId` for now, the parent owns which run is currently being tracked,
 * this component just needs to know which one to report to.
 */

interface EncounterFormProps {
  runId: string;
  onSuccess?: () => void; // Optional callback to notify the parent that a new encounter was successfully added.
}

/** The four context options, plus an empty one since context is optional. */
const CONTEXT_OPTIONS: { value: EncounterContext | ''; label: string }[] = [
  { value: '', label: '(unknown)' },
  { value: 'WILD', label: 'Wild' },
  { value: 'TRAINER', label: 'Trainer' },
  { value: 'STATIC', label: 'Static' },
  { value: 'TRADE', label: 'Trade' },
];

export function EncounterForm({ runId, onSuccess }: EncounterFormProps) {
  const [species, setSpecies] = useState('');
  const [move, setMove] = useState('');
  const [context, setContext] = useState<EncounterContext | ''>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    if (species.trim() === '') {
      setError('Species is required.');
      return;
    }

    setIsSubmitting(true); // Disable the form while the request is in-flight.
    setError(null); // Clear any previous error message.

    try {
      await addEncounter(
        runId,
        species.trim(),
        move.trim() === '' ? undefined : move.trim(),
        context === '' ? undefined : context,
      );
      setSpecies('');
      setMove('');
      // context is left as-is on purpose: convenient when logging several
      // encounters in a row from the same context (e.g. a whole route of
      // wild grass encounters).
      onSuccess?.(); // Notify the parent that a new encounter was successfully added.
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setIsSubmitting(false); // Re-enable the form after the request is done, whether it succeeded or failed.
    }
  }

  return (
    <form className='encounter-form' onSubmit={handleSubmit}>
      <div className='encounter-form__field'>
        <label className='encounter-form__label' htmlFor="species"> Species </label>
        <input className='encounter-form__input'
          id="species"
          type="text"
          value={species}
          onChange={(event) => setSpecies(event.target.value)}
          disabled={isSubmitting}
        />
      </div>

      <div className='encounter-form__field'>
        <label className='encounter-form__label' htmlFor="move"> Move (optional) </label>
        <input className='encounter-form__input'
          id="move"
          type="text"
          value={move}
          onChange={(event) => setMove(event.target.value)}
          disabled={isSubmitting}
        />
      </div>

      <div className='encounter-form__field'>
        <label className='encounter-form__label' htmlFor="context"> Context (optional) </label>
        <select className='encounter-form__select'
          id="context"
          value={context}
          onChange={(event) => setContext(event.target.value as EncounterContext | '')}
          disabled={isSubmitting}
        >
          {CONTEXT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {error && 
      <p className='encounter-form__error' role="alert">{error}</p>
      }

      <button className='encounter-form__submit' type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Adding…' : 'Add encounter'}
      </button>
    </form>
  );
}