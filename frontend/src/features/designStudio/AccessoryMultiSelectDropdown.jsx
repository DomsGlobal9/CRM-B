import { useEffect, useRef, useState } from 'react';
import { ACCESSORY_OPTIONS } from '../catalog/accessories';

/** Choosing several accessories in the part picker. */

export default function AccessoryMultiSelectDropdown({
  options = ACCESSORY_OPTIONS,
  selectedKeys = [],
  onToggleKey,
  activeKey,
  onSelectActiveKey,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedCount = selectedKeys.length;

  return (
    <div style={{ marginBottom: '16px', position: 'relative' }} ref={dropdownRef}>
      <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
        Select Accessories (Choose one or more options):
      </label>

      {/* Multi-Select Dropdown Header */}
      <button
        type="button"
        className="form-control"
        onClick={() => setIsOpen((v) => !v)}
        style={{
          width: '100%',
          maxWidth: '420px',
          padding: '8px 12px',
          fontSize: '13px',
          fontWeight: 600,
          borderRadius: '8px',
          border: '1.5px solid var(--border-color, #d1d5db)',
          background: 'var(--surface-color, #fff)',
          color: 'var(--text-primary)',
          cursor: 'pointer',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          textAlign: 'left',
        }}
      >
        <span>
          {selectedCount === 0
            ? 'Select accessories from dropdown...'
            : `${selectedCount} Accessor${selectedCount === 1 ? 'y' : 'ies'} Selected`}
        </span>
        <span style={{ fontSize: '11px', opacity: 0.7 }}>{isOpen ? '▲' : '▼'}</span>
      </button>

      {/* Dropdown Menu Overlay */}
      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            zIndex: 99,
            width: '100%',
            maxWidth: '420px',
            marginTop: '4px',
            maxHeight: '260px',
            overflowY: 'auto',
            background: 'var(--surface-color, #ffffff)',
            border: '1.5px solid var(--border-color, #d1d5db)',
            borderRadius: '8px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
            padding: '8px',
          }}
        >
          {options.map((opt) => {
            const isChecked = selectedKeys.includes(opt.key);
            return (
              <label
                key={opt.key}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '6px 10px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '12.5px',
                  fontWeight: isChecked ? 600 : 400,
                  background: isChecked ? 'rgba(16, 124, 65, 0.08)' : 'transparent',
                  color: isChecked ? 'var(--primary-color)' : 'var(--text-primary)',
                  marginBottom: '2px',
                }}
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => onToggleKey(opt.key)}
                  style={{ width: '15px', height: '15px', accentColor: 'var(--primary-color)', cursor: 'pointer' }}
                />
                <span>{opt.label}</span>
              </label>
            );
          })}
        </div>
      )}

      {/* Selected Accessories Pills/Tabs */}
      {selectedKeys.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '10px' }}>
          {selectedKeys.map((key) => {
            const opt = options.find((o) => o.key === key);
            if (!opt) return null;
            const isActive = activeKey === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => onSelectActiveKey(key)}
                style={{
                  padding: '4px 10px',
                  borderRadius: '16px',
                  border: isActive ? '1.5px solid var(--primary-color)' : '1px solid var(--border-color)',
                  background: isActive ? 'var(--primary-color)' : 'var(--surface-color, #f3f4f6)',
                  color: isActive ? '#fff' : 'var(--text-primary)',
                  fontSize: '11.5px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <span>{opt.label}</span>
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleKey(key);
                  }}
                  style={{ opacity: 0.8, fontSize: '11px', fontWeight: 700, padding: '0 2px' }}
                  title="Remove accessory"
                >
                  ✕
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
