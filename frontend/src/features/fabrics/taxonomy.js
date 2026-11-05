import { useEffect, useState } from 'react';
import { api } from '../../api';

// "m" for cloth, "pcs" for anything counted; the ledger's own unit otherwise.
export const unitShort = (f) => (
  !f?.unit || f.unit === 'METER' ? 'm' : f.unit === 'PIECE' ? 'pcs' : String(f.unit).toLowerCase());

export const emptyClassification = () => ({ kind: '', variant: '', placements: [] });

/** `enabled`: wait until a screen that needs it is open; once fetched it is kept. */
export function useFabricTaxonomy(enabled = true) {
  const [taxonomy, setTaxonomy] = useState(null);
  const wanted = enabled && !taxonomy;
  useEffect(() => {
    if (!wanted) return undefined;
    let live = true;
    api.getInventoryTaxonomy()
      .then((data) => { if (live) setTaxonomy(data); })
      .catch(() => { if (live) setTaxonomy({ kinds: [], slots: [], garments: [] }); });
    return () => { live = false; };
  }, [wanted]);
  return taxonomy;
}

