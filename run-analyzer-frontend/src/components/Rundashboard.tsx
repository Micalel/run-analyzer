import type { Encounter, InventoryItem } from '../api';
import './Rundashboard.scss';

/**
 * 
 * Purely for show: receives already-fetched data and renders it.
 * No API calls, no state of its own. The parent (App) owns fetching and
 * refreshing, this component just displays whatever it's handed.
 * It's done to avoid having to many components fetching data and managing state (sounds like a political statement).
 * 
 */
interface RunDashboardProps {
  encounters: Encounter[];
  items: InventoryItem[];
}

export function RunDashboard({ encounters, items }: RunDashboardProps) {
  return (
    <div className="run-dashboard">
      <div className="run-dashboard__panel">
        <h3 className="run-dashboard__panel-title">Encounters seen</h3>
        {encounters.length === 0 ? (
          <p className="run-dashboard__empty">No encounters logged yet.</p>
        ) : (
          <ul className="run-dashboard__list">
            {encounters.map((encounter) => (
              <li key={encounter.id} className="run-dashboard__list-item">
                <span className="run-dashboard__species">{encounter.species}</span>
                {encounter.context && (
                  <span className="run-dashboard__context">({encounter.context})</span>
                )}
                {encounter.knownMoves.length > 0 && (
                  <span className="run-dashboard__moves">
                    {encounter.knownMoves.join(', ')}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="run-dashboard__panel">
        <h3 className="run-dashboard__panel-title">Items found</h3>
        {items.length === 0 ? (
          <p className="run-dashboard__empty">No items logged yet.</p>
        ) : (
          <ul className="run-dashboard__list">
            {items.map((item) => (
              <li key={item.id} className="run-dashboard__list-item">
                <span className="run-dashboard__item-name">{item.itemName}</span>
                <span className="run-dashboard__item-quantity">x{item.quantity}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}