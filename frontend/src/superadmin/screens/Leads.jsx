/**
 * Demo requests from the marketing site.
 *
 * Status and notes are the only writable fields, matching the server: everything
 * else on a lead was typed by a stranger and is the evidence of what they
 * actually sent, so a careless PATCH must not be able to rewrite it. The server
 * enforces that (LeadSerializer.read_only_fields); this screen simply does not
 * offer the inputs.
 */

import { useCallback, useState } from 'react';
import { Check, Mail } from 'lucide-react';

import { consoleApi } from '../api';
import { LIMITS } from '../../services/validate';
import { Async, Empty, PageHeader, Select, day, useApi, useToast } from '../ui';

const STATUSES = ['NEW', 'CONTACTED', 'QUALIFIED', 'CONVERTED', 'DECLINED'];
// The server speaks in codes ('CONTACTED'); people read sentence case.
const STATUS_OPTIONS = STATUSES.map((s) => ({ value: s, label: s[0] + s.slice(1).toLowerCase() }));

export default function Leads() {
  const toast = useToast();
  const [saving, setSaving] = useState(null);
  const [saved, setSaved] = useState(null);

  const state = useApi(useCallback(() => consoleApi.leads(), []));

  const save = async (lead, fields) => {
    setSaving(lead.id);
    try {
      const updated = await consoleApi.updateLead(lead.id, fields);
      // Patch in place rather than refetching: the administrator is working
      // down a list and a reload would jump them back to the top of it.
      state.data.splice(state.data.indexOf(lead), 1, updated);
      setSaved(lead.id);
      setTimeout(() => setSaved((id) => (id === lead.id ? null : id)), 2000);
      toast('Lead updated.');
    } catch (e) {
      toast(e.message, 'off');
    } finally {
      setSaving(null);
    }
  };

  return (
    <>
      <PageHeader
        title="Demo requests"
        subtitle="People who asked for a demo on scaleezy.com. Status and notes are yours to edit."
      />

      <Async
        state={state}
        isEmpty={(rows) => (rows.results || rows).length === 0}
        empty={<Empty icon={<Mail size={20} />} title="No demo requests yet."
          detail="Leads arrive from the form on the marketing site and land here." />}
      >
        {(data) => {
          const leads = data.results || data;
          // The cell classes below size the columns rather than decorate them:
          // without them a long "what they said" takes the whole row, the date
          // breaks over three lines and the notes box shrinks to a sliver.
          // superadmin.css caps the prose column on desktop only, so stacked
          // (<=1024px) it fills the card like every other cell.
          return (
            <div className="at-table-wrap">
              <table className="at-table at-table--fit">
                <thead>
                  <tr>
                    <th scope="col">Received</th><th scope="col">Who</th><th scope="col">Contact</th>
                    <th scope="col">What they said</th><th scope="col">Status</th><th scope="col">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {leads.map((lead) => (
                    <tr key={lead.id}>
                      <td data-label="Received" className="sa-nowrap">
                        {day(lead.created_at)}
                      </td>
                      <td data-label="Who">
                        <div className="at-row-title">{lead.name}</div>
                        <div className="at-row-sub">{lead.boutique}</div>
                      </td>
                      <td data-label="Contact">
                        <div>{lead.email}</div>
                        <div className="at-row-sub">{lead.phone}</div>
                      </td>
                      <td data-label="What they said" className="sa-col-prose">
                        {lead.problem || <span className="sa-muted">—</span>}
                        {(lead.makes || lead.orders_per_month || lead.people) && (
                          <div className="at-row-sub">
                            {[lead.makes,
                              lead.orders_per_month && `${lead.orders_per_month}/mo`,
                              lead.people && `${lead.people} people`].filter(Boolean).join(' · ')}
                          </div>
                        )}
                      </td>
                      <td data-label="Status">
                        <div className="sa-inline">
                          {/* sa-compact without form-control: sized to its
                              longest option, so the column cannot crush it.
                              No badge beside it: it would only repeat the
                              select's own value. */}
                          <Select className="sa-compact" label="Status" value={lead.status}
                            disabled={saving === lead.id} options={STATUS_OPTIONS}
                            onChange={(status) => save(lead, { status })} />
                          {saved === lead.id && <Check size={14} className="sa-text-ok" />}
                        </div>
                      </td>
                      <td data-label="Notes" className="sa-col-note">
                        <textarea className="form-control sa-compact" aria-label="Notes"
                          defaultValue={lead.notes} maxLength={LIMITS.note}
                          disabled={saving === lead.id} placeholder="Add a note…"
                          // Saved on blur, not per keystroke: one PATCH when the
                          // administrator moves on, not one per character.
                          onBlur={(e) => {
                            if (e.target.value !== lead.notes) save(lead, { notes: e.target.value });
                          }} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }}
      </Async>
    </>
  );
}
