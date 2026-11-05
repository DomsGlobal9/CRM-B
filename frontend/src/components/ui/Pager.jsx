import { ArrowLeft, ArrowRight } from 'lucide-react';

const pageNumbers = (page, count) => {
  const pages = [...new Set([1, page - 1, page, page + 1, count])].filter((n) => n >= 1 && n <= count).sort((a, b) => a - b);
  return pages.flatMap((n, i) => (i && n - pages[i - 1] > 1 ? [`gap-${n}`, n] : [n]));
};

/**
 * `total` adds "Showing 1–25 of 120" (`totalLabel` rewords it). `sizes` and
 * `onSize` may be left out where a list has one fixed page size.
 * `hideSinglePage` hides the whole bar when everything fits on one page.
 */
export function Pager({ page, pageCount, pageSize, sizes, onPage, onSize, label = 'Per page', total, totalLabel, hideSinglePage = false }) {
  if (hideSinglePage && pageCount <= 1) return null;
  const sizePicker = sizes && onSize && (
    <label className="at-pager-size">
      {label}
      <select className="form-control" value={pageSize} onChange={(e) => onSize(Number(e.target.value))}>
        {sizes.map((n) => <option key={n} value={n}>{n}</option>)}
      </select>
    </label>
  );
  let totalText = null;
  if (total != null) {
    const from = total === 0 ? 0 : (page - 1) * (pageSize || 0) + 1;
    const to = pageSize ? Math.min(page * pageSize, total) : total;
    totalText = totalLabel ? totalLabel({ from, to, total }) : `Showing ${from}–${to} of ${total}`;
  }
  return (
    <nav className="at-pager" aria-label="Pages">
      {totalText != null
        ? <div className="at-pager-left"><span className="at-pager-total">{totalText}</span>{sizePicker}</div>
        : sizePicker}
      <div className="at-pager-pages">
        <button type="button" className="btn-secondary at-btn-sm" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page">
          <ArrowLeft size={14} /> Prev
        </button>
        {pageNumbers(page, pageCount).map((n) => (typeof n === 'string'
          ? <span key={n} className="at-pager-gap">…</span>
          : (
            <button key={n} type="button" aria-current={n === page ? 'page' : undefined}
                    className={`at-pager-num${n === page ? ' at-pager-num--on' : ''}`} onClick={() => onPage(n)}>
              {n}
            </button>
          )))}
        <button type="button" className="btn-secondary at-btn-sm" disabled={page >= pageCount} onClick={() => onPage(page + 1)} aria-label="Next page">
          Next <ArrowRight size={14} />
        </button>
      </div>
    </nav>
  );
}
