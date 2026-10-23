/* Customers matching what has been typed, asked of the server.

   The app used to download the whole customer book at sign-in and search it in
   the browser; a large boutique's book is megabytes. Pickers now ask
   /customers/lookup/ for a handful of matches instead. The request waits until
   typing pauses, and an answer is kept only for the question it answers, so the
   list never shows matches for something already erased. */
import { useEffect, useState } from 'react';
import { api } from '../../services/api';

const WAIT_MS = 250;

/** Matches for { q, mobile }; nothing is asked while `enabled` is false or both are empty. */
export function useCustomerLookup({ q = '', mobile = '', limit = 8, full = false, enabled = true } = {}) {
  const term = q.trim();
  const wanted = Boolean(enabled && (term || mobile));
  const key = wanted ? JSON.stringify([term, mobile, limit, full]) : '';
  const [answer, setAnswer] = useState({ key: '', results: [] });

  useEffect(() => {
    if (!key) return undefined;
    let current = true;
    const timer = setTimeout(() => {
      api.lookupCustomers({ q: term, mobile, limit, full })
        .then((rows) => { if (current) setAnswer({ key, results: rows || [] }); })
        .catch(() => { if (current) setAnswer({ key, results: [] }); });
    }, WAIT_MS);
    return () => { current = false; clearTimeout(timer); };
  }, [key, term, mobile, limit, full]);

  // While a newer question is out, the last answer stays on screen rather than
  // the list emptying on every key; `loading` says it is not yet for this text.
  return {
    results: wanted ? answer.results : [],
    loading: wanted && answer.key !== key,
  };
}

/** `value`, once it has stopped changing for `ms`: a search box's text, asked
 *  of the server when typing pauses rather than on every key. */
export function useDebouncedValue(value, ms = WAIT_MS) {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return settled;
}

const CUSTOMER_ID = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i;

/** One customer by id (a UUID), for a picker showing what is already chosen. */
export function useCustomerById(id) {
  const wanted = id && CUSTOMER_ID.test(String(id)) ? String(id) : '';
  const [answer, setAnswer] = useState({ id: '', row: null });
  useEffect(() => {
    if (!wanted) return undefined;
    let current = true;
    api.lookupCustomers({ ids: [wanted], limit: 1 })
      .then((rows) => { if (current) setAnswer({ id: wanted, row: (rows || [])[0] || null }); })
      .catch(() => { if (current) setAnswer({ id: wanted, row: null }); });
    return () => { current = false; };
  }, [wanted]);
  return wanted && answer.id === wanted ? answer.row : null;
}
