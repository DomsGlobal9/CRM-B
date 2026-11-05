import { ClipboardList, Plus } from 'lucide-react';
import { Suspense, lazy, useState } from 'react';
import { PageHeader } from '../../components/ui/Atelier';
import { ScreenLoading } from '../../components/ui/ScreenLoading';
import Loader from '../../components/ui/Loader';
import { useLanguage } from '../../i18n/LanguageContext.jsx';
import { useApp } from '../../context/AppContext';
import { Crumbs } from '../../components/ui/Breadcrumbs';
import { userIsOwner } from '../../constants/roles';

const DesignUpload = lazy(() => import('./DesignUpload'));
const DesignWork = lazy(() => import('./DesignWork'));
const DesignRequestForm = lazy(() => import('./DesignWork').then((m) => ({ default: m.DesignRequestForm })));
const DesignDashboard = lazy(() => import('./DesignDashboard'));
const DesignLibrary = lazy(() => import('./DesignLibrary'));

// The Design library's Overview tab is merged into "Boutique designs" (its
// counts sit with the library's own); hidden, not removed -- set to true to
// bring the tab back.
const SHOW_DESIGN_OVERVIEW_TAB = false;

/**
 * Designs: the boutique's design library with its design requests list, the
 * Design Request form and the upload form. Each part is lazily loaded.
 */
