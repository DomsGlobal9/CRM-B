import { createContext, useContext } from 'react';

/** What useAppStateValue() returns, for the views; AppStateProvider sets it. */
export const AppStateContext = createContext(null);

export function useAppState() {
  const state = useContext(AppStateContext);
  if (!state) throw new Error('useAppState() is used outside AppStateProvider.');
  return state;
}
