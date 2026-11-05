import { Wallet, Shirt, Ruler, CalendarDays, Sparkles, ShieldCheck, Target, Leaf } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext.jsx';
import { SectionCard, InfoNote } from '../../components/ui/Atelier';

export const StyleProfileCard = ({ customer }) => {
  const { t } = useLanguage();
  const dna = customer?.style_dna || {};
  const rows = [
    [t('customersPage.totalSpent', 'Total spent'), dna.revenue ?? dna.budget, Wallet], [t('customersPage.stylePreferences', 'Style preferences'), dna.style, Shirt],
    [t('customersPage.size', 'Size'), dna.size, Ruler], [t('customersPage.visitPattern', 'Visit pattern'), dna.visit_pattern, CalendarDays],
  ].filter(([, v]) => v);
  const riskColor = dna.risk_level === 'danger' ? 'var(--danger-color)'
    : dna.risk_level === 'warning' ? 'var(--warning-text)' : 'var(--success-text)';
  const hasAny = rows.length || dna.risk_status || dna.next_action;
  return (
    <SectionCard icon={Sparkles} tone="amber"
                 title={t('customersPage.styleProfile', 'Style profile')}>
      {!hasAny && (
        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>{t('customersPage.noStyleProfile', 'No style profile for this customer yet.')}</div>
      )}
      {rows.map(([label, value, Icon]) => (
        <div key={label} className="at-dna-row">
          <span className="at-dna-label"><Icon size={16} /> {label}</span>
          <strong>{value}</strong>
        </div>
      ))}
      {dna.risk_status && (
        <div className="at-dna-row">
          <span className="at-dna-label"><ShieldCheck size={16} /> {t('customersPage.activity', 'Activity')}</span>
          <strong style={{ color: riskColor, display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: riskColor }} />
            {dna.risk_status}
          </strong>
        </div>
      )}
      {dna.next_action && (
        <div className="at-dna-row">
          <span className="at-dna-label"><Target size={16} /> {t('customersPage.suggestedNextStep', 'Suggested next step')}</span>
          <strong style={{ color: 'var(--accent-text)', fontStyle: 'italic' }}>{dna.next_action}</strong>
        </div>
      )}
      {hasAny && (
        <InfoNote tone="green" icon={Leaf} style={{ marginTop: 'var(--space-3)', padding: '10px 14px' }}>
          <em>{t('customersPage.calculatedFromSales', 'Calculated from sales data.')}</em>
        </InfoNote>
      )}
    </SectionCard>
  );
};