export default function DesignsPanel({ designLibraryToken, designsView, handleDeleteDesign, navTabs, sectionVisit, setDesignForm, setDesignImageFile, setDesignLibraryToken, setDesignsView, setEditingDesign, setSectionVisit, setShowDesignModal, setShowDesignUpload, setStaffDesignersVisit, showDesignUpload }) {
  const { t } = useLanguage();
  const { currentUser, adminCan, refresh: fetchDashboardAndConfig, setDashboardTab } = useApp();
  // The open tab's crumb opens it afresh, closing a category of the library.
  const [viewVisit, setViewVisit] = useState(0);
  // Design requests shows only to the people DesignWork serves: a Designer, and
  // the owner or a role handed design assignment.
  const showRequests = ['Designer', 'Owner'].includes(currentUser?.role) || adminCan('design.assign');
  // Only those who hand out the work get the button; a Designer just has the list.
  const canRequest = currentUser?.role === 'Owner' || adminCan('design.assign');
  const canUpload = userIsOwner(currentUser) || adminCan('design.upload');
  const [requesting, setRequesting] = useState(false);
  const [requestsToken, setRequestsToken] = useState(0);
  const [requestsWaiting, setRequestsWaiting] = useState(0);
  // The library's two tabs. A Designer starts on their own work.
  const isDesigner = currentUser?.role === 'Designer';
  const libraryTab = designsView === 'requests' || (isDesigner && designsView !== 'library') ? 'requests' : 'categories';
  const viewLabel = designsView === 'dashboard' && SHOW_DESIGN_OVERVIEW_TAB
    ? t('designsPage.overviewTab', 'Overview')
    : t('designsPage.boutiqueDesignsTab', 'Boutique designs');
  return (
    <>
      <Crumbs level={1} items={[{ label: viewLabel, onClick: () => setViewVisit((n) => n + 1) }]} />
      <PageHeader
        title={t('designsPage.title')}
        subtitle={t('designsPage.subtitle')}
        actions={(canRequest || canUpload) && (
          <>
            {canRequest && (
              <button className="btn-secondary" style={{ padding: '9px 18px', minHeight: 0, alignSelf: 'stretch' }} onClick={() => setRequesting(true)}>
                <ClipboardList size={16} />
                {t('designsPage.designRequestBtn', 'Design Request')}
              </button>
            )}
            {canUpload && (
              <button className="btn-primary" style={{ padding: '10px 18px' }} onClick={() => setShowDesignUpload(true)}>
                <Plus size={16} />
                {t('designsPage.addNewDesign')}
              </button>
            )}
          </>
        )}
      />
      {requesting && (
        <Suspense fallback={<ScreenLoading />}>
          <DesignRequestForm
            currentUser={currentUser}
            onClose={() => setRequesting(false)}
            onSent={() => { setRequesting(false); setRequestsToken((n) => n + 1); setDesignsView('requests'); }}
          />
        </Suspense>
      )}
      {/* The same upload form the library's "Upload design" button
          opens; on save the library refreshes through its token. */}
      {showDesignUpload && (
        <Suspense fallback={<ScreenLoading />}>
          <DesignUpload
            onClose={() => setShowDesignUpload(false)}
            onUploaded={() => {
              setShowDesignUpload(false);
              setDesignLibraryToken(t => t + 1);
              setDesignsView('library');
              fetchDashboardAndConfig();
            }}
          />
        </Suspense>
      )}

      <div className="design-manager-content">
        {/* Dashboard first: stats before images, so opening the module
            answers "how is the library doing" rather than dropping
            straight into a grid. */}
        {SHOW_DESIGN_OVERVIEW_TAB && (
        <div className="tabs-header dl-tabs" style={{ marginBottom: '16px' }}>
          <button className={`tab-btn ${designsView === 'dashboard' ? 'active' : ''}`}
                  onClick={() => setDesignsView('dashboard')}>
            {t('designsPage.overviewTab', 'Overview')}
          </button>
          <button className={`tab-btn ${designsView !== 'dashboard' ? 'active' : ''}`}
                  onClick={() => setDesignsView('library')}>
            {t('designsPage.boutiqueDesignsTab', 'Boutique designs')}
          </button>
        </div>
        )}

        <Suspense fallback={<div className="content-card"><Loader page /></div>}>
          {designsView === 'dashboard' && SHOW_DESIGN_OVERVIEW_TAB ? (
            <DesignDashboard
              onOpenLibrary={() => setDesignsView('library')}
              canManageDesigners={userIsOwner(currentUser) || adminCan('team.manage')}
              shopSlug={currentUser?.shop_slug}
            />
          ) : (
            <DesignLibrary
              key={viewVisit}
              refreshToken={designLibraryToken}
              canReview={userIsOwner(currentUser) || adminCan('design.approve')}
              canStock={userIsOwner(currentUser) || adminCan('inventory.items')}
              requests={showRequests && (
                <Suspense fallback={<Loader section />}>
                  <DesignWork currentUser={currentUser} refreshToken={requestsToken}
                              onWaiting={setRequestsWaiting} />
                </Suspense>
              )}
              requestsLabel={isDesigner ? t('nav.designWork', 'Design requests') : 'Assigned Design Work'}
              requestsWaiting={requestsWaiting}
              tab={libraryTab}
              onTabChange={(key) => setDesignsView(key === 'requests' ? 'requests' : 'library')}
              onOpenDesigners={navTabs.includes('staff') ? () => {
                setStaffDesignersVisit(sectionVisit + 1);
                setSectionVisit(n => n + 1);
                setDashboardTab('staff');
                window.scrollTo(0, 0);
              } : null}
              onUploaded={() => setDesignsView('library')}
              onEditDesign={(design) => {
                setEditingDesign({ id: design.id });
                setDesignForm({
                  name: design.title || '',
                  garment_type: design.garment_type || 'Lehenga',
                  neckline_style: (design.attributes || {}).neckline_style || '',
                  sleeve_style: (design.attributes || {}).sleeve_style || '',
                  image_url: design.image_url || '',
                  is_boutique: design.source === 'catalogue',
                  price: String(design.estimated_price ?? 0),
                  description: design.description || '',
                  catalogue: design.catalogue?.category ? {
                    category: design.catalogue.category,
                    subcategory: design.catalogue.subcategory || undefined,
                    option: design.catalogue.option || undefined,
                  } : {},
                  catalogue_path: design.catalogue?.category ? {
                    category: design.catalogue.category,
                    subcategory: design.catalogue.subcategory || '',
                    option: design.catalogue.option || '',
                  } : null,
                });
                setDesignImageFile(null);
                setShowDesignModal(true);
              }}
              onDeleteDesign={(design) => handleDeleteDesign(design.id)}
            />
          )}
        </Suspense>
      </div>
    </>
  );
}
