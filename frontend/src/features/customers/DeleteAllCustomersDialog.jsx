import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { api } from '../../api';
import { FormModal, InfoNote } from '../../components/ui/Atelier';
import { plural } from './customerFormHelpers';

/** Deleting every customer at once. */

/** Delete every customer at once -- the Owner's. The server keeps anyone with
 *  orders or alterations (their invoices and payments would go with them), so
 *  the answer says how many went and how many stayed. Typed confirmation, so
 *  a slip of the mouse cannot empty the book. */
export function DeleteAllCustomersDialog({ total, onClose, onDeleted }) {
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const ready = typed.trim().toUpperCase() === 'DELETE ALL';

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const done = await api.deleteAllCustomers();
      setResult(done);
      await onDeleted?.(done);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <FormModal icon={Trash2} tone="rose" onClose={busy ? undefined : onClose}
      title={result ? 'Customers deleted' : 'Delete all customers?'}
      subtitle={result
        ? `${plural(result.deleted, 'customer')} deleted.${result.kept ? ` ${plural(result.kept, 'customer')} with orders or alterations ${result.kept === 1 ? 'was' : 'were'} kept.` : ''}`
        : `Your book has ${plural(total, 'customer')}. Every one without an order is deleted, with their measurements, appointments and saved designs. This cannot be undone.`}
      footer={result ? (
        <button type="button" className="btn-primary" onClick={onClose}>Done</button>
      ) : (
        <>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className="btn-secondary at-btn-danger" onClick={run} disabled={!ready || busy}>
            <Trash2 size={16} /> {busy ? 'Deleting…' : 'Delete all customers'}
          </button>
        </>
      )}>
      {!result && (
        <>
          <InfoNote tone="amber" title="Customers with orders are kept">
            Anyone with an order or an alteration stays, because deleting them would also delete their invoices and payments.
          </InfoNote>
          <div className="form-group">
            <label className="form-label" htmlFor="delete-all-confirm">Type DELETE ALL to confirm</label>
            <input id="delete-all-confirm" className="form-control" value={typed} autoComplete="off" autoFocus
                   onChange={(e) => setTyped(e.target.value)} placeholder="DELETE ALL" disabled={busy} />
          </div>
          {error && <p className="form-error" role="alert" style={{ color: 'var(--danger, #b42318)', margin: 0 }}>{error}</p>}
        </>
      )}
    </FormModal>
  );
}
