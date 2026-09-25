import { ChevronDown } from 'lucide-react';
import { BY_ISO, COMMON, COUNTRY_CODES, DEFAULT_COUNTRY, cleanNational, countryOf, splitInternational } from '../../services/phone';

/* A mobile number with its country: a country-code picker beside the number
   box. The rules (what is sent, what is refused) live in services/phone.js. */
export default function CountryPhoneInput({ id, country = DEFAULT_COUNTRY, onCountryChange, value, onChange, placeholder }) {
  const current = countryOf(country);
  const change = (raw) => {
    const text = String(raw || '').trim();
    if (text.startsWith('+') || text.startsWith('00')) {
      const found = splitInternational(text, country);
      if (found) {
        if (found.iso !== country) onCountryChange(found.iso);
        onChange(cleanNational(found.iso, found.national));
        return;
      }
      // "+" and the first digits of a code: held until the code is complete.
      onChange(`+${text.replace(/\D/g, '').slice(0, 4)}`);
      return;
    }
    onChange(cleanNational(country, raw));
  };
  const option = (c) => <option key={c.iso} value={c.iso}>{c.name} (+{c.dial})</option>;
  // The layout is set here as well as in index.css (.cp-*): the code and the
  // number must sit on one row even where a stale or overriding stylesheet
  // would otherwise stack them.
  return (
    <div className="cp-field" style={{ display: 'flex', flexDirection: 'row', alignItems: 'stretch', width: '100%', minWidth: 0 }}>
      <label className="cp-country" title={`${current.name} (+${current.dial})`}
             style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 6, flex: '0 0 auto', margin: 0, cursor: 'pointer' }}>
        <span className="cp-country-text" aria-hidden="true">
          <span className="cp-iso">{current.iso}</span> +{current.dial}
        </span>
        <ChevronDown size={14} aria-hidden="true" />
        <select value={current.iso} aria-label="Country code"
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', minHeight: 0, opacity: 0, margin: 0, padding: 0, border: 0, cursor: 'pointer' }}
                onChange={(e) => { onCountryChange(e.target.value); onChange(cleanNational(e.target.value, value)); }}>
          <optgroup label="Common">{COMMON.map((iso) => option(BY_ISO[iso]))}</optgroup>
          <optgroup label="All countries">{COUNTRY_CODES.map(option)}</optgroup>
        </select>
      </label>
      <input id={id} type="tel" inputMode="tel" className="form-control cp-number" value={value}
             style={{ flex: '1 1 auto', minWidth: 0, width: 'auto', margin: 0 }}
             onChange={(e) => change(e.target.value)}
             placeholder={placeholder || (current.iso === 'IN' ? '98765 43210' : 'Mobile number')} />
    </div>
  );
}
