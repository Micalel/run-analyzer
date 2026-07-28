import { useState } from 'react';
import { addItem } from '../api';
import './Itemforms.scss';
/**
 * Props this component needs from its parent (the active-run page). Only
 * `runId` for now — same reasoning as EncounterForm.
 */
interface ItemFormProps {
  runId: string;
  onSuccess?: () => void; // Optional callback to notify the parent that a new item was successfully added.
}

export function ItemForm({ runId, onSuccess }: ItemFormProps) {
  const [itemName, setItemName] = useState('');
  const [quantity, setQuantity] = useState('1'); // Items are usually at least 1, so that will be the default value in the form.
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault(); // Never took care to explain this before, but the default behavior of a 
                            // form submission is to reload the page, which we don't want in a React app.

    if (itemName.trim() === '') {
      setError('Item name is required.');
      return;
    }

    // The <input type="number"> below always gives us a string, even
    // though it only accepts digits — Number(...) converts it back to an
    // actual number so it matches addItem's `quantity?: number` parameter.
    const parsedQuantity = Number(quantity);

    setIsSubmitting(true);
    setError(null);

    try {
      await addItem(
        runId,
        itemName.trim(),
        // This can feel a bit overkill, but it ensures that we only get positive numbers. If the user manages to send something else 
        // (negative number, zero, NaN, Infinity, etc.) 
        // then we just send `undefined` to the API and let it handle it.
        // The third part is here because undefined is deleted from the JSON object, a contrario to null.
        Number.isFinite(parsedQuantity) && parsedQuantity > 0 ? parsedQuantity : undefined, 
      );
      setItemName('');
      setQuantity('1');
      onSuccess?.(); // Notify the parent that a new item was successfully added.
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="item-form" onSubmit={handleSubmit}>
      <div className="item-form__field">
        <label className="item-form__label" htmlFor="itemName">
          Item
        </label>
        <input
          className="item-form__input"
          id="itemName"
          type="text"
          value={itemName}
          onChange={(event) => setItemName(event.target.value)}
          disabled={isSubmitting}
        />
      </div>

      <div className="item-form__field">
        <label className="item-form__label" htmlFor="quantity">
          Quantity
        </label>
        <input
          className="item-form__input"
          id="quantity"
          type="number"
          min="1"
          value={quantity}
          onChange={(event) => setQuantity(event.target.value)}
          disabled={isSubmitting}
        />
      </div>

      {error && (
        <p className="item-form__error" role="alert">
          {error}
        </p>
      )}

      <button className="item-form__submit" type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Adding…' : 'Add item'}
      </button>
    </form>
  );
}