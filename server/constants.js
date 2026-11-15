const SALT_ROUNDS = 10;

const LEAVE_TYPES = {
    SPECIAL: 'Special Leave',
    FORCE: 'Force Leave',
    WELLNESS: 'Wellness Leave',
    SOLO_PARENT: 'Solo Parent Leave',
    MATERNITY: 'Maternity Leave',
    PATERNITY: 'Paternity Leave',
    SBW: 'Special Benefits for Women'
};

const MONTH_NAMES = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

module.exports = { SALT_ROUNDS, LEAVE_TYPES, MONTH_NAMES };
