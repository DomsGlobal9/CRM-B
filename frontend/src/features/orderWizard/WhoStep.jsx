import { Check, Lock, Scissors, Shirt, Trash2 } from 'lucide-react';
import { AvatarInitials } from '../../components/ui/Atelier';
import { TierBadge } from '../customers/TierBadge';
import { customerTier } from '../customers/customerBook';
import { formatMobile } from '../../services/format';
import { LIMITS, cleanEmail, cleanMobile, cleanName } from '../../services/validate';
import { tierName } from '../../services/tierNames';
import { useLanguage } from '../../i18n/LanguageContext.jsx';

/**
 * Customer: the mobile number finds a customer the boutique already has, or a
 * new one is typed in.
 */
export default function WhoStep({ wizard, alterOutside, customerForm, customerId, customerLocked, customerMatches, customerMatchesLoading, customerName, matchBy, numberMatched, serviceType, setAlterOutside, setCustomerForm }) {
  const { clearPickedCustomer, customerLookupTyped, customerMatchList, setCustomerNameSplit } = wizard;
  const { t } = useLanguage();
  return (
    <>
      <div className="wz-who-wrap">
      <div className="page-title-group">
        <h1 className="page-title">{t('wizard.whoTitle', 'Who is this for?')}</h1>
        <p className="page-subtitle">
          {serviceType === 'alter' && alterOutside
            ? t('wizard.whoAlterOutsideSubtitle', 'Find the customer by name or mobile number, or type a new walk-in’s name and number.')
            : serviceType === 'alter'
            ? t('wizard.whoAlterSubtitleBoth', 'Find the customer by name or mobile number. A garment stitched elsewhere is taken in under “Stitched elsewhere”.')
            : t('wizard.whoSubtitle', 'Type the customer’s name, then their mobile number. A customer we know comes up as you type either one.')}
        </p>
      </div>

      <div className="content-card wz-card wz-who">
        {/* One Alteration door for both kinds of garment. Ours is
            found on the customer's delivered orders; one stitched
            elsewhere has no order to hang off, so it is taken in
            with its own short form. */}
        {serviceType === 'alter' && (
          <div className="wz-whose-field">
            <span className="form-label" id="wz-whose-label">{t('wizard.alterWhose', 'Whose garment is it?')}</span>
            <div className="wz-whose" role="radiogroup" aria-labelledby="wz-whose-label">
              <button type="button" role="radio" aria-checked={!alterOutside}
                      className={`wz-whose-opt${alterOutside ? '' : ' wz-whose-opt--on'}`}
                      onClick={() => setAlterOutside(false)}>
                <span className="wz-whose-icon"><Shirt size={20} /></span>
                <span className="wz-whose-text">
                  <span className="wz-whose-title">{t('wizard.alterOurs', 'Stitched by us')}</span>
                  <span className="wz-whose-sub">{t('wizard.alterOursSub', 'A garment we made and delivered')}</span>
                </span>
                <span className="wz-whose-mark" aria-hidden="true">{!alterOutside && <Check size={14} />}</span>
              </button>
              <button type="button" role="radio" aria-checked={alterOutside}
                      className={`wz-whose-opt${alterOutside ? ' wz-whose-opt--on' : ''}`}
                      onClick={() => setAlterOutside(true)}>
                <span className="wz-whose-icon"><Scissors size={20} /></span>
                <span className="wz-whose-text">
                  <span className="wz-whose-title">{t('wizard.alterOutside', 'Stitched elsewhere')}</span>
                  <span className="wz-whose-sub">{t('wizard.alterOutsideSub', 'Made by another tailor, brought in for changes')}</span>
                </span>
                <span className="wz-whose-mark" aria-hidden="true">{alterOutside && <Check size={14} />}</span>
              </button>
            </div>
          </div>
        )}

        {/* The customer's name first, then their mobile number. A
            customer picked from the matches shows here in its place. */}
        {customerId ? (
          <div className="wz-known">
            <AvatarInitials name={`${customerForm.first_name} ${customerForm.last_name}`} size={40} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="wz-known-name">{customerForm.first_name} {customerForm.last_name} <TierBadge tier={customerTier(customerForm)} /></div>
              <div className="od-hint">
                {formatMobile(customerForm.mobile_number)}{customerForm.city_region ? ` · ${customerForm.city_region}` : ''} · {customerLocked
                  ? t('wizard.fixedFromProfile', 'from their profile; edit it there to change it')
                  : t('wizard.knownCustomer', 'a customer we know')}
              </div>
              {numberMatched?.id === customerId && numberMatched.typedName
                && numberMatched.typedName.toLowerCase() !== `${customerForm.first_name} ${customerForm.last_name}`.trim().toLowerCase() && (
                <div className="wz-known-note">
                  {t('wizard.numberMatchedNote', 'This number is already saved for this customer, so the name “{typed}” was replaced. For a different customer, change the number.', { typed: numberMatched.typedName })}
                </div>
              )}
            </div>
            {/* From a customer's own profile the customer is fixed. Otherwise
                Delete takes them off this order -- the card, the name and the
                number -- to start again. The customer stays in the book. */}
            {customerLocked ? <Lock size={16} style={{ color: 'var(--text-secondary)' }} aria-hidden="true" /> : (
            <button type="button" className="btn-secondary at-btn-sm"
                    title={t('wizard.removeCustomer', 'Remove this customer from the order')}
                    aria-label={t('wizard.removeCustomer', 'Remove this customer from the order')}
                    style={{ color: 'var(--danger-color)', borderColor: 'var(--danger-color)' }}
                    onClick={() => { clearPickedCustomer(''); requestAnimationFrame(() => document.getElementById('wz-name')?.focus()); }}>
              <Trash2 size={14} /> {t('common.delete', 'Delete')}
            </button>
            )}
          </div>
        ) : (
          <div className="form-group">
            <label className="form-label" htmlFor="wz-name">{t('wizard.customerName', 'Customer Name')} <span className="required">*</span></label>
            <input id="wz-name" type="text" className="form-control" value={customerName} autoFocus={!customerLocked} autoComplete="off"
                   maxLength={LIMITS.name}
                   onChange={(e) => setCustomerNameSplit(cleanName(e.target.value))}
                   placeholder={t('wizard.namePlaceholder', 'e.g. Amara Singh')} />
            {matchBy === 'name' && customerMatchList}
          </div>
        )}

        <div className="wz-who-row">
        <div className="wz-who-col">
        <div className="form-group">
          <label className="form-label" htmlFor="wz-mobile">{t('wizard.mobileNumber', 'Mobile Number')} <span className="required">*</span></label>
          <div className="input-wrapper">
            <span className="input-icon-left" style={{ fontSize: '14px', left: '12px' }}>🇮🇳 +91</span>
            <input id="wz-mobile" type="tel" inputMode="numeric" autoComplete="off"
                   value={customerForm.mobile_number}
                   readOnly={customerLocked && !!customerId} aria-readonly={customerLocked && !!customerId}
                   onChange={(e) => {
                     const digits = cleanMobile(e.target.value);
                     if (customerId) { clearPickedCustomer(digits); return; }
                     setCustomerForm({ ...customerForm, mobile_number: digits });
                   }}
                   style={{ paddingLeft: '65px' }} placeholder="98765 43210" />
          </div>
        </div>

        {!customerId && (
          <>
            {matchBy === 'mobile' && customerMatchList}
            {serviceType === 'alter' && customerLookupTyped && customerMatches.length === 0 && !customerMatchesLoading && (
              alterOutside ? (
                <p className="od-hint" style={{ marginTop: '8px' }}>
                  {t('wizard.newWalkIn', 'Not in your book yet: they are added as a new walk-in customer when you take the garment in.')}
                </p>
              ) : (
                <p className="od-hint" style={{ marginTop: '8px' }}>
                  {t('wizard.noCustomerForAlterOutside', 'No customer with this name or number in your book. If the garment was stitched elsewhere, take it in under')}{' '}
                  <button type="button" className="at-link" onClick={() => setAlterOutside(true)}>
                    {t('wizard.alterOutside', 'Stitched elsewhere')}
                  </button>.
                </p>
              )
            )}
          </>
        )}
        </div>

        {/* Gender is kept on the customer's record; the garments were
            chosen before we got here, so it filters nothing now.
            Alterations skip it -- their garments come from past orders. */}
        {serviceType !== 'alter' && !customerId && (
          <div className="form-group">
            <label className="form-label" htmlFor="wz-gender">{t('wizard.gender', 'Gender')} <span className="od-hint">({t('common.optional', 'optional')})</span></label>
            <select id="wz-gender" className="form-control" value={customerForm.gender || ''}
                    onChange={(e) => setCustomerForm({ ...customerForm, gender: e.target.value })}>
              <option value="">{t('wizard.selectGender', 'Select Gender')}</option>
              <option value="Female">{t('wizard.female', 'Female')}</option>
              <option value="Male">{t('wizard.male', 'Male')}</option>
              <option value="Other">{t('wizard.other', 'Other')}</option>
            </select>
          </div>
        )}
        </div>

        {serviceType !== 'alter' && (
          <details className="wz-more">
            <summary>{t('wizard.moreAboutCustomer', 'More about the customer')} <span className="od-hint">({t('common.optional', 'optional')})</span></summary>
            <div className="form-grid-2" style={{ marginTop: '12px' }}>
              <div className="form-group">
                <label className="form-label">{t('wizard.emailAddress', 'Email Address')}</label>
                <input type="email" className="form-control" value={customerForm.email_address || ''} maxLength={LIMITS.email}
                       onChange={(e) => setCustomerForm({ ...customerForm, email_address: e.target.value })}
                       onBlur={(e) => setCustomerForm({ ...customerForm, email_address: cleanEmail(e.target.value) })}
                       placeholder="e.g. amara.s@example.com" />
              </div>
              <div className="form-group">
                <label className="form-label">{t('wizard.cityRegion', 'City / Region')}</label>
                <input type="text" className="form-control" value={customerForm.city_region || ''} maxLength={LIMITS.name}
                       onChange={(e) => setCustomerForm({ ...customerForm, city_region: e.target.value })} placeholder="e.g. New Delhi" />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">{t('wizard.address', 'Address')}</label>
              <input type="text" className="form-control" value={customerForm.address || ''} maxLength={LIMITS.address}
                     onChange={(e) => setCustomerForm({ ...customerForm, address: e.target.value })}
                     placeholder={t('wizard.addressPlaceholder', 'Street name, Apartment, City, State, PIN code')} />
            </div>
            <div className="form-grid-2">
              <div className="form-group">
                <label className="form-label">{t('wizard.customerType', 'Customer tier')}</label>
                <select className="form-control" value={customerForm.customer_type}
                        onChange={(e) => setCustomerForm({ ...customerForm, customer_type: e.target.value })}>
                  <option value="Silver">{tierName('Silver', t('wizard.silver', 'Silver'))}</option>
                  <option value="Gold">{tierName('Gold', t('wizard.gold', 'Gold'))}</option>
                  <option value="Platinum">{tierName('Platinum', t('wizard.platinum', 'Platinum'))}</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">{t('wizard.source', 'Source')}</label>
                <select className="form-control" value={customerForm.source}
                        onChange={(e) => setCustomerForm({ ...customerForm, source: e.target.value })}>
                  <option value="Walk In">{t('wizard.walkIn', 'Walk In')}</option>
                  <option value="Instagram">{t('wizard.instagram', 'Instagram')}</option>
                  <option value="Referral">{t('wizard.referral', 'Referral')}</option>
                  <option value="Website">{t('wizard.website', 'Website')}</option>
                </select>
              </div>
            </div>
          </details>
        )}

      </div>
      </div>
    </>
  );
}
