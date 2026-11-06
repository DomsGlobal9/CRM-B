import { SetupPasswordStep } from '../../features/staff/StaffFirstSetup';
import ProductTour from '../../features/tour/ProductTour';
import { useAppState } from '../state/appState';

/**
 * Over the workspace on a new staff member's first sign-in: the set-your-password
 * step, and a Getting started item's hands-on guide while it runs.
 */
export default function StaffSetupOverlays() {
  const { currentUser, setCurrentUser, setMobileNavOpen, setTaskGuide, setupCurrent, staffSetup, taskGuide, toProfileStep, tourMenu, view } = useAppState();
  return (
    <>
      {view === 'dashboard' && currentUser && staffSetup === 'password' && (
        <SetupPasswordStep user={currentUser} knownCurrent={setupCurrent}
                           onDone={(user) => { if (user) setCurrentUser(user); toProfileStep(user || currentUser); }}
                           onSkip={() => toProfileStep(currentUser)} />
      )}
      {taskGuide && currentUser && (
        <ProductTour key={taskGuide.key} open task={taskGuide.key} taskLabel={taskGuide.label}
                     user={currentUser} menu={tourMenu} onMenu={setMobileNavOpen} onClose={() => setTaskGuide(null)} />
      )}
    </>
  );
}
