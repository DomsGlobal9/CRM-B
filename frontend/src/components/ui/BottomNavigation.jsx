export function BottomNavigation({ tabs, activeTab, onChangeTab }) {
  return (
    <nav className="mobile-bottom-nav">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.key;
        return (
          <button
            key={tab.key}
            type="button"
            className={`mobile-bottom-nav-item ${isActive ? 'active' : ''}`}
            data-tour={tab.key}
            onClick={() => onChangeTab(tab.key)}
          >
            <Icon size={20} />
            <span className="bottom-nav-label">{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
