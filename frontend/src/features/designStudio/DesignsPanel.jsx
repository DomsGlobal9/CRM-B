import { Plus } from 'lucide-react';
import { Suspense, lazy, useState } from 'react';
import { PageHeader } from '../../components/ui/Atelier';
import { ScreenLoading } from '../../components/ui/ScreenLoading';
import Loader from '../../components/ui/Loader';
import { useLanguage } from '../../i18n/LanguageContext.jsx';
import { useApp } from '../../context/AppContext';
import { Crumbs } from '../../components/ui/Breadcrumbs';

const DesignUpload = lazy(() => import('./DesignUpload'));
const DesignWork = lazy(() => import('./DesignWork'));
const DesignDashboard = lazy(() => import('./DesignDashboard'));
const DesignLibrary = lazy(() => import('./DesignLibrary'));

// The Design library's Overview tab is merged into "Boutique designs" (its
// counts sit with the library's own); hidden, not removed -- set to true to
// bring the tab back.
const SHOW_DESIGN_OVERVIEW_TAB = false;

/**
 * Designs: the boutique's design library, the design requests and work in
 * progress, and the upload form. Each part is its own lazily loaded screen.
 */
export default function DesignsPanel({ designLibraryToken, designsView, handleDeleteDesign, navTabs, sectionVisit, setDesignForm, setDesignImageFile, setDesignLibraryToken, setDesignsView, setEditingDesign, setSectionVisit, setShowDesignModal, setShowDesignUpload, setStaffDesignersVisit, showDesignUpload }) {
  const { t } = useLanguage();
  const { currentUser, adminCan, refresh: fetchDashboardAndConfig, setDashboardTab } = useApp();
  // The open tab's crumb opens it afresh, closing a category of the library.
  const [viewVisit, setViewVisit] = useState(0);
  // Design requests shows only to the people DesignWork serves: a Designer, for
  // whom it is "My work", and the owner or a role handed design assignment, who
  // assign the work and review what comes back. It is the only place a submitted
  // design can be approved, so those roles must always be able to reach it.
  const showRequests = ['Designer', 'Owner'].includes(currentUser?.role) || adminCan('design.assign');
  const activeView = designsView === 'requests' && !showRequests ? 'library' : designsView;
  const viewLabel = activeView === 'requests'
    ? (currentUser?.role === 'Designer' ? t('nav.myWork') : t('nav.designWork'))
    : activeView === 'dashboard' && SHOW_DESIGN_OVERVIEW_TAB
      ? t('designsPage.overviewTab', 'Overview')
      : t('designsPage.boutiqueDesignsTab', 'Boutique designs');
  return (
    <>
      <Crumbs level={1} items={[{ label: viewLabel, onClick: () => setViewVisit((n) => n + 1) }]} />
      <PageHeader
        title={t('designsPage.title')}
        subtitle={t('designsPage.subtitle')}
        actions={(!currentUser?.role || currentUser.role === 'Owner' || adminCan('design.upload')) && (
            <button className="btn-primary" style={{ padding: '10px 18px' }} onClick={() => setShowDesignUpload(true)}>
              <Plus size={16} />
              {t('designsPage.addNewDesign')}
            </button>
        )}
      />
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
        {(showRequests || SHOW_DESIGN_OVERVIEW_TAB) && (
        <div className="tabs-header dl-tabs" style={{ marginBottom: '16px' }}>
          {SHOW_DESIGN_OVERVIEW_TAB && (
          <button className={`tab-btn ${activeView === 'dashboard' ? 'active' : ''}`}
                  onClick={() => setDesignsView('dashboard')}>
            {t('designsPage.overviewTab', 'Overview')}
          </button>
          )}
          <button className={`tab-btn ${activeView === 'library' || (!SHOW_DESIGN_OVERVIEW_TAB && activeView === 'dashboard') ? 'active' : ''}`}
                  onClick={() => setDesignsView('library')}>
            {t('designsPage.boutiqueDesignsTab', 'Boutique designs')}
          </button>
          {showRequests && (
          <button className={`tab-btn ${activeView === 'requests' ? 'active' : ''}`}
                  onClick={() => setDesignsView('requests')}>
            {currentUser?.role === 'Designer' ? t('nav.myWork') : t('nav.designWork')}
          </button>
          )}
        </div>
        )}

        <Suspense fallback={<div className="content-card"><Loader page /></div>}>
          {activeView === 'requests' ? (
            <DesignWork currentUser={currentUser} />
          ) : activeView === 'dashboard' && SHOW_DESIGN_OVERVIEW_TAB ? (
            <DesignDashboard
              onOpenLibrary={() => setDesignsView('library')}
              canManageDesigners={!currentUser?.role || currentUser.role === 'Owner' || adminCan('team.manage')}
              shopSlug={currentUser?.shop_slug}
            />
          ) : (
            <DesignLibrary
              key={viewVisit}
              refreshToken={designLibraryToken}
              canReview={!currentUser?.role || currentUser.role === 'Owner' || adminCan('design.approve')}
              canStock={!currentUser?.role || currentUser.role === 'Owner' || adminCan('inventory.items')}
              onOpenRequests={showRequests ? () => setDesignsView('requests') : null}
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
