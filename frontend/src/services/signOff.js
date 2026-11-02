// Who sends finished work to whom. Mirrors domains/orders/workflow.py
// (submits_for_sign_off, may_sign_off); the server enforces it, this only
// decides which buttons and lists to show.
//
// Workers submit their work with a photo; the Owner, Designer or Master
// verifies it. A Master's own hands-on work is submitted too, and only the
// Owner or Designer may verify it. The Master's desk stages (Order taken,
// Trial, Payment, Delivery) and the two check stages complete at once.

const LEADS = ['Owner', 'Designer'];
const SUPERVISORS = ['Owner', 'Designer', 'Master'];
const CHECK_STAGES = ['master_quality_check', 'maggam_verification'];

// A stage that lists a worker role is production work, not desk work.
export const isHandsOn = (stageKey, stageRoles = []) =>
  !CHECK_STAGES.includes(stageKey) && stageRoles.some((r) => !SUPERVISORS.includes(r));

// Does pressing Done on this stage send it for checking? `role` presses it;
// `workerRole` is whose work it is (the caller, or the assignee a supervisor
// records it for). A Master recording a worker's job is that job's sign-off.
// No role means the owner's own account, as elsewhere in the app.
export const submitsForSignOff = (role, workerRole, stageKey, stageRoles) => {
  if (!role || LEADS.includes(role)) return false;
  if (role === 'Master') return workerRole === 'Master' && isHandsOn(stageKey, stageRoles);
  return true;
};

export const submittedByMaster = (stage) => stage?.performed_by_role === 'Master';

// May this role verify, or send back, this submitted stage?
export const maySignOff = (role, stage) => {
  if (!role || LEADS.includes(role)) return true;
  if (role === 'Master') return !submittedByMaster(stage);
  return false;
};
