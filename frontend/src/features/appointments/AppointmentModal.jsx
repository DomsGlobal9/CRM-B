import { X } from 'lucide-react';
import { LIMITS, cleanMobile, cleanName } from '../../services/validate';
import CustomerPicker from '../customers/CustomerPicker';
import { APPOINTMENT_STATUS_LABELS, APPOINTMENT_TYPE_LABELS } from './appointments';
import { todayIso } from '../../services/dates';
import { formatDateTime as fmtDateTime } from '../../services/format';
import { useLanguage } from '../../i18n/LanguageContext.jsx';

/**
 * Book an appointment (consultation, measurement, trial, delivery), or open
 * one already booked to change its time, who it is with, or its status.
 */
export default function AppointmentModal({ appointmentDateRef, appointmentForm, closeAppointmentModal, editingAppointment, handleCancelAppointment, handleSaveAppointment, savingAppointment, setAppointmentForm, tailors }) {
  const { t } = useLanguage();
  return (
    <div className="existing-customer-search-modal apt-modal" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100 }}>
      <div className="search-modal-card apt-card">
        <div className="search-modal-header apt-head">
          <h3>
            {editingAppointment
              ? t('dashboard.appointmentDetails', 'Appointment Details')
              : t('dashboard.bookAppointment', 'Book an Appointment')}
          </h3>
          <button className="close-btn" onClick={closeAppointmentModal}><X size={20} /></button>
        </div>
        <form onSubmit={handleSaveAppointment} className="apt-form">
          <div>
            <label className="form-label">Client *</label>
            {/* Whose appointment this is cannot be edited -- moving it
                to another person is a different booking. So the
                existing/new chooser is only on a fresh booking. */}
            {!editingAppointment && (
              <div className="apt-seg">
                {[[false, 'Existing client'], [true, 'New client']].map(([isNew, label]) => (
                  <button key={label} type="button"
                          className={appointmentForm.isNewCustomer === isNew ? 'btn-primary' : 'btn-secondary'}
                          onClick={() => setAppointmentForm({
                            ...appointmentForm, isNewCustomer: isNew, customer: '' })}>
                    {label}
                  </button>
                ))}
              </div>
            )}
            {appointmentForm.isNewCustomer && !editingAppointment ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div className="form-grid-2">
                  <input className="form-control" placeholder="First name *" required
                         maxLength={LIMITS.name} value={appointmentForm.new_first_name}
                         onChange={(e) => setAppointmentForm({ ...appointmentForm, new_first_name: cleanName(e.target.value) })} />
                  <input className="form-control" placeholder="Last name"
                         maxLength={LIMITS.name} value={appointmentForm.new_last_name}
                         onChange={(e) => setAppointmentForm({ ...appointmentForm, new_last_name: cleanName(e.target.value) })} />
                </div>
                <div className="form-grid-2">
                  <input className="form-control" type="tel" inputMode="numeric" placeholder="Mobile number *" required
                         value={appointmentForm.new_mobile}
                         onChange={(e) => setAppointmentForm({ ...appointmentForm, new_mobile: cleanMobile(e.target.value) })} />
                  <select className="form-control" value={appointmentForm.new_gender}
                          onChange={(e) => setAppointmentForm({ ...appointmentForm, new_gender: e.target.value })}>
                    <option value="">Gender</option>
                    <option value="Female">Female</option>
                    <option value="Male">Male</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <span className="od-hint">They are added to your customers, and the confirmation goes to this number.</span>
              </div>
            ) : (
              <CustomerPicker required disabled={!!editingAppointment}
                              value={appointmentForm.customer ? String(appointmentForm.customer) : ''}
                              onChange={(next) => setAppointmentForm((f) => ({ ...f, customer: next }))}
                              placeholder="Search a client by name or mobile" />
            )}
          </div>
          <div>
            <label className="form-label">Type</label>
            <select className="form-control"
                    value={appointmentForm.appointment_type}
                    onChange={(e) => setAppointmentForm({
                      ...appointmentForm,
                      appointment_type: e.target.value,

                      custom_type: e.target.value === 'OTHER' ? appointmentForm.custom_type : '',
                    })}>
              {Object.entries(APPOINTMENT_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
            {appointmentForm.appointment_type === 'OTHER' && (
              <input className="form-control apt-custom-type" required
                     maxLength={50} autoFocus
                     placeholder={t('dashboard.customTypePlaceholder', 'What kind of appointment?')}
                     value={appointmentForm.custom_type}
                     onChange={(e) => setAppointmentForm({ ...appointmentForm, custom_type: e.target.value })} />
            )}
          </div>
          <div>
            <label className="form-label">Date & time *</label>
            <input className="form-control" type="datetime-local" required
                   ref={appointmentDateRef}
                   min={editingAppointment ? undefined : `${todayIso()}T00:00`}
                   value={appointmentForm.scheduled_time}
                   onChange={(e) => setAppointmentForm({ ...appointmentForm, scheduled_time: e.target.value })} />
            {/* The calendar itself is the browser's, drawn outside the
                page, so its Clear/Today row cannot be added to. This
                is the page's own confirmation: what has been picked,
                in words, and a Done that shuts the calendar. The value
                is already committed by then -- the field writes on
                every change -- so this confirms, it does not save. */}
            <div className="apt-when">
              <span className={appointmentForm.scheduled_time ? 'apt-when-set' : ''}>
                {appointmentForm.scheduled_time
                  ? fmtDateTime(appointmentForm.scheduled_time)
                  : t('dashboard.pickDateTime', 'No date and time chosen yet')}
              </span>
              <button type="button" className="btn-secondary at-btn-sm"
                      disabled={!appointmentForm.scheduled_time}
                      onClick={() => appointmentDateRef.current?.blur()}>
                {t('common.done', 'Done')}
              </button>
            </div>
          </div>
          <div>
            <label className="form-label">With</label>
            <select className="form-control"
                    value={appointmentForm.assigned_staff}
                    onChange={(e) => setAppointmentForm({ ...appointmentForm, assigned_staff: e.target.value })}>
              <option value="">Unassigned</option>
              {tailors.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          {editingAppointment && (
            <div>
              <label className="form-label">Status</label>
              <select className="form-control"
                      value={appointmentForm.status}
                      onChange={(e) => setAppointmentForm({ ...appointmentForm, status: e.target.value })}>
                {Object.entries(APPOINTMENT_STATUS_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="form-label">Notes</label>
            <textarea className="form-control" rows={2} maxLength={LIMITS.note}
                      value={appointmentForm.notes}
                      onChange={(e) => setAppointmentForm({ ...appointmentForm, notes: e.target.value })} />
          </div>
          <div className="apt-foot">
            {editingAppointment && appointmentForm.status !== 'CANCELLED' && (
              <button type="button" className="btn-secondary" disabled={savingAppointment}
                      style={{ marginRight: 'auto', color: 'var(--danger-color)', borderColor: 'rgba(192,57,43,0.3)' }}
                      onClick={handleCancelAppointment}>
                {t('dashboard.cancelAppointment', 'Cancel appointment')}
              </button>
            )}
            <button type="button" className="btn-secondary" onClick={closeAppointmentModal}>
              {t('common.close', 'Close')}
            </button>
            <button type="submit" className="btn-primary" disabled={savingAppointment}>
              {savingAppointment
                ? t('common.saving', 'Saving…')
                : editingAppointment
                  ? t('common.saveChanges', 'Save changes')
                  : t('dashboard.bookAppointmentBtn', 'Book appointment')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
