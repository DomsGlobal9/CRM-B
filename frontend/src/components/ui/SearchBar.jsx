import { Search, X } from 'lucide-react';
import './searchBar.css';

/**
 * The one search bar: the icon, the input and a clear button while something is
 * typed. `onChange` receives the text. `size="sm"` is the compact one for pickers
 * and filter rows; `style` and `className` only place it on the page. `onClear`
 * replaces the default clear, which is `onChange('')`.
 */
export function SearchBar({ value, onChange, placeholder, ariaLabel, size, className = '', style, autoFocus, onClear, clearLabel = 'Clear search' }) {
  const classes = ['at-search', size === 'sm' && 'at-search--sm', className].filter(Boolean).join(' ');
  return (
    <div className={classes} style={style}>
      <Search size={size === 'sm' ? 14 : 15} aria-hidden="true" />
      <input type="search" value={value} onChange={(e) => onChange(e.target.value)}
             placeholder={placeholder} aria-label={ariaLabel || placeholder} autoFocus={autoFocus} />
      {value && (
        <button type="button" className="at-search-clear" aria-label={clearLabel} title={clearLabel}
                onClick={() => (onClear ? onClear() : onChange(''))}>
          <X size={14} />
        </button>
      )}
    </div>
  );
}
