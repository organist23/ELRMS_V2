const { LEAVE_TYPES } = require('../constants');

// Leave type (as stored in leave_applications.leave_type) -> its column in leave_balances.
const LEAVE_BALANCE_FIELD = {
    'Vacation Leave': 'vacation_leave',
    'Sick Leave': 'sick_leave',
    [LEAVE_TYPES.SPECIAL]: 'special_leave',
    [LEAVE_TYPES.FORCE]: 'force_leave',
    [LEAVE_TYPES.WELLNESS]: 'wellness_leave',
    [LEAVE_TYPES.SOLO_PARENT]: 'solo_parent_leave',
    [LEAVE_TYPES.MATERNITY]: 'maternity_leave',
    [LEAVE_TYPES.PATERNITY]: 'paternity_leave',
    [LEAVE_TYPES.SBW]: 'special_benefits_for_women'
};

// leave_type written to the ledger: 'VL' / 'SL' for earned leaves, the full name otherwise.
// The leave card report routes rows by these exact codes.
const ledgerLeaveCode = (leaveType) =>
    leaveType === 'Vacation Leave' ? 'VL' : (leaveType === 'Sick Leave' ? 'SL' : leaveType);

module.exports = { LEAVE_BALANCE_FIELD, ledgerLeaveCode };
