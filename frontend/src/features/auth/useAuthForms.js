import { useState } from 'react';
import { api } from '../../api';
import { emailError, mobileError, nameError } from '../../utils/validate';

/**
 * The sign-in screens' own state: what is typed into login, find your
 * boutique, request access, forgot and reset password, and the first sign-in's
 * change of password, with the busy and error state they share. The handlers
 * here need nothing else; signing in itself (handleLoginSubmit,
 * handleChangePasswordSubmit) is App's, because it opens the workspace.
 */
export default function useAuthForms() {
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  // The login boxes stay read-only until touched, so the browser does not
  // silently fill a saved login (an owner's, on a shared computer) on load;
  // touching one offers the saved logins to pick from instead.
  const [loginUnlocked, setLoginUnlocked] = useState(false);
  const unlockLogin = () => setLoginUnlocked(true);
  const [showLoginPassword, setShowLoginPassword] = useState(false);

  const [resetEmail, setResetEmail] = useState('');
  const [resetSent, setResetSent] = useState(false);
  const [resetToken, setResetToken] = useState(
    () => new URLSearchParams(window.location.search).get('reset'));
  const [resetPassword, setResetPassword] = useState('');
  const [resetConfirm, setResetConfirm] = useState('');
  const [resetDone, setResetDone] = useState(false);

  const [authError, setAuthError] = useState(null);
  const [authBusy, setAuthBusy] = useState(false);

  const [findSlug, setFindSlug] = useState('');
  const [findError, setFindError] = useState(null);
  const [findBusy, setFindBusy] = useState(false);

  const [signupStep, setSignupStep] = useState(1);

  const [signupForm, setSignupForm] = useState({
    first_name: '',
    last_name: '',
    email_address: '',
    mobile_number: '',
    password: '',
    confirm_password: '',
    terms: false
  });
  // The sign-up form's terms popup: 'terms', 'privacy', or closed.
  const [legalDoc, setLegalDoc] = useState(null);
  const [signupBusy, setSignupBusy] = useState(false);

  const [signupError, setSignupError] = useState(null);

  const [boutiqueName, setBoutiqueName] = useState('');
  const [boutiqueAddress, setBoutiqueAddress] = useState('');

  // "Request access": nobody creates their own boutique. The request is
  // emailed a welcome ("under review"), the platform team is alerted, and the
  // team emails the login details once the boutique is set up.
  const signupReady = !!(boutiqueName.trim() && boutiqueAddress.trim()
    && signupForm.first_name.trim() && signupForm.last_name.trim()
    && signupForm.email_address.trim() && signupForm.mobile_number
    && signupForm.terms);

  // First sign-in with the temporary password the platform team sent.
  const [changeCurrent, setChangeCurrent] = useState('');
  const [changeNew, setChangeNew] = useState('');
  const [changeConfirm, setChangeConfirm] = useState('');

  const handleForgotSubmit = async (e) => {
    if (e) e.preventDefault();
    const email = resetEmail.trim();
    if (!email) {
      setAuthError('Enter the email address you sign in with.');
      return;
    }
    setAuthBusy(true);
    setAuthError(null);
    try {
      await api.requestPasswordReset(email);
      setResetSent(true);
    } catch (err) {
      setAuthError(err.message || 'Could not send the reset email.');
    } finally {
      setAuthBusy(false);
    }
  };

  const handleResetSubmit = async (e) => {
    if (e) e.preventDefault();
    if (resetPassword.length < 8) {
      setAuthError('The password needs at least 8 characters.');
      return;
    }
    if (resetPassword !== resetConfirm) {
      setAuthError('Those two passwords do not match.');
      return;
    }
    setAuthBusy(true);
    setAuthError(null);
    try {
      await api.confirmPasswordReset(resetToken, resetPassword);
      localStorage.removeItem('token');
      localStorage.removeItem('tenant_id');
      setResetDone(true);
      setResetPassword('');
      setResetConfirm('');
    } catch (err) {
      setAuthError(err.message || 'Could not change your password.');
    } finally {
      setAuthBusy(false);
    }
  };

  const slugFromTyped = (raw) => {
    const typed = (raw || '').trim().split(/[?#]/)[0];
    const tail = typed.split('/').filter(Boolean).pop() || '';
    return tail.toLowerCase().replace(/[^a-z0-9]/g, '');
  };

  const handleFindSubmit = async (e) => {
    if (e) e.preventDefault();
    if (findBusy) return;
    const slug = slugFromTyped(findSlug);
    if (!slug) {
      setFindError('Type your boutique name or the address you sign in at.');
      return;
    }
    setFindBusy(true);
    setFindError(null);
    const found = await api.getBoutiqueBySlug(slug);
    if (!found) {
      setFindError(`No active boutique signs in at /${slug}. Check the spelling with whoever set it up.`);
      setFindBusy(false);
      return;
    }
   
    window.location.href = `/${found.shop_slug}`;
  };

  const handleSignupSubmit = async (e) => {
    e.preventDefault();
    if (!signupReady) return;
    const bad = nameError(signupForm.first_name, { label: 'First name' })
      || nameError(signupForm.last_name, { label: 'Last name' })
      || emailError(signupForm.email_address, { required: true })
      || mobileError(signupForm.mobile_number);
    if (bad) { setSignupError(bad); return; }
    if (signupBusy) return;
    setSignupBusy(true);
    setSignupError(null);
    try {
      await api.requestAccess({
        name: `${signupForm.first_name.trim()} ${signupForm.last_name.trim()}`,
        email: signupForm.email_address.trim(),
        phone: signupForm.mobile_number,
        boutique: boutiqueName.trim(),
        address: boutiqueAddress.trim(),
        terms_accepted: signupForm.terms === true,
      });
      setSignupStep(2);
    } catch (err) {
      setSignupError(err.message || 'Your request could not be sent. Please try again.');
    } finally {
      setSignupBusy(false);
    }
  };

  return {
    loginEmail,
    setLoginEmail,
    loginPassword,
    setLoginPassword,
    loginUnlocked,
    setLoginUnlocked,
    showLoginPassword,
    setShowLoginPassword,
    resetEmail,
    setResetEmail,
    resetSent,
    setResetSent,
    resetToken,
    setResetToken,
    resetPassword,
    setResetPassword,
    resetConfirm,
    setResetConfirm,
    resetDone,
    setResetDone,
    authError,
    setAuthError,
    authBusy,
    setAuthBusy,
    unlockLogin,
    findSlug,
    setFindSlug,
    findError,
    setFindError,
    findBusy,
    setFindBusy,
    signupStep,
    setSignupStep,
    signupForm,
    setSignupForm,
    legalDoc,
    setLegalDoc,
    signupBusy,
    setSignupBusy,
    signupError,
    setSignupError,
    boutiqueName,
    setBoutiqueName,
    boutiqueAddress,
    setBoutiqueAddress,
    changeCurrent,
    setChangeCurrent,
    changeNew,
    setChangeNew,
    changeConfirm,
    setChangeConfirm,
    signupReady,
    handleForgotSubmit,
    handleResetSubmit,
    slugFromTyped,
    handleFindSubmit,
    handleSignupSubmit,
  };
}
