import { Fragment, useEffect, useRef } from 'react';
import { ChevronDown, ChevronUp, ChevronsUpDown } from 'lucide-react';
import { ClampedText, EmptyState } from './Atelier';
import { LoaderRows } from './Loader';
import { Pager } from './Pager';

const INTERACTIVE = 'a, button, input, select, textarea, label, [role="menuitem"]';

const keyOf = (row, rowKey) => (typeof rowKey === 'function' ? rowKey(row) : row[rowKey]);

/** The buttons at the end of a row. */
export function TableActions({ children, className = '' }) {
  return <div className={`at-table-actions ${className}`}>{children}</div>;
}

function SelectAll({ ids, selected, onSelect, label }) {
  const ref = useRef(null);
  const count = ids.filter((id) => selected.includes(id)).length;
  const all = ids.length > 0 && count === ids.length;
  useEffect(() => { if (ref.current) ref.current.indeterminate = count > 0 && !all; }, [count, all]);
  return (
    <input ref={ref} type="checkbox" aria-label={label} checked={all} disabled={!ids.length}
           onChange={() => onSelect(all
             ? selected.filter((id) => !ids.includes(id))
             : [...new Set([...selected, ...ids])])} />
  );
}

const cellClass = (column, extra = '') => [
  column.align && `at-cell--${column.align}`,
  column.numeric && 'at-cell--right at-cell--num',
  column.className,
  extra,
].filter(Boolean).join(' ') || undefined;

/**
 * The one table. It renders the existing .at-table markup, so it looks like
 * every table already on that recipe, and it owns no data: rows, sort order,
 * selection and page all stay with the screen.
 *
 * columns: { key, header, render(row, i), align: 'center' | 'right', numeric,
 *            sortable, sortValue(row), clamp: lines, maxWidth, width, label,
 *            className, cellClassName, cellProps(row, i), headerProps }
 *   A false entry is skipped, so `isOwner && { ... }` hides a column.
 *   `cellProps` adds attributes to one cell: a title, a style, a colSpan;
 *   `headerProps` does the same for the column's heading.
 *   `label` names a column on the stacked phone layout when `header` is not
 *   plain text; `false` leaves it unnamed there. `clamp` cuts long text with
 *   <ClampedText> at `maxWidth`. `className` is for the header and the cells,
 *   `cellClassName` for the cells alone.
 *
 * sort / onSort:        { key, dir: 'asc' | 'desc' } and onSort(nextSort)
 * selected / onSelect:  an array of row keys and onSelect(nextKeys)
 * onRowClick(row):      the row opens on click and on Enter; controls inside
 *                       the row keep their own clicks
 * actions(row):         the last column, kept in view when the table scrolls;
 *                       actionsHeader names it on screen (hidden text otherwise)
 * rowDetail(row):        a full-width row under this one when it returns content,
 *                       for rows that open up; it stays in view when the table
 *                       scrolls sideways
 * rowProps(row, i):      extra attributes for the row, such as aria-expanded
 * pager:                props for <Pager>, drawn under the table
 * loading:              placeholder rows on first load; existing rows dim on a refresh
 * error, errorAction:   replaces the rows with an error state
 * empty:                { title, detail, action, icon } or any node, for no rows
 * tableStyle:           style on the <table> itself, such as a smaller minWidth
 * lines:                a small list inside a card (a summary, the payments on a
 *                       bill): no headings, no frame, rows split by a line
 * fit:                  stack rows into cards below 1024px (default). Pass false
 *                       for a wide table that should scroll sideways instead.
 * labels:               reworded or translated text: { sortBy, ascending,
 *                       descending, selectAll, selectRow(row), actions, loading,
 *                       noRows }
 *
 * For a table too custom for columns, leave `columns` out and pass <thead> and
 * <tbody> as children: the frame, classes and pager still apply.
 */
