import { useRef, useState } from 'react';
import { api } from '../../services/api';
import { cleanMobile, cleanName, isPastDate, mobileError, nameError } from '../../services/validate';

/**
 * The appointment form's own state and actions: saving a booking or a change,
 * cancelling one, closing the form, and reloading the list after either.
 */
export default function useAppointments({ setAppointments, setShowAppointmentModal, setAppointmentForm, appointmentForm, setEditingAppointment, editingAppointment, fetchDashboardAndConfig, blankAppointmentForm }) {
  const [savingAppointment, setSavingAppointment] = useState(false);

  const [showAllAppointments, setShowAllAppointments] = useState(false);

  /** Reload the panel under whichever view it is showing. */
  const reloadAppointments = async () => {
    const fresh = await api.getAppointments(
      showAllAppointments ? {} : { upcoming: 'true' });
    setAppointments(fresh);
  };

  const closeAppointmentModal = () => {
    setShowAppointmentModal(false);
    setEditingAppointment(null);
    setAppointmentForm(blankAppointmentForm);
  };

  const handleSaveAppointment = async (e) => {
    e.preventDefault();
    if (savingAppointment) return;
    if (!editingAppointment && isPastDate((appointmentForm.scheduled_time || '').slice(0, 10))) {
      alert('The appointment cannot be in the past.');
      return;
    }
    const bookingForNew = !editingAppointment && appointmentForm.isNewCustomer;
    if (bookingForNew) {
      const problem = nameError(appointmentForm.new_first_name, { label: 'First name' })
        || mobileError(appointmentForm.new_mobile);
      if (problem) { alert(problem); return; }
    }
    setSavingAppointment(true);
    try {
      const { isNewCustomer, new_first_name, new_last_name, new_mobile, new_gender, ...rest } = appointmentForm;
      const payload = {
        ...rest,
        assigned_staff: appointmentForm.assigned_staff || null,
        scheduled_time: new Date(appointmentForm.scheduled_time).toISOString(),
      };
      if (bookingForNew) {
        delete payload.customer;
        payload.new_customer = {
          first_name: cleanName(new_first_name).trim(),
          last_name: cleanName(new_last_name).trim(),
          mobile_number: cleanMobile(new_mobile),
          gender: new_gender,
        };
      }
      if (editingAppointment) {
        delete payload.customer;
        await api.updateAppointment(editingAppointment.id, payload);
      } else {
        await api.createAppointment(payload);
      }
      await reloadAppointments();
      fetchDashboardAndConfig();
      closeAppointmentModal();
    } catch (err) {
      alert((editingAppointment ? "Could not save the appointment: "
                                : "Could not book the appointment: ") + err.message);
    } finally {
      setSavingAppointment(false);
    }
  };

  /** Cancelling keeps the record and the reason it existed; it does not delete
   *  the customer's history. */
  const handleCancelAppointment = async () => {
    if (!editingAppointment) return;
    if (!window.confirm('Cancel this appointment? The customer keeps the record of it.')) return;
    setSavingAppointment(true);
    try {
      await api.updateAppointment(editingAppointment.id, { status: 'CANCELLED' });
      await reloadAppointments();
      fetchDashboardAndConfig();
      closeAppointmentModal();
    } catch (err) {
      alert("Could not cancel the appointment: " + err.message);
    } finally {
      setSavingAppointment(false);
    }
  };

  // The appointment dialog's date field, so Done can dismiss the calendar.
  const appointmentDateRef = useRef(null);

  return {
    savingAppointment,
    setSavingAppointment,
    showAllAppointments,
    setShowAllAppointments,
    reloadAppointments,
    closeAppointmentModal,
    handleSaveAppointment,
    handleCancelAppointment,
    appointmentDateRef,
  };
}
