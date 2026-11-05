import { CheckCircle2, MessageSquare, RefreshCw, RotateCw } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext.jsx';

/** The WhatsApp popup: the connection, the sending switch, and pairing a phone. */
export default function WhatsAppPanel({
  whatsappStatus, resetting, handleReset, sendingSaving, sendingError, handleSendingToggle,
  platformSendingOn, boutiqueSendingOn, sendingKnown, sendingOff,
}) {
  const { t } = useLanguage();
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px solid var(--border-color)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: whatsappStatus.connected ? 'var(--success-color)' : (whatsappStatus.qrCode ? '#f59e0b' : 'var(--text-secondary)') }} />
          <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
            Status: {whatsappStatus.connected ? 'Connected' : (whatsappStatus.qrCode ? 'Waiting for Scan' : 'Disconnected')}
          </span>
        </div>

        <button
          type="button"
          className="btn-secondary"
          style={{ fontSize: '12px', padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '6px', borderRadius: 'var(--radius-md)' }}
          onClick={handleReset}
          disabled={resetting}
        >
          <RefreshCw size={13} className={resetting ? 'spin' : ''} />
          <span>{resetting ? t('settingsPage.resetting', 'Resetting...') : t('settingsPage.resetSession', 'Reset Session')}</span>
        </button>
      </div>

      {/* Connected and allowed to send are separate: this decides
          whether anything goes out, whatever the connection says. */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', marginBottom: '16px', padding: '14px 16px', background: 'var(--surface-inset)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg)' }}>
        <label htmlFor="whatsapp-sending-switch" style={{ margin: 0, cursor: platformSendingOn === false ? 'default' : 'pointer' }}>
          <span style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
            {t('settingsPage.whatsappSendingLabel', 'Send WhatsApp messages')}
          </span>
          <span style={{ display: 'block', fontSize: '12.5px', fontWeight: 400, color: 'var(--text-secondary)', lineHeight: 1.45 }}>
            {!sendingKnown
              ? t('settingsPage.whatsappSendingChecking', 'Checking whether messages are on...')
              : platformSendingOn === false
              ? t('settingsPage.whatsappSendingPlatformOff', 'Turned off for the whole platform by the administrator, so nothing is sent and this switch cannot override it.')
              : boutiqueSendingOn === false
                ? t('settingsPage.whatsappSendingOff', 'Off: order updates, invoices, birthday wishes and appointment confirmations are not sent, even while WhatsApp is connected. Turning this on does not send what was missed. Website sign-in codes still go out.')
                : t('settingsPage.whatsappSendingOn', 'On: order updates, invoices, birthday wishes and appointment confirmations go out automatically while WhatsApp is connected.')}
          </span>
        </label>
        <input
          id="whatsapp-sending-switch"
          type="checkbox"
          role="switch"
          checked={sendingKnown && platformSendingOn !== false && boutiqueSendingOn}
          disabled={!sendingKnown || sendingSaving || platformSendingOn === false}
          onChange={(e) => handleSendingToggle(e.target.checked)}
          style={{ width: '18px', height: '18px', flexShrink: 0, marginTop: '2px', accentColor: 'var(--primary-color)', cursor: platformSendingOn === false ? 'not-allowed' : 'pointer' }}
        />
      </div>
      {sendingError && (
        <div role="alert" style={{ marginBottom: '16px', fontSize: '12.5px', color: 'var(--danger-color)' }}>{sendingError}</div>
      )}

      {whatsappStatus.connected ? (
        <div style={{ padding: '20px', background: 'var(--success-bg)', border: '1px solid color-mix(in srgb, var(--success-color) 40%, transparent)', borderRadius: 'var(--radius-lg)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <CheckCircle2 size={20} color="var(--success-color)" />
            <span style={{ fontWeight: 700, fontSize: '15px', color: 'var(--success-text)' }}>
              {sendingOff
                ? t('settingsPage.connectedNotSendingTitle', 'WhatsApp Connected, Sending Off')
                : t('settingsPage.connectedTitle', 'WhatsApp Connected & Active')}
            </span>
          </div>
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            {sendingOff
              ? t('settingsPage.connectedNotSendingDesc', 'This number is linked, but customers are not being messaged.')
              : t('settingsPage.connectedDesc', 'Automated customer order receipts, stage progress updates, and delivery alerts are actively delivering.')}
          </div>
          <div style={{ marginTop: '18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '14px', borderTop: '1px solid color-mix(in srgb, var(--success-color) 25%, transparent)' }}>
            <span className="ui-badge" style={{ background: 'var(--surface-color)', color: 'var(--success-text)', border: '1px solid color-mix(in srgb, var(--success-color) 30%, transparent)', fontWeight: 600 }}>
              {sendingOff
                ? t('settingsPage.connectedNotSendingBadge', 'Connected, Not Sending')
                : t('settingsPage.connectedBadge', 'Active & Connected')}
            </span>
            <button
              type="button"
              style={{ background: 'none', border: 'none', color: 'var(--danger-color)', fontSize: '12.5px', cursor: 'pointer', fontWeight: 600, textDecoration: 'underline' }}
              onClick={handleReset}
            >
              {t('settingsPage.disconnectRepair', 'Disconnect & Re-pair')}
            </button>
          </div>
        </div>
      ) : whatsappStatus.qrCode ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) minmax(200px, 240px)', gap: '20px', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>
              Pair with your phone
            </div>
            <p style={{ margin: '0 0 14px 0', fontSize: '12.5px', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
              Scan the QR code with WhatsApp on your mobile phone to connect this boutique account.
            </p>

            <div className="settings-qr-instruction-steps">
              <div className="settings-qr-step">
                <span className="settings-qr-step-num">1</span>
                <span>Open WhatsApp on your phone</span>
              </div>
              <div className="settings-qr-step">
                <span className="settings-qr-step-num">2</span>
                <span>Tap <strong>Settings</strong> or <strong>Menu</strong> &gt; <strong>Linked Devices</strong></span>
              </div>
              <div className="settings-qr-step">
                <span className="settings-qr-step-num">3</span>
                <span>Point your camera at this QR code</span>
              </div>
            </div>
          </div>

          <div className="settings-qr-box">
            <img
              src={whatsappStatus.qrCode}
              alt="WhatsApp Link QR Code"
              style={{ width: '170px', height: '170px', objectFit: 'contain', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', padding: '6px', background: '#ffffff' }}
            />
            <div style={{ marginTop: '12px', fontSize: '12px', color: 'var(--success-text)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
              <RotateCw size={14} className="spin" /> {t('settingsPage.waitingQrScan', 'Waiting for QR scan...')}
            </div>
          </div>
        </div>
      ) : (
        <div style={{ padding: '28px 24px', border: '1px dashed var(--border-strong)', borderRadius: 'var(--radius-lg)', background: 'var(--surface-inset)', textAlign: 'center' }}>
          <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--success-bg)', color: 'var(--success-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
            <MessageSquare size={20} />
          </div>
          <div style={{ fontWeight: 700, fontSize: '15px', color: 'var(--text-primary)', marginBottom: '6px' }}>
            {t('settingsPage.linkWhatsAppAccount', 'Link WhatsApp Account')}
          </div>
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '18px', maxWidth: '380px', margin: '0 auto 18px', lineHeight: 1.45 }}>
            {t('settingsPage.linkWhatsAppDesc', 'Click below to generate WhatsApp QR code for scanning.')}
          </div>
          <button
            type="button"
            className="btn-primary"
            style={{ width: '100%', maxWidth: '280px', margin: '0 auto', justifyContent: 'center', gap: '8px' }}
            onClick={handleReset}
            disabled={resetting}
          >
            <RotateCw size={14} className={resetting ? 'spin' : ''} />
            <span>{resetting ? t('settingsPage.generatingQrCode', 'Generating QR Code...') : t('settingsPage.generateQrCode', 'Generate WhatsApp QR Code')}</span>
          </button>
        </div>
      )}
    </div>
  );
}
