import { AppStateContext } from './appState';
import useAppStateValue from './useAppStateValue';

/** Holds the app's state (useAppStateValue) for everything inside it. */
export default function AppStateProvider({ children }) {
  const state = useAppStateValue();
  return <AppStateContext.Provider value={state}>{children}</AppStateContext.Provider>;
}
