import { AppContext } from '../context/AppContext';
import AppStateProvider from './state/AppStateProvider';
import { useAppState } from './state/appState';
import CrashScreen from './views/CrashScreen';
import StartupLoader from './views/StartupLoader';
import StaffSetupOverlays from './views/StaffSetupOverlays';
import SignInViews from './views/SignInViews';
import WorkspaceView from './views/WorkspaceView';
import OrderFlowViews from './views/OrderFlowViews';
import Overlays from './views/Overlays';

/**
 * The app's root: the state for everything (AppStateProvider), then what is on
 * screen -- a crash report or the first load's spinner when one applies,
 * otherwise each part of the app in turn. Each part shows itself only when it
 * applies (the page, the view, a popup that is open).
 */
export default function App() {
  return (
    <AppStateProvider>
      <AppScreens />
    </AppStateProvider>
  );
}

function AppScreens() {
  const { globalError, loading, dashboardData, portalSlug, portalLookupDone, currentUser, view, appContext } = useAppState();
  if (globalError) return <CrashScreen error={globalError} />;
  // Before the sign-in screen: the saved session, or which boutique this address is.
  if (((loading && !dashboardData) || (portalSlug && !portalLookupDone && !currentUser))
      && (view === 'login' || view === 'signup')) {
    return <StartupLoader />;
  }

  return (
    <AppContext.Provider value={appContext}>
      <div className="app-container">
        <StaffSetupOverlays />
        <SignInViews />
        <WorkspaceView />
        <OrderFlowViews />
        <Overlays />
      </div>
    </AppContext.Provider>
  );
}
