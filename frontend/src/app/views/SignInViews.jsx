import FindBoutiqueScreen from '../../features/auth/FindBoutiqueScreen';
import BoutiqueNotFound from '../../features/auth/BoutiqueNotFound';
import LoginScreen from '../../features/auth/LoginScreen';
import ForgotPasswordScreen from '../../features/auth/ForgotPasswordScreen';
import ResetPasswordScreen from '../../features/auth/ResetPasswordScreen';
import ChangePasswordScreen from '../../features/auth/ChangePasswordScreen';
import SignupScreen from '../../features/auth/SignupScreen';
import { useAppState } from '../state/appState';

/**
 * The screens before the workspace: find your boutique, boutique not found,
 * login, forgot and reset password, the first change of password, request access.
 */
export default function SignInViews() {
  const { auth, boutiqueNotFound, currentUser, handleChangePasswordSubmit, handleLoginSubmit, handleLogout, justRegistered, logoutBusy, portalSlug, setView, view } = useAppState();
  return (
    <>
      {/* 2. SIGN IN SCREEN (Image 2) */}

      {view === 'find' && <FindBoutiqueScreen auth={auth} setView={setView} />}

      {boutiqueNotFound && view !== 'find' && <BoutiqueNotFound auth={auth} portalSlug={portalSlug} setView={setView} />}

      {view === 'login' && !boutiqueNotFound && <LoginScreen auth={auth} handleLoginSubmit={handleLoginSubmit} justRegistered={justRegistered} setView={setView} />}

      {/* 3. SIGN UP SCREEN (Image 3) */}
      {/* Ask for a reset link. Reached from the login screen; leaves back to
          it. Nothing here reveals whether the address is one we know. */}
      {view === 'forgot' && <ForgotPasswordScreen auth={auth} setView={setView} />}

      {/* Choose the new password. Only reachable by following the emailed
          link, which is what put resetToken in state. */}
      {view === 'reset' && <ResetPasswordScreen auth={auth} setView={setView} />}

      {/* First sign-in on a boutique the platform team created: the owner
          replaces the temporary password before anything else. The server
          refuses every other request from this account until they do. */}
      {view === 'change-password' && currentUser && <ChangePasswordScreen auth={auth} handleChangePasswordSubmit={handleChangePasswordSubmit} handleLogout={handleLogout} logoutBusy={logoutBusy} />}

      {view === 'signup' && <SignupScreen auth={auth} setView={setView} />}

    </>
  );
}