export function DataTable({
  columns, rows = [], rowKey = 'id', caption, sort, onSort,
  selected, onSelect, onRowClick, rowClassName, actions, actionsHeader, rowDetail, rowProps,
  tableStyle, lines = false, pager, loading = false, loadingRows = 5, error, errorAction, empty,
  fit: fitProp = true, labels = {}, className = '', wrapClassName = '', tableClassName = '', children,
}) {
  const text = {
    sortBy: 'Sort by', ascending: 'Ascending', descending: 'Descending', selectAll: 'Select all',
    selectRow: () => 'Select row', actions: 'Actions', loading: 'Loading', noRows: 'Nothing to show yet.',
    ...labels,
  };
  const fit = fitProp && !lines;
  const cols = columns ? columns.filter(Boolean) : null;
  const selectable = Boolean(onSelect);
  const chosen = selected || [];
  const ids = rows.map((row) => keyOf(row, rowKey));
  const sortable = (cols || []).filter((c) => c.sortable && onSort);
  const span = (cols?.length || 0) + (selectable ? 1 : 0) + (actions ? 1 : 0);

  const nextSort = (key) => ({ key, dir: sort?.key === key && sort.dir === 'asc' ? 'desc' : 'asc' });
  const toggleRow = (id) => onSelect(chosen.includes(id) ? chosen.filter((x) => x !== id) : [...chosen, id]);

  const statusRow = (content) => (
    <tr className="at-row--status"><td colSpan={span}>{content}</td></tr>
  );
  let status = null;
  if (error) {
    status = statusRow(<EmptyState error compact title={error} action={errorAction} />);
  } else if (loading && !rows.length) {
    status = statusRow(<LoaderRows rows={loadingRows} label={text.loading} />);
  } else if (!rows.length) {
    status = statusRow(empty && !empty.title && !empty.detail
      ? empty
      : <EmptyState compact title={empty?.title || text.noRows} detail={empty?.detail} action={empty?.action} icon={empty?.icon} />);
  }

  const tableClasses = [
    'at-table', fit && 'at-table--fit', lines && 'at-table--lines', loading && rows.length > 0 && 'at-table--busy', tableClassName,
  ].filter(Boolean).join(' ');

  const openRow = (row) => (e) => {
    if (e.target.closest(INTERACTIVE)) return;
    if (e.type === 'keydown' && e.key !== 'Enter') return;
    onRowClick(row);
  };

  return (
    <div className={`at-table-block${fit ? ' at-table-block--fit' : ''} ${className}`}>
      {/* Stacked rows have no header row, so its controls move up here. */}
      {fit && cols && (sortable.length > 0 || (selectable && rows.length > 0)) && (
        <div className="at-table-bar">
          {selectable && (
            <label>
              <SelectAll ids={ids} selected={chosen} onSelect={onSelect} label={text.selectAll} />
              {text.selectAll}
            </label>
          )}
          {sortable.length > 0 && (
            <label>
              {text.sortBy}
              <select className="form-control" value={sort?.key || ''}
                      onChange={(e) => onSort({ key: e.target.value, dir: sort?.dir || 'asc' })}>
                {!sort?.key && <option value="" />}
                {sortable.map((c) => <option key={c.key} value={c.key}>{c.label || c.header}</option>)}
              </select>
            </label>
          )}
          {sortable.length > 0 && sort?.key && (
            <button type="button" className="btn-secondary at-btn-sm" onClick={() => onSort(nextSort(sort.key))}>
              {sort.dir === 'desc' ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
              {sort.dir === 'desc' ? text.descending : text.ascending}
            </button>
          )}
        </div>
      )}
      <div className={`at-table-wrap${rowDetail ? ' at-table-wrap--details' : ''}${lines ? ' at-table-wrap--lines' : ''} ${wrapClassName}`}>
        <table className={tableClasses} style={tableStyle} aria-busy={loading || undefined}>
          {caption && <caption className="ld-sr">{caption}</caption>}
          {cols ? (
            <>
              {!lines && <thead>
                <tr>
                  {selectable && (
                    <th scope="col" className="at-cell--check">
                      <SelectAll ids={ids} selected={chosen} onSelect={onSelect} label={text.selectAll} />
                    </th>
                  )}
                  {cols.map((column) => {
                    const canSort = column.sortable && onSort;
                    const active = sort?.key === column.key;
                    let ariaSort;
                    if (canSort) ariaSort = !active ? 'none' : sort.dir === 'desc' ? 'descending' : 'ascending';
                    const Arrow = !active ? ChevronsUpDown : sort.dir === 'desc' ? ChevronDown : ChevronUp;
                    return (
                      <th key={column.key} scope="col" className={cellClass(column)} aria-sort={ariaSort}
                          style={column.width ? { width: column.width } : undefined} {...column.headerProps}>
                        {canSort ? (
                          <button type="button" className="at-sort" onClick={() => onSort(nextSort(column.key))}>
                            {column.header}<Arrow size={13} aria-hidden="true" />
                          </button>
                        ) : column.header}
                      </th>
                    );
                  })}
                  {actions && (
                    <th scope="col" className="at-cell--actions">
                      {actionsHeader ?? <span className="ld-sr">{text.actions}</span>}
                    </th>
                  )}
                </tr>
              </thead>}
              <tbody>
                {status || rows.map((row, i) => {
                  const id = ids[i];
                  const isChosen = selectable && chosen.includes(id);
                  const rowClasses = [
                    onRowClick && 'at-row--tap', isChosen && 'at-row--selected', rowClassName?.(row, i),
                  ].filter(Boolean).join(' ') || undefined;
                  const detail = rowDetail?.(row, i);
                  return (
                    <Fragment key={id}>
                      <tr {...rowProps?.(row, i)} className={rowClasses}
                          onClick={onRowClick ? openRow(row) : undefined}
                          onKeyDown={onRowClick ? openRow(row) : undefined}
                          tabIndex={onRowClick ? 0 : undefined}>
                        {selectable && (
                          <td className="at-cell--check">
                            <input type="checkbox" aria-label={text.selectRow(row)} checked={isChosen} onChange={() => toggleRow(id)} />
                          </td>
                        )}
                        {cols.map((column) => {
                          const value = column.render ? column.render(row, i) : row[column.key];
                          const label = column.label === false ? undefined
                            : column.label || (typeof column.header === 'string' ? column.header : undefined);
                          return (
                            <td key={column.key} className={cellClass(column, column.cellClassName)} data-label={label}
                                {...column.cellProps?.(row, i)}>
                              {column.clamp ? (
                                <ClampedText lines={column.clamp} focusable={!onRowClick}
                                             className={column.maxWidth ? undefined : 'at-table-clamp'}
                                             style={column.maxWidth ? { maxWidth: column.maxWidth } : undefined}>
                                  {value}
                                </ClampedText>
                              ) : (value ?? '—')}
                            </td>
                          );
                        })}
                        {actions && <td className="at-cell--actions"><TableActions>{actions(row, i)}</TableActions></td>}
                      </tr>
                      {detail && (
                        <tr className="at-row--detail">
                          <td colSpan={span} className="at-row-detail-cell">
                            <div className="at-row-detail">{detail}</div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </>
          ) : children}
        </table>
      </div>
      {pager && <Pager {...pager} />}
    </div>
  );
}
