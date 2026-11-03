import { Bell, Menu, PanelLeftClose, PanelLeftOpen, Sparkles, X } from 'lucide-react';
import { Suspense, lazy } from 'react';
import { MobileHeader } from '../../components/ui/MobileHeader';
import { api } from '../../services/api';
import { PortalMenu } from '../../navigation/PortalMenu';
import { FormModal, PageHeader } from '../../components/ui/Atelier';
import { ScreenLoading } from '../../components/ui/ScreenLoading';
import { SUPERVISOR_ROLES } from '../../constants/roles';
import OverviewPanel from '../../features/dashboard/OverviewPanel';
import DesignsPanel from '../../features/designStudio/DesignsPanel';
import { AddCustomerChooser, CustomerForm, DeleteAllCustomersDialog } from '../../features/customers/AddCustomer';
import { StyleProfileCard } from '../../features/customers/StyleProfileCard';
import SettingsPage from '../../components/SettingsPage.jsx';
import AppointmentModal from '../../features/appointments/AppointmentModal';
import DesignFormModal from '../../features/designStudio/DesignFormModal';
import { BottomNavigation } from '../../components/ui/BottomNavigation';
import ProductTour from '../../components/ui/ProductTour';
import { markTourSeen } from '../../components/ui/tourState';
import { useAppState } from '../state/appState';
import { Crumbs, CrumbsProvider } from '../../components/ui/Breadcrumbs';
import { orderRef } from '../../services/format';

const WorkPanel = lazy(() => import('../../features/work/WorkPanel'));
const DailyUpdates = lazy(() => import('../../features/todo/DailyUpdates'));
const InventoryPanel = lazy(() => import('../../features/inventory/InventoryPanel'));
const StaffPanel = lazy(() => import('../../features/staff/StaffPanel'));
const FinancePanel = lazy(() => import('../../features/finance/FinancePanel'));
const OrderDetailPanel = lazy(() => import('../../features/orders/OrderDetailPanel'));
const OrdersPanel = lazy(() => import('../../features/orders/OrdersPanel'));
const CustomersPanel = lazy(() => import('../../features/customers/CustomersPanel'));
const CustomerDetailPanel = lazy(() => import('../../features/customers/CustomerDetailPanel'));
const InvoicesPanel = lazy(() => import('../../features/invoices/InvoicesPanel'));
const InsightsPanel = lazy(() => import('../../features/analytics/InsightsPanel'));
const AccountPanel = lazy(() => import('../../features/account/AccountPanel'));

/**
 * The signed-in workspace: the phone and tablet headers, the sidebar, the page
 * on screen (one per sidebar item), the popups the pages open, the phone's
 * bottom navigation and the guided tours.
 */
