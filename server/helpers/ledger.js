// Ledger writes.
// Every ledger row stores a snapshot of all 9 leave balances AFTER the change it records.
// The leave card report and the Ledger Summary print rely on these columns, so keep them exact.

// ledger snapshot column -> leave_balances column (order matters: it is the column order written)
const SNAPSHOT_COLUMNS = [
    ['vl_bal', 'vacation_leave'],
    ['sl_bal', 'sick_leave'],
    ['sp_bal', 'special_leave'],
    ['fl_bal', 'force_leave'],
    ['wl_bal', 'wellness_leave'],
    ['spl_bal', 'solo_parent_leave'],
    ['mat_bal', 'maternity_leave'],
    ['pat_bal', 'paternity_leave'],
    ['sbw_bal', 'special_benefits_for_women'],
];

// Snapshot of a leave_balances row, as ledger columns.
const balanceSnapshot = (b) => Object.fromEntries(SNAPSHOT_COLUMNS.map(([col, field]) => [col, b[field]]));

// INSERT one ledger row: employee, description, the 9 snapshot columns, then any extra columns
// (transaction_type, leave_type, earned, deducted_with_pay, remarks, period_text, ...) in the given order.
// Columns that are not passed are left to their database defaults, exactly as before.
async function insertLedgerEntry(connection, employeeId, description, snapshot, extra = {}) {
    const row = { employee_id: employeeId, transaction_desc: description, ...snapshot, ...extra };
    const columns = Object.keys(row);
    await connection.execute(
        `INSERT INTO ledger (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
        columns.map((c) => row[c])
    );
}

module.exports = { SNAPSHOT_COLUMNS, balanceSnapshot, insertLedgerEntry };
