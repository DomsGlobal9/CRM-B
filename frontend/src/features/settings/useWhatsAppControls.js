import React, { useState } from 'react';
import { api } from '../../api';

/** The WhatsApp status poll, the sending switch and the session reset. These stay
 *  with the page rather than the popup, so what was saved survives closing it. */
export function useWhatsAppControls({ whatsappStatus, fetchWhatsAppStatus, isOwner, t }) {
  const [resetting, setResetting] = useState(false);
  const [sendingSaving, setSendingSaving] = useState(false);
  const [sendingError, setSendingError] = useState('');
  const [savedBoutiqueSending, setSavedBoutiqueSending] = useState(null);

  React.useEffect(() => {
    if (isOwner && fetchWhatsAppStatus) {
      fetchWhatsAppStatus();
      const interval = setInterval(fetchWhatsAppStatus, 3000);
      return () => clearInterval(interval);
    }
  }, [fetchWhatsAppStatus, isOwner]);

  const handleReset = async () => {
    setResetting(true);
    try {
      await api.resetWhatsAppStatus();
      if (fetchWhatsAppStatus) {
        await fetchWhatsAppStatus();
      }
    } catch (err) {
      console.error('Failed to reset WhatsApp session:', err);
    } finally {
      setResetting(false);
    }
  };

  // Undefined until the first status answer: the switch waits rather than
  // showing a position nobody has read yet. What the owner just saved wins over
  // the status poll, which goes through the WhatsApp service, can take seconds,
  // and may have set out before the save.
  const platformSendingOn = whatsappStatus.sendingEnabled;
  const boutiqueSendingOn = savedBoutiqueSending ?? whatsappStatus.boutiqueSendingEnabled;
  const sendingKnown = typeof boutiqueSendingOn === 'boolean';
  const sendingOff = platformSendingOn === false || boutiqueSendingOn === false;

  const handleSendingToggle = async (enabled) => {
    setSendingSaving(true);
    setSendingError('');
    try {
      const saved = await api.setWhatsAppSending(enabled);
      setSavedBoutiqueSending(saved.boutiqueSendingEnabled);
    } catch (err) {
      setSendingError(err?.message || t('settingsPage.whatsappSwitchFailed', 'Could not change the WhatsApp switch.'));
    } finally {
      setSendingSaving(false);
    }
  };

  return {
    resetting, handleReset, sendingSaving, sendingError, handleSendingToggle,
    platformSendingOn, boutiqueSendingOn, sendingKnown, sendingOff,
  };
}
