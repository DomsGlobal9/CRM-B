import { ArrowLeft, ArrowRight } from 'lucide-react';

const pageNumbers = (page, count) => {
  const pages = [...new Set([1, page - 1, page, page + 1, count])].filter((n) => n >= 1 && n <= count).sort((a, b) => a - b);
  return pages.flatMap((n, i) => (i && n - pages[i - 1] > 1 ? [`gap-${n}`, n] : [n]));
};

export function Pager({ page, pageCount, pageSize, sizes, onPage, onSize, label = 'Per page' }) {
  return (
    <nav className="at-pager" aria-label="Pages">
      <label className="at-pager-size">
        {label}
        <select className="form-control" value={pageSize} onChange={(e) => onSize(Number(e.target.value))}>
          {sizes.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </label>
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
