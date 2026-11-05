import { Factory, PanelLeftClose, PanelLeftOpen, Ruler, Scissors } from 'lucide-react';
import { MobileHeader } from '../../navigation/MobileHeader';
import { api } from '../../api';
import { PortalMenu } from '../../navigation/PortalMenu';
import { IconTile, ShellWordmark } from '../../components/ui/Atelier';
import { WIZARD_STEPS } from './wizard';
import { formatDateTime as fmtDateTime } from '../../utils/format';
import BoutiqueProductionDialog from '../production/BoutiqueProduction';
import { useLanguage } from '../../i18n/LanguageContext.jsx';
import { useApp } from '../../context/AppContext';
import { PageTopBar } from '../../components/ui/Breadcrumbs';
import { userIsOwner } from '../../constants/roles';

/**
 * Before the wizard: what kind of order this is (stitching, an alteration, or
 * in-house work for the boutique's own stock), and the orders in progress that
 * can be picked up again.
 */
export default function OrderTypeSelector({ crumbs, wizard, accountBar, fetchNotifications, headerAccountItems, hydrateWizard, markingNotificationsRead, mobileNavOpen, navCollapsed, notifications, resumableDrafts, setCustomerAddMode, setMarkingNotificationsRead, setMobileNavOpen, setResumableDrafts, setSelectedDirectoryCustomer, setShowNotificationsDrawer, setView, showBell, sidebarSections, startService, toggleNav }) {
  const { deletingDraftId, discardingDraftId, setDeletingDraftId, setDiscardingDraftId, setStartingBoutiqueRun, startingBoutiqueRun } = wizard;
  const { t } = useLanguage();
  const { currentUser, setDashboardTab, dashboardTab, refresh: fetchDashboardAndConfig } = useApp();
  return (
    <div className={`portal-layout${navCollapsed ? ' nav-collapsed' : ''}`}>
      {/* Below 1024px .portal-sidebar is an off-canvas drawer. Without a way
          to open it -- and without the overlay to shut it again -- this
          screen had no navigation at all on a phone: the sidebar sat parked
          at translateX(-100%) and nothing on the page could bring it back. */}
      <MobileHeader
        showBell={showBell}
        title="New Order"
        currentUser={currentUser}
        notificationsCount={notifications.filter(n => !n.is_read).length}
        onOpenMenu={() => setMobileNavOpen(!mobileNavOpen)}
        accountItems={headerAccountItems((tab) => { setView('dashboard'); setDashboardTab(tab); setSelectedDirectoryCustomer(null); setCustomerAddMode(null); setMobileNavOpen(false); })}
        onOpenNotifications={() => {
          setShowNotificationsDrawer(true);
          if (markingNotificationsRead) return;
          setMarkingNotificationsRead(true);
          api.markNotificationsAsRead(currentUser?.role || 'Owner', currentUser?.email)
            .then(() => fetchNotifications())

                .catch(() => {})
                .finally(() => setMarkingNotificationsRead(false));
        }}
      />

      {mobileNavOpen && (
        <div className="mobile-portal-overlay" onClick={() => setMobileNavOpen(false)} />
      )}

      {/* Reuse Sidebar for Portal Continuity */}
      <aside className={`portal-sidebar ${mobileNavOpen ? 'mobile-open' : ''}`}>
        <div className="portal-sidebar-brand">
          <div className="portal-sidebar-lockup">
            <ShellWordmark />
            <span className="portal-sidebar-tagline">Boutique</span>
          </div>
          <img className="portal-sidebar-mark" src="/icon-512.png" alt="" />
          <button type="button" className="portal-nav-toggle" onClick={toggleNav}
                  aria-label={navCollapsed ? 'Expand navigation' : 'Collapse navigation'}
                  aria-expanded={!navCollapsed}
                  title={navCollapsed ? 'Expand navigation' : 'Collapse navigation'}>
            {navCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </button>
        </div>

        <nav className="portal-menu">
          <PortalMenu
            sections={sidebarSections}
            activeTab={dashboardTab}
            collapsed={navCollapsed && !mobileNavOpen}
            onPick={(tab) => { setView('dashboard'); setDashboardTab(tab); setSelectedDirectoryCustomer(null); setCustomerAddMode(null); setMobileNavOpen(false); }}
          />
        </nav>
      </aside>

      <main className="portal-main">
        {/* The trail goes back up to where New order was opened from (OrderFlowViews). */}
        <PageTopBar crumbs={crumbs} account={accountBar((tab) => { setView('dashboard'); setDashboardTab(tab); setSelectedDirectoryCustomer(null); setCustomerAddMode(null); setMobileNavOpen(false); })} />
        <div className="selector-container">
          <div className="selector-header">
            <p className="selector-subtitle" style={{ color: 'var(--text-secondary)' }}>{t('entry.serviceQuestion', 'What are we doing for this customer today?')}</p>
          </div>

          {/* The first question: three doors. A new design by our designer
              is not a door of its own any more -- it is one of the ways to
              choose the look inside Stitching. A garment stitched elsewhere
              comes in through Alteration, beside ours. */}
          <div className="wz-services wz-services--three">
            <button type="button" className="wz-service" onClick={() => startService('stitch')}>
              <IconTile icon={Scissors} tone="green" size={48} iconSize={22} />
              <span className="wz-service-title">{t('entry.serviceStitching', 'Stitching')}</span>
              <span className="wz-service-desc">{t('entry.serviceStitchingDesc', 'A blouse, saree work, a lehenga. The look comes from our catalogue, the customer\u2019s photos, or a new design by our designer.')}</span>
            </button>
            <button type="button" className="wz-service" onClick={() => startService('alter')}
                    disabled={currentUser?.role === 'Designer'}
                    title={currentUser?.role === 'Designer' ? t('entry.serviceAlterNotYou', 'Alterations are raised at the counter.') : undefined}>
              <IconTile icon={Ruler} tone="amber" size={48} iconSize={22} />
              <span className="wz-service-title">{t('entry.serviceAlteration', 'Alteration')}</span>
              <span className="wz-service-desc">{t('entry.serviceAlterationDesc', 'Fix or adjust a garment \u2014 one we made, or one stitched elsewhere.')}</span>
            </button>
            {userIsOwner(currentUser) && (
              <button type="button" className="wz-service" onClick={() => setStartingBoutiqueRun(true)}>
                <IconTile icon={Factory} tone="violet" size={48} iconSize={22} />
                <span className="wz-service-title">{t('entry.serviceInHouse', 'In-house')}</span>
                <span className="wz-service-desc">{t('entry.serviceInHouseDesc', 'Garments for our own stock or the showroom. No customer \u2014 they go into inventory when they are done.')}</span>
              </button>
            )}
          </div>

          {/* Orders already being written. Offered, never resumed
              silently: picking one up is a decision, and so is throwing it
              away. Shows enough to tell two apart -- who it is for, what is
              on it, how far it got and when it was last touched. */}
          {resumableDrafts.length > 0 && (
            <div className="content-card" style={{ marginTop: '24px' }}>
              <div style={{ fontWeight: 600, marginBottom: '4px' }}>
                {resumableDrafts.length === 1
                  ? t('entry.orderInProgressOne', 'You have an order in progress')
                  : t('entry.orderInProgressMany', `You have ${resumableDrafts.length} orders in progress`, { count: resumableDrafts.length })}
              </div>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                {t('entry.savedAutomaticallySub', 'Saved automatically. Pick one up where you left it, or discard it.')}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {resumableDrafts.map(draft => {
                  const garments = (draft.payload?.garments || [])
                    .map(g => g.template_key).filter(Boolean);
                  return (
                    <div key={draft.id} style={{ display: 'flex', alignItems: 'center', gap: '12px',
                                                 flexWrap: 'wrap', borderTop: '1px solid var(--border-color)',
                                                 paddingTop: '10px' }}>
                      <div style={{ flex: '1 1 260px' }}>
                        <div style={{ fontWeight: 600 }}>
                          {draft.customer_name || (garments.length ? garments.join(', ') : t('entry.unnamedCustomer', 'Unnamed customer'))}
                        </div>
                        <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>
                          {draft.customer_name
                            ? (garments.length ? garments.join(', ') : t('wizard.noGarmentChosen', 'No garment yet'))
                            : t('entry.customerNotYet', 'Customer not added yet')}
                          {' · '}{(() => { const total = WIZARD_STEPS[draft.payload?.service === 'design' ? 'design' : 'stitch'].length; return t('entry.stepXofY', 'Step {step} of {total}', { step: Math.min(draft.current_step, total), total }); })()}
                          {' · '}{t('entry.lastSaved', 'saved')} {fmtDateTime(draft.updated_at)}
                        </div>
                      </div>
                      <button type="button" className="btn-primary" onClick={() => hydrateWizard(draft)}>
                        {t('entry.resume', 'Resume')}
                      </button>
                      {discardingDraftId === draft.id ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>
                            {t('entry.discardConfirmDesc', 'Discard this order? Nothing has been booked, but everything entered on it will be lost.')}
                          </span>
                          <button type="button" className="btn-secondary"
                                  onClick={() => setDiscardingDraftId(null)}>
                            {t('entry.keepIt', 'Keep it')}
                          </button>
                          <button type="button" className="btn-primary" disabled={deletingDraftId === draft.id} onClick={async () => {
                            if (deletingDraftId) return;
                            setDeletingDraftId(draft.id);
                            try {
                              await api.deleteOrderDraft(draft.id);
                              setResumableDrafts(prev => prev.filter(d => d.id !== draft.id));
                            } catch (err) {
                              console.error('Could not discard the draft', err);
                              alert('Could not discard that order — it is still saved.');
                            } finally {
                              setDiscardingDraftId(null);
                              setDeletingDraftId(null);
                            }
                          }}>
                            {deletingDraftId === draft.id
                              ? t('common.discarding', 'Discarding…')
                              : t('entry.discardPermanently', 'Discard permanently')}
                          </button>
                        </div>
                      ) : (
                        <button type="button" className="btn-secondary"
                                onClick={() => setDiscardingDraftId(draft.id)}>
                          {t('entry.discard', 'Discard')}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {startingBoutiqueRun && (
            <BoutiqueProductionDialog
              onClose={() => setStartingBoutiqueRun(false)}
              onCreated={async () => {
                setStartingBoutiqueRun(false);
                await fetchDashboardAndConfig();
                setView('dashboard');
                setDashboardTab('orders');
              }} />
          )}
        </div>
      </main>
    </div>
  );
}
