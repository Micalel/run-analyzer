import { useState } from 'react';
import { createRun } from '../api';
import type { Run } from '../api';
import './Startrunforms.scss';

interface StartRunFormProps {
  /**
   * Different shape from the other forms' `onSuccess`: the parent doesn't
   * have a runId yet at this point, this component is the one creating
   * it. So it has to hand the freshly created Run back up, rather than
   * just signaling something changed like EncounterForm/ItemForm do.
   */
  onRunCreated: (run: Run) => void;
}
export function StartRunForm({ onRunCreated }: StartRunFormProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    // event.target.files is a FileList (it supports multiple selection in
    // general), even though this input doesn't have the `multiple`
    // attribute, so there's at most one entry here, at index 0. It's
    // `null` if the user opened the picker and cancelled without
    // choosing anything.
    setSelectedFile(event.target.files?.[0] ?? null);
  }
 
  async function handleSubmit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
 
    if (!selectedFile) {
      setError('Choose a randomizer log file first.');
      return;
    }
 
    setIsSubmitting(true);
    setError(null);
 
    try {
      // File extends Blob, which has a .text() method: reads the file's
      // full content into a string, entirely in the browser, this never
      // touches the filesystem on the server side. That's the whole
      // point: the browser can't tell us this file's path, only its
      // content, so content is what gets sent.
      const logText = await selectedFile.text();
      const run = await createRun(logText);
      setSelectedFile(null);
      onRunCreated(run);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="start-run-form" onSubmit={handleSubmit}>
      <div className="start-run-form__field">
        <label className="start-run-form__label" htmlFor="filePath">
          Randomizer log file path
        </label>
        <input
          className="start-run-form__input"
          id="filePath"
          type="file"
          accept=".log,.txt"
          onChange={handleFileChange}
          disabled={isSubmitting}
        />
      </div>

      {error && (
        <p className="start-run-form__error" role="alert">
          {error}
        </p>
      )}

      <button className="start-run-form__submit" type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Starting…' : 'Start run'}
      </button>
    </form>
  );
}