export default function WorkspaceView() {
  const { accountBar, alterationOrder, appointmentDateRef, appointmentForm, appointments, approvingDesignId, assignOrderDesigner, assigningWorkflowOrderId, beginOrderForCustomer, blankAppointmentForm, bookSummary, bookTiers, bookTotal, boutiqueAutosave, boutiqueFormError, boutiqueFormRef, boutiqueSettings, canAddCustomer, canDeleteCustomer, canEditCustomer, canImportCustomers, closeAppointmentModal, completingAllOrderId, currentUser, currentUserName, customerActionId, customerAddMode, customerDirectory, customerFilters, customerPageCount, customerPageFrom, customerPageNow, customerPageSize, customerPhotoBusy, customerView, dashboardData, dashboardTab, deletingAllCustomers, designForm, designImageFile, designLibraryToken, designSaving, designerInCharge, designers, designsView, directoryCount, directoryData, directoryDetailLoading, directoryLoading, editingAppointment, editingCustomer, editingDesign, expandedCustomerOrderId, fabricTaxonomy, fetchDashboardAndConfig, markNotificationsRead, fetchWhatsAppStatus, finishStaffSetup, goToCustomerPage, guideCustomers, guideOrders, handleApproveDesign, handleCancelAppointment, handleDeleteCustomer, handleDeleteDesign, handleMarkLeadContacted, handleMarkMessageSent, handleRetryMessage, handleSaveAppointment, handleSaveDesign, handleSelectExistingCustomer, handleStartNewCustomer, headerAccountItems, invoiceFilter, invoiceSearch, isLead, justRegistered, loading, logoFile, markingNotificationsRead, mobileNavOpen, navCollapsed, navSections, navTabs, notifications, onboardingSteps, openAlteration, openAppointment, openDirectoryCustomer, openGarmentJob, openOrder, openSendToWorkshop, openStageReview, orderMatchesFilters, orderTypeFor, ordersAlterationOrder, ordersFilterTab, ordersGarmentFilter, ordersList, ordersSearch, ordersStageFilter, ordersTierFilter, ordersTypeFilter, ordersView, ordersKind, setOrdersKind, ordersPageSize, setOrdersPageSize, ordersListPage, goToOrdersPage, pageTour, pageTourEmpty, pageTourOpen, pagedCustomers, paymentError, pickLogo, queuedMessages, refreshCustomerBook, rememberAlteration, reportsSwitch, saveBoutiqueForm, savingAppointment, savingPaymentId, savingVerificationOrderId, searchQuery, sectionVisit, selectedDirectoryCustomer, sendBusy, sendErrorsOrderId, setAlterationOrder, setAppointmentForm, setBoutiqueSettings, setCompletingAllOrderId, setConfirmedOrder, setCurrentUser, setCustomerAddMode, setCustomerFilters, setCustomerPageSize, setDashboardTab, setDeletingAllCustomers, setDesignForm, setDesignImageFile, setDesignLibraryToken, setDesignNotes, setDesignsView, setDirectoryVersion, setEditingAppointment, setEditingCustomer, setEditingDesign, setExpandedCustomerOrderId, setInvoiceFilter, setInvoiceSearch, setLogoFile, setMarkingNotificationsRead, setMobileNavOpen, setOnboardingDismissed, setOpenGarmentJob, setOpenOrdersRowId, setOrderTypeFor, setOrdersAlterationOrder, setOrdersFilterTab, setOrdersGarmentFilter, setOrdersSearch, setOrdersStageFilter, setOrdersTierFilter, setOrdersTypeFilter, setOrdersView, setPageTour, setPaymentError, setQuotePrices, setReviewView, setSavingPaymentId, setSavingVerificationOrderId, setSearchQuery, setSectionVisit, setSelectedDashboardOrder, setSelectedDirectoryCustomer, setSendErrorsOrderId, setSettingsSaving, setShowAppointmentModal, setShowDesignModal, setShowDesignUpload, setShowInvoiceModal, setShowNotificationsDrawer, setStaffDesignersVisit, setStyleNotesFor, setTaskGuide, setTourOpen, setView, setViewAllCustomerMeasurements, settingsSaving, showAppointmentModal, showBell, showDesignModal, showDesignUpload, showOnboarding, sidebarHint, sidebarSections, staffDesignersVisit, staffSetup, startEditCustomer, styleNotesFor, t, tailors, toggleNav, tourMenu, tourOpen, uploadDirectoryCustomerPhoto, view, viewAllCustomerMeasurements, whatsappStatus } = useAppState();

  // The page's name: the sidebar's own label first, so the two never disagree
  // ("To-do" in the menu, "Todo" in the header); the key lookup covers tabs
  // the sidebar does not list.
  const pageTitle = navSections.flatMap((s) => s.items).find((i) => i.tab === dashboardTab)?.label || t(
    dashboardTab === 'overview' ? 'nav.dashboard' :
    dashboardTab === 'orders' ? 'nav.manageOrders' :
    dashboardTab === 'workshop' ? 'nav.workshop' :
    dashboardTab === 'tailors' ? 'nav.manageTailors' :
    dashboardTab === 'designs' ? 'nav.manageDesigns' :
    dashboardTab === 'staff' ? 'nav.staffManagement' :
    dashboardTab === 'work' ? 'nav.myWork' :
    dashboardTab === 'check' ? 'nav.toCheck' :
    dashboardTab === 'done' ? 'nav.doneWork' :
    `nav.${dashboardTab}`,
    dashboardTab === 'work' ? 'My work' : dashboardTab === 'check' ? 'To check' : dashboardTab === 'done' ? 'Done' :
    dashboardTab.charAt(0).toUpperCase() + dashboardTab.slice(1)
  );

  // What a sidebar item does: open that page at its top, with nothing on it
  // left open. The breadcrumbs go up the same way.
  const openTab = (tab) => {
    setDashboardTab(tab);
    setSelectedDirectoryCustomer(null);
    setEditingCustomer(null);
    setCustomerAddMode(null);
    setOpenOrdersRowId(null);
    setOpenGarmentJob(null);
    setSelectedDashboardOrder(null);
    setSectionVisit(n => n + 1);
    setMobileNavOpen(false);
  };

  // Every page's trail starts at the person's own first page (the dashboard
  // for the owner, My work for a tailor), then the page that is open.
  const homeItem = navSections[0]?.items?.[0];
  const customerName = (c) => `${c?.first_name || ''} ${c?.last_name || ''}`.trim() || c?.name || 'Customer';
  const crumbBase = [
    ...(homeItem && homeItem.tab !== dashboardTab ? [{ label: homeItem.label, onClick: () => openTab(homeItem.tab) }] : []),
    { label: pageTitle, onClick: () => openTab(dashboardTab) },
  ];

  return (
    <>
      {/* 4. BOUTIQUE PORTAL MAIN WORKSPACE (Image 4) */}
      {view === 'dashboard' && currentUser && (
        <div className={`portal-layout${navCollapsed ? ' nav-collapsed' : ''}`}>
          <MobileHeader
            showBell={showBell}
            title={pageTitle}
            currentUser={currentUser}
            notificationsCount={notifications.filter(n => !n.is_read).length}
            onOpenMenu={() => setMobileNavOpen(!mobileNavOpen)}
            accountItems={headerAccountItems((tab) => { setDashboardTab(tab); setSelectedDirectoryCustomer(null); setEditingCustomer(null); setOpenOrdersRowId(null); setSelectedDashboardOrder(null); setSectionVisit(n => n + 1); setMobileNavOpen(false); })}
            onOpenNotifications={() => {
              setShowNotificationsDrawer(true);
              if (markingNotificationsRead) return;
              setMarkingNotificationsRead(true);
              api.markNotificationsAsRead(currentUser.role || 'Owner', currentUser.email)
                .then(() => markNotificationsRead())
                    
                    .catch(() => {})
                    .finally(() => setMarkingNotificationsRead(false));
            }}
          />

          {/* Mobile Top Header with Hamburger Toggle */}
          <div className="mobile-portal-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <button 
                type="button" 
                className="mobile-hamburger-btn"
                onClick={() => setMobileNavOpen(!mobileNavOpen)}
                aria-label="Toggle navigation menu"
              >
                {mobileNavOpen ? <X size={22} /> : <Menu size={22} />}
              </button>
              <img className="portal-wordmark portal-wordmark--sm" src="/scaleezy-wordmark.webp" alt="Scaleezy" />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {showBell && (
              <button
                disabled={markingNotificationsRead}
                onClick={() => {
                  setShowNotificationsDrawer(true);
                  if (markingNotificationsRead) return;
                  setMarkingNotificationsRead(true);
                  api.markNotificationsAsRead(currentUser.role || 'Owner', currentUser.email)
                    .then(() => markNotificationsRead())
                    
                    .catch(() => {})
                    .finally(() => setMarkingNotificationsRead(false));
                }}
                className="btn-secondary"
                style={{ padding: '6px 10px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Bell size={14} />
                {notifications.filter(n => !n.is_read).length > 0 && (
                  <span style={{ backgroundColor: '#ff4d4d', color: '#fff', borderRadius: '10px', padding: '1px 6px', fontSize: '10px', fontWeight: 700 }}>
                    {notifications.filter(n => !n.is_read).length}
                  </span>
                )}
              </button>
              )}
            </div>
          </div>

          {/* Backdrop overlay when mobile nav is open */}
          {mobileNavOpen && (
            <div className="mobile-portal-overlay" onClick={() => setMobileNavOpen(false)} />
          )}

          {/* Sidebar */}
          <aside className={`portal-sidebar ${mobileNavOpen ? 'mobile-open' : ''}`}>
            <div className="portal-sidebar-header-desktop">
              <div className="portal-sidebar-brand">
                <img className="portal-wordmark" src="/scaleezy-wordmark.webp" alt="Scaleezy" />
                <div className="portal-sidebar-mark" aria-hidden="true">S</div>
                <button type="button" className="portal-nav-toggle" onClick={toggleNav}
                        aria-label={navCollapsed ? 'Expand navigation' : 'Collapse navigation'}
                        aria-expanded={!navCollapsed}
                        title={navCollapsed ? 'Expand navigation' : 'Collapse navigation'}>
                  {navCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
                </button>
              </div>
            </div>

            <nav className="portal-menu">
              <PortalMenu
                sections={sidebarSections}
                activeTab={dashboardTab}
                collapsed={navCollapsed && !mobileNavOpen}
                hints={sidebarHint}
                onPick={openTab}
              />
            </nav>

          </aside>

          {/* Main Content Area */}
          {/* Every role but the owner gets a tighter top (portal-main--staff). */}
          <main className={`portal-main${!currentUser?.role || currentUser.role === 'Owner' ? '' : ' portal-main--staff'}`}
                key={`${dashboardTab}:${sectionVisit}`}>
            {accountBar((tab) => { setDashboardTab(tab); setSelectedDirectoryCustomer(null); setEditingCustomer(null); setOpenOrdersRowId(null); setSelectedDashboardOrder(null); setSectionVisit(n => n + 1); setMobileNavOpen(false); })}
            <CrumbsProvider base={crumbBase}>
            {(dashboardTab === 'work' || dashboardTab === 'done' || dashboardTab === 'check') && (
              <>
                <PageHeader
                  title={dashboardTab === 'work' ? t('nav.myWork', 'My work') : dashboardTab === 'check' ? t('nav.toCheck', 'To check') : t('nav.doneWork', 'Done')}
                  subtitle={t('dashboard.hiUser', `Hi, ${currentUserName}`, { name: currentUserName })}
                />
                <Suspense fallback={<ScreenLoading />}>
                  <WorkPanel view={dashboardTab === 'work' ? 'open' : dashboardTab} orders={ordersList} currentUser={currentUser} workflowConfig={boutiqueSettings?.workflow_config || []} tailors={tailors} fabricTaxonomy={fabricTaxonomy} onChanged={fetchDashboardAndConfig}
                              customerMessages={queuedMessages} onMarkMessageSent={handleMarkMessageSent} onRetryMessage={handleRetryMessage} />
                </Suspense>
              </>
            )}

            {dashboardTab === 'todo' && (
              <>
                <PageHeader
                  title={t('nav.todo', 'To-do')}
                  subtitle={!currentUser?.role || currentUser.role === 'Owner' || SUPERVISOR_ROLES.includes(currentUser.role)
                    ? 'Daily updates from your team'
                    : 'Your daily updates for the month'}
                />
                <Suspense fallback={<ScreenLoading />}>
                  <DailyUpdates />
                </Suspense>
              </>
            )}

            {dashboardTab === 'overview' && <OverviewPanel appointments={appointments} blankAppointmentForm={blankAppointmentForm} bookTiers={bookTiers} currentUserName={currentUserName} dashboardData={dashboardData} guideOrders={guideOrders} justRegistered={justRegistered} loading={loading} onboardingSteps={onboardingSteps} openAppointment={openAppointment} ordersList={ordersList} setAppointmentForm={setAppointmentForm} setEditingAppointment={setEditingAppointment} setInvoiceFilter={setInvoiceFilter} setOnboardingDismissed={setOnboardingDismissed} setOrdersFilterTab={setOrdersFilterTab} setOrdersStageFilter={setOrdersStageFilter} setShowAppointmentModal={setShowAppointmentModal} setTaskGuide={setTaskGuide} setView={setView} showOnboarding={showOnboarding} />}

            {/* INVENTORY TAB */}
            {dashboardTab === 'inventory' && (
              <Suspense fallback={<ScreenLoading />}>
                <InventoryPanel currentUser={currentUser} />
              </Suspense>
            )}

            {dashboardTab === 'staff' && (
              <Suspense fallback={<ScreenLoading />}>
                <StaffPanel currentUser={currentUser}
                            onlyDesigners={staffDesignersVisit !== null && staffDesignersVisit === sectionVisit}
                            onShowAllStaff={() => setStaffDesignersVisit(null)} />
              </Suspense>
            )}

            {dashboardTab === 'finance' && (
              <>
                {reportsSwitch}
                <Suspense fallback={<ScreenLoading />}>
                  <FinancePanel />
                </Suspense>
              </>
            )}

            {/* 3. MANAGE TAILORS TAB */}

            {/* 4b. DESIGN WORK TAB -- assign, submit, review. One component for
                 both ends of the loop; see features/designStudio/DesignWork. */}
            {/* 4. MANAGE DESIGNS TAB */}
            {dashboardTab === 'designs' && <DesignsPanel designLibraryToken={designLibraryToken} designsView={designsView} handleDeleteDesign={handleDeleteDesign} navTabs={navTabs} sectionVisit={sectionVisit} setDesignForm={setDesignForm} setDesignImageFile={setDesignImageFile} setDesignLibraryToken={setDesignLibraryToken} setDesignsView={setDesignsView} setEditingDesign={setEditingDesign} setSectionVisit={setSectionVisit} setShowDesignModal={setShowDesignModal} setShowDesignUpload={setShowDesignUpload} setStaffDesignersVisit={setStaffDesignersVisit} showDesignUpload={showDesignUpload} />}

            {/* Manage Orders Tab */}
            {/* One order on its own page. Everything the row used to unfold
                inline, laid out so the eye lands on the order, then who is on
                it and when it is due, then where it stands, then the work. */}
            {['orders', 'workshop'].includes(dashboardTab) && openOrder && (
              <Suspense fallback={<ScreenLoading />}>
                <Crumbs level={3} items={[{ label: orderRef(openOrder) }]} />
                <OrderDetailPanel assignOrderDesigner={assignOrderDesigner} assigningWorkflowOrderId={assigningWorkflowOrderId} completingAllOrderId={completingAllOrderId} designerInCharge={designerInCharge} designers={designers} handleMarkMessageSent={handleMarkMessageSent} handleRetryMessage={handleRetryMessage} openAlteration={openAlteration} openDirectoryCustomer={openDirectoryCustomer} openGarmentJob={openGarmentJob} openOrder={openOrder} openSendToWorkshop={openSendToWorkshop} openStageReview={openStageReview} queuedMessages={queuedMessages} savingVerificationOrderId={savingVerificationOrderId} sendBusy={sendBusy} sendErrorsOrderId={sendErrorsOrderId} setCompletingAllOrderId={setCompletingAllOrderId} setOpenOrdersRowId={setOpenOrdersRowId} setReviewView={setReviewView} setSavingVerificationOrderId={setSavingVerificationOrderId} setSendErrorsOrderId={setSendErrorsOrderId} />
              </Suspense>
            )}

            {['orders', 'workshop'].includes(dashboardTab) && !openOrder && (
              <Suspense fallback={<ScreenLoading />}>
                <OrdersPanel guideOrders={guideOrders} openAlteration={openAlteration} openSendToWorkshop={openSendToWorkshop} openStageReview={openStageReview} orderMatchesFilters={orderMatchesFilters} ordersAlterationOrder={ordersAlterationOrder} ordersFilterTab={ordersFilterTab} ordersGarmentFilter={ordersGarmentFilter} ordersList={ordersList} ordersSearch={ordersSearch} ordersStageFilter={ordersStageFilter} ordersTierFilter={ordersTierFilter} ordersTypeFilter={ordersTypeFilter} ordersView={ordersView} ordersKind={ordersKind} setOrdersKind={setOrdersKind} ordersPageSize={ordersPageSize} setOrdersPageSize={setOrdersPageSize} ordersListPage={ordersListPage} goToOrdersPage={goToOrdersPage} queuedMessages={queuedMessages} rememberAlteration={rememberAlteration} sendBusy={sendBusy} setOpenGarmentJob={setOpenGarmentJob} setOpenOrdersRowId={setOpenOrdersRowId} setOrdersAlterationOrder={setOrdersAlterationOrder} setOrdersFilterTab={setOrdersFilterTab} setOrdersGarmentFilter={setOrdersGarmentFilter} setOrdersSearch={setOrdersSearch} setOrdersStageFilter={setOrdersStageFilter} setOrdersTierFilter={setOrdersTierFilter} setOrdersTypeFilter={setOrdersTypeFilter} setOrdersView={setOrdersView} setView={setView} />
              </Suspense>
            )}

            {/* 5. CUSTOMERS TAB */}
            {(dashboardTab === 'customers' || dashboardTab === 'leads') && editingCustomer && (
              <>
              {/* Edited from their page, the name above goes back to it. */}
              {selectedDirectoryCustomer?.id === editingCustomer.id
                ? <Crumbs level={4} items={[{ label: t('common.edit', 'Edit') }]} />
                : <Crumbs level={3} items={[{ label: customerName(editingCustomer) }, { label: t('common.edit', 'Edit') }]} />}
              <CustomerForm key={editingCustomer.id} customer={editingCustomer}
                            onBack={() => setEditingCustomer(null)}
                            onSaved={async () => {
                              const id = editingCustomer.id;
                              setEditingCustomer(null);
                              await fetchDashboardAndConfig();
                              if (selectedDirectoryCustomer?.id === id) {
                                const full = await api.getCustomer(id).catch(() => null);
                                if (full) setSelectedDirectoryCustomer(full);
                              }
                            }} />
              </>
            )}
            {deletingAllCustomers && (
              <DeleteAllCustomersDialog total={bookTotal}
                                        onClose={() => setDeletingAllCustomers(false)}
                                        onDeleted={() => fetchDashboardAndConfig()} />
            )}
            {(dashboardTab === 'customers' || dashboardTab === 'leads') && !editingCustomer && !selectedDirectoryCustomer && customerAddMode === 'import' && (
              <>
              <Crumbs level={3} items={[{ label: 'Import customers' }]} />
              <AddCustomerChooser onBack={() => setCustomerAddMode(null)}
                                  onImported={() => fetchDashboardAndConfig()} />
              </>
            )}
            {(dashboardTab === 'customers' || dashboardTab === 'leads') && !editingCustomer && !selectedDirectoryCustomer && customerAddMode === 'manual' && (
              <>
              <Crumbs level={3} items={[{ label: 'New customer' }]} />
              <CustomerForm onBack={() => setCustomerAddMode(null)}
                            onSaved={async () => { await fetchDashboardAndConfig(); setCustomerAddMode(null); }} />
              </>
            )}
            {(dashboardTab === 'customers' || dashboardTab === 'leads') && !editingCustomer && !selectedDirectoryCustomer && !customerAddMode && (
              <Suspense fallback={<ScreenLoading />}>
                <CustomersPanel bookSummary={bookSummary} bookTotal={bookTotal} canAddCustomer={canAddCustomer} canDeleteCustomer={canDeleteCustomer} canEditCustomer={canEditCustomer} canImportCustomers={canImportCustomers} customerActionId={customerActionId} customerDirectory={customerDirectory} customerFilters={customerFilters} customerPageCount={customerPageCount} customerPageFrom={customerPageFrom} customerPageNow={customerPageNow} customerPageSize={customerPageSize} customerView={customerView} directoryCount={directoryCount} directoryData={directoryData} directoryLoading={directoryLoading} goToCustomerPage={goToCustomerPage} guideCustomers={guideCustomers} handleDeleteCustomer={handleDeleteCustomer} handleMarkLeadContacted={handleMarkLeadContacted} handleStartNewCustomer={handleStartNewCustomer} openDirectoryCustomer={openDirectoryCustomer} pagedCustomers={pagedCustomers} searchQuery={searchQuery} setCustomerAddMode={setCustomerAddMode} setCustomerFilters={setCustomerFilters} setCustomerPageSize={setCustomerPageSize} setDeletingAllCustomers={setDeletingAllCustomers} setDirectoryVersion={setDirectoryVersion} setSearchQuery={setSearchQuery} startEditCustomer={startEditCustomer} />
              </Suspense>
            )}

            {styleNotesFor && (
              <FormModal icon={Sparkles} tone="amber" width="600px"
                         title={`${styleNotesFor.first_name || ''} ${styleNotesFor.last_name || ''}`.trim()}
                         subtitle={t('customersPage.bespokeProfile')}
                         onClose={() => setStyleNotesFor(null)}>
                <StyleProfileCard customer={styleNotesFor} />
              </FormModal>
            )}

            {/* 5b. CUSTOMER DETAIL VIEW (Image 5/6 extension) */}
            {(dashboardTab === 'customers' || dashboardTab === 'leads') && selectedDirectoryCustomer && (
              <Suspense fallback={<ScreenLoading />}>
                <Crumbs level={3} items={[{ label: customerName(selectedDirectoryCustomer), onClick: () => setEditingCustomer(null) }]} />
                <CustomerDetailPanel alterationOrder={alterationOrder} approvingDesignId={approvingDesignId} beginOrderForCustomer={beginOrderForCustomer} customerActionId={customerActionId} customerPhotoBusy={customerPhotoBusy} directoryDetailLoading={directoryDetailLoading} expandedCustomerOrderId={expandedCustomerOrderId} handleApproveDesign={handleApproveDesign} handleDeleteCustomer={handleDeleteCustomer} handleSelectExistingCustomer={handleSelectExistingCustomer} isLead={isLead} openAlteration={openAlteration} openDirectoryCustomer={openDirectoryCustomer} openStageReview={openStageReview} orderTypeFor={orderTypeFor} refreshCustomerBook={refreshCustomerBook} rememberAlteration={rememberAlteration} selectedDirectoryCustomer={selectedDirectoryCustomer} setAlterationOrder={setAlterationOrder} setDesignNotes={setDesignNotes} setExpandedCustomerOrderId={setExpandedCustomerOrderId} setOrderTypeFor={setOrderTypeFor} setQuotePrices={setQuotePrices} setViewAllCustomerMeasurements={setViewAllCustomerMeasurements} startEditCustomer={startEditCustomer} uploadDirectoryCustomerPhoto={uploadDirectoryCustomerPhoto} viewAllCustomerMeasurements={viewAllCustomerMeasurements} />
              </Suspense>
            )}

            {/* 6. INVOICES TAB */}

            {dashboardTab === 'invoices' && (
              <Suspense fallback={<ScreenLoading />}>
                <InvoicesPanel invoiceFilter={invoiceFilter} invoiceSearch={invoiceSearch} ordersList={ordersList} paymentError={paymentError} savingPaymentId={savingPaymentId} setConfirmedOrder={setConfirmedOrder} setInvoiceFilter={setInvoiceFilter} setInvoiceSearch={setInvoiceSearch} setPaymentError={setPaymentError} setSavingPaymentId={setSavingPaymentId} setShowInvoiceModal={setShowInvoiceModal} />
              </Suspense>
            )}

            {/* 7. ANALYTICS TAB */}
            {dashboardTab === 'analytics' && (
              <>
                {reportsSwitch}
                <Suspense fallback={<ScreenLoading />}>
                  <InsightsPanel ordersList={ordersList} tailors={tailors} bookTotal={bookTotal}
                                 bookTiers={bookTiers} dashboardData={dashboardData} />
                </Suspense>
              </>
            )}

            {/* 8. MY ACCOUNT SETTINGS TAB */}
            {dashboardTab === 'account' && (
              <Suspense fallback={<ScreenLoading />}>
                <AccountPanel boutiqueAutosave={boutiqueAutosave} boutiqueFormError={boutiqueFormError} boutiqueFormRef={boutiqueFormRef} finishStaffSetup={finishStaffSetup} logoFile={logoFile} pickLogo={pickLogo} saveBoutiqueForm={saveBoutiqueForm} setBoutiqueSettings={setBoutiqueSettings} setCurrentUser={setCurrentUser} setLogoFile={setLogoFile} setSettingsSaving={setSettingsSaving} settingsSaving={settingsSaving} staffSetup={staffSetup} />
              </Suspense>
            )}

            {/* 9. SETTINGS TAB */}
            {dashboardTab === 'settings' && (
              <SettingsPage
                currentUser={currentUser}
                boutiqueSettings={boutiqueSettings}
                onTierNamesSaved={(names) => setBoutiqueSettings((prev) => ({ ...(prev || {}), tier_names: names }))}
                whatsappStatus={whatsappStatus}
                fetchWhatsAppStatus={fetchWhatsAppStatus}
              />
            )}
            </CrumbsProvider>
          </main>

          {/* Appointment booking. apps/scheduling has always accepted these and
              the customer's tracking page already renders a trial card from
              them; there was simply no way to create one from the product. */}
          {showAppointmentModal && <AppointmentModal appointmentDateRef={appointmentDateRef} appointmentForm={appointmentForm} closeAppointmentModal={closeAppointmentModal} editingAppointment={editingAppointment} handleCancelAppointment={handleCancelAppointment} handleSaveAppointment={handleSaveAppointment} savingAppointment={savingAppointment} setAppointmentForm={setAppointmentForm} tailors={tailors} />}

          {/* Designs CRUD Modal Overlay */}
          {showDesignModal && <DesignFormModal designForm={designForm} designImageFile={designImageFile} designSaving={designSaving} editingDesign={editingDesign} handleSaveDesign={handleSaveDesign} setDesignForm={setDesignForm} setDesignImageFile={setDesignImageFile} setShowDesignModal={setShowDesignModal} />}

          {/* Bottom navigation, phones only.
              It belongs to this view, not the order selector it was originally
              written into: its tabs drive dashboardTab, which only the dashboard
              renders, so from anywhere else every tab was inert.
              No "Menu" tab: MobileHeader's hamburger already opens the drawer. */}
          <BottomNavigation
            tabs={navSections.flatMap((s) => s.items).filter((i) => i.phone)
              .map((i) => ({ key: i.tab, label: i.phoneLabel || i.label, icon: i.icon }))}
            activeTab={dashboardTab}
            onChangeTab={(tab) => { setDashboardTab(tab); setSelectedDirectoryCustomer(null); setEditingCustomer(null); }}
          />
          {/* Mounted only while open, so it always starts at the welcome. */}
          {tourOpen && <ProductTour open user={currentUser} menu={tourMenu} onMenu={setMobileNavOpen}
                                    onClose={(how) => { if (how?.skipped) markTourSeen(currentUser, dashboardTab); setTourOpen(false); }} />}
          {pageTourOpen && <ProductTour key={pageTour} open page={pageTour} user={currentUser} menu={tourMenu}
                                        onClose={(how) => { if (how?.empty) pageTourEmpty.current.add(pageTour); setPageTour(null); }} />}
        </div>
      )}

    </>
  );
}
