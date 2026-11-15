// Leave card report (CSC format) calculations.
// The leave card is an official printable document: every number and string built here must stay
// byte-identical (locked by the golden leave_card snapshots). Keep the order of floating-point
// operations and every parseFloat/toFixed call exactly where it is.
const { LEAVE_TYPES, MONTH_NAMES } = require('../constants');

// Starting VL/SL balance of the card, in priority order:
//   1. previous year's archive (only if the employee was registered by then)
//   2. this year's first REGISTRATION ledger row
//   3. this year's first ROLLOVER ledger row
//   4. the employee's base balances (bbw_vl / bbw_sl)
// `lookup` provides the three queries as async functions (archive, registration, rollover);
// they are called only when the earlier cases did not apply.
// cutoffLedgerId: ledger rows with id <= this are already part of the starting balance.
async function computeStartingBalance(employee, year, lookup) {
    const prevYear = parseInt(year) - 1;
    const regYear = new Date(employee.created_at).getFullYear();

    const archiveRows = await lookup.archive(prevYear);

    let startingBalance = { vl: 0, sl: 0 };
    let cutoffLedgerId = -1;

    if (archiveRows.length > 0 && regYear <= prevYear) {
        // Case 1: Existing employee with a previous year archive
        startingBalance.vl = parseFloat(archiveRows[0].vl_forwarded);
        startingBalance.sl = parseFloat(archiveRows[0].sl_forwarded);
        cutoffLedgerId = -1; // Archive is from prev year, so all ledger entries this year are relevant
    } else {
        const regRows = await lookup.registration();
        if (regRows.length > 0) {
            // Case 2: Newly registered employee - start from their initial balance
            startingBalance.vl = parseFloat(regRows[0].vl_bal);
            startingBalance.sl = parseFloat(regRows[0].sl_bal);
            cutoffLedgerId = regRows[0].id;
        } else {
            const rolloverRows = await lookup.rollover();
            if (rolloverRows.length > 0) {
                // Case 3: ROLLOVER entry for this year (fallback for missing archive)
                startingBalance.vl = parseFloat(rolloverRows[0].vl_bal);
                startingBalance.sl = parseFloat(rolloverRows[0].sl_bal);
                cutoffLedgerId = rolloverRows[0].id;
            } else {
                // Case 4: Complete fresh start from base balances
                startingBalance.vl = parseFloat(employee.bbw_vl || 0);
                startingBalance.sl = parseFloat(employee.bbw_sl || 0);
                cutoffLedgerId = -1;
            }
        }
    }

    return { startingBalance, cutoffLedgerId };
}

// VL/SL card: the "BALANCE BROUGHT FORWARDED" row followed by one row per VL/SL ledger entry,
// with a running balance.
function buildVlSlRows(ledgerRows, startingBalance, cutoffLedgerId, year) {
    const vlSlEntries = ledgerRows.filter(entry => {
        // Skip entries that were already part of the starting balance calculation
        if (entry.id <= cutoffLedgerId) return false;

        const type = entry.transaction_type;
        const leaveType = entry.leave_type || ''; // Metadata column
        const desc = (entry.transaction_desc || '').toLowerCase(); // Fallback description

        // Registration and Rollover entries are system entries
        const isSystem = type === 'REGISTRATION' || type === 'ROLLOVER';

        // Check if it's a privilege leave using the reliable leave_type column
        // Fallback to string matching for older records
        const isPrivilege = [LEAVE_TYPES.SPECIAL, LEAVE_TYPES.FORCE, LEAVE_TYPES.WELLNESS, LEAVE_TYPES.SOLO_PARENT, LEAVE_TYPES.MATERNITY, LEAVE_TYPES.PATERNITY, LEAVE_TYPES.SBW].includes(leaveType) ||
                            (leaveType === '' && (desc.includes('special leave') || desc.includes('force leave') || desc.includes('paternity') || desc.includes('wellness') || desc.includes('solo parent') || desc.includes('maternity') || desc.includes('special benefits for women') || desc.includes('special benefits for woman')));

        return !isSystem && !isPrivilege;
    });

    let runningBalance = { vl: parseFloat(startingBalance.vl), sl: parseFloat(startingBalance.sl) };

    const headerRow = {
        date: `${year}-01-01`,
        period_text: year.toString(),
        particulars: 'BALANCE BROUGHT FORWARDED',
        remarks: '',
        vl: { earned: 0, deduct_w_pay: 0, deduct_wo_pay: 0, balance: runningBalance.vl },
        sl: { earned: 0, deduct_w_pay: 0, deduct_wo_pay: 0, balance: runningBalance.sl }
    };

    const vlSlRows = vlSlEntries.map((entry) => {
        const actionDate = new Date(entry.action_date);
        const day = actionDate.getDate();
        const month = MONTH_NAMES[actionDate.getMonth()];

        let row = {
            date: entry.action_date,
            period_text: entry.period_text || '',
            particulars: '',
            remarks: entry.remarks || '',
            vl: { earned: 0, deduct_w_pay: 0, deduct_wo_pay: 0, balance: 0 },
            sl: { earned: 0, deduct_w_pay: 0, deduct_wo_pay: 0, balance: 0 }
        };

        if (entry.transaction_type === 'CREDIT') {
            // Monthly Credit: Add earned to BOTH VL and SL
            const baseEarned = parseFloat(entry.earned || 1.25);
            runningBalance.vl += baseEarned;
            runningBalance.sl += baseEarned;
            row.vl.earned = baseEarned;
            row.sl.earned = baseEarned;
            row.period_text = `AS OF ${month}`;
            row.particulars = 'Monthly Credit';

        } else if (entry.transaction_type === 'LEAVE' || entry.transaction_type === 'TARDY') {
            // Leave Deduction OR Tardy Deduction: only the with-pay part is subtracted
            const deductWPay = parseFloat(entry.deducted_with_pay || 0);
            const deductWOPay = parseFloat(entry.deducted_without_pay || 0);
            const totalDays = deductWPay + deductWOPay;

            if (entry.leave_type === 'VL') {
                runningBalance.vl -= deductWPay;
                row.vl.deduct_w_pay = deductWPay;
                row.vl.deduct_wo_pay = deductWOPay;
            } else if (entry.leave_type === 'SL') {
                runningBalance.sl -= deductWPay;
                row.sl.deduct_w_pay = deductWPay;
                row.sl.deduct_wo_pay = deductWOPay;
            }

            // Safety: Ensure balance never displays as negative in the calculator
            if (runningBalance.vl < 0) runningBalance.vl = 0;
            if (runningBalance.sl < 0) runningBalance.sl = 0;

            row.period_text = entry.period_text || `${month} ${day}`;
            // Tardy gets a distinct label; regular leave keeps the existing format
            if (entry.transaction_type === 'TARDY') {
                row.particulars = `TARDY - ${parseFloat(deductWPay.toFixed(3))} Deducted`;
            } else {
                row.particulars = `${entry.leave_type} - ${parseFloat(totalDays.toFixed(3))}`;
            }

        } else if (entry.transaction_type === 'UNDO') {
            // UNDO: Restore the deducted days back to the correct leave type
            const restoredDays = parseFloat(entry.deducted_with_pay || 0);
            if (entry.leave_type === 'VL') {
                runningBalance.vl += restoredDays;
                row.vl.earned = restoredDays;
            } else if (entry.leave_type === 'SL') {
                runningBalance.sl += restoredDays;
                row.sl.earned = restoredDays;
            }
            row.period_text = entry.period_text || `${month} ${day}`;
            row.particulars = entry.transaction_desc;

        } else {
            // Manual Update / Adjustment: Trust the database snapshot
            const dbVl = parseFloat(entry.vl_bal);
            const dbSl = parseFloat(entry.sl_bal);
            const vlDiff = dbVl - runningBalance.vl;
            const slDiff = dbSl - runningBalance.sl;

            // Show the difference as earned or deducted for visual math
            if (vlDiff > 0.001) row.vl.earned = parseFloat(vlDiff.toFixed(3));
            else if (vlDiff < -0.001) row.vl.deduct_w_pay = parseFloat(Math.abs(vlDiff).toFixed(3));

            if (slDiff > 0.001) row.sl.earned = parseFloat(slDiff.toFixed(3));
            else if (slDiff < -0.001) row.sl.deduct_w_pay = parseFloat(Math.abs(slDiff).toFixed(3));

            runningBalance.vl = dbVl;
            runningBalance.sl = dbSl;

            row.period_text = entry.period_text || `${month} ${day}`;
            row.particulars = entry.transaction_desc.split('(')[0].trim();
        }

        // Set the calculated balance for display
        row.vl.balance = parseFloat(runningBalance.vl.toFixed(3));
        row.sl.balance = parseFloat(runningBalance.sl.toFixed(3));

        return row;
    });

    return [headerRow, ...vlSlRows];
}

// Privilege Leave Card: one row per privilege ledger entry.
function buildPrivilegeRows(ledgerRows) {
    const privilegeEntries = ledgerRows.filter(entry => {
        const leaveType = entry.leave_type || '';
        const desc = (entry.transaction_desc || '').toLowerCase();

        return [LEAVE_TYPES.SPECIAL, LEAVE_TYPES.FORCE, LEAVE_TYPES.WELLNESS, LEAVE_TYPES.SOLO_PARENT, LEAVE_TYPES.MATERNITY, LEAVE_TYPES.PATERNITY, LEAVE_TYPES.SBW].includes(leaveType) ||
               (leaveType === '' && (desc.includes('special leave') || desc.includes('force leave') || desc.includes('paternity') || desc.includes('wellness') || desc.includes('solo parent') || desc.includes('maternity') || desc.includes('special benefits for women') || desc.includes('special benefits for woman')));
    });

    return privilegeEntries.map((entry, idx) => {
        const actionDate = new Date(entry.action_date);
        const day = actionDate.getDate();
        const month = MONTH_NAMES[actionDate.getMonth()];

        // Smart detection of the amount
        let amount = parseFloat(entry.deducted_with_pay || 0);

        // Calculation from snapshots if deducted_with_pay is 0/null
        if (amount === 0) {
            const types = [
                { key: 'sp_bal', desc: 'special' },
                { key: 'fl_bal', desc: 'force' },
                { key: 'wl_bal', desc: 'wellness' },
                { key: 'spl_bal', desc: 'solo' },
                { key: 'mat_bal', desc: 'maternity' },
                { key: 'pat_bal', desc: 'paternity' }
            ];

            for (const t of types) {
                if (entry.transaction_desc.toLowerCase().includes(t.desc)) {
                    // For the first entry, we compare against the default allocation
                    const defaultCaps = { 'sp_bal': 3, 'fl_bal': 5, 'wl_bal': 5, 'spl_bal': 7, 'mat_bal': 105, 'pat_bal': 7 };
                    const prevBal = idx > 0 ? parseFloat(privilegeEntries[idx - 1][t.key]) : defaultCaps[t.key];
                    const diff = prevBal - parseFloat(entry[t.key]);
                    if (diff !== 0) amount = diff;
                    break;
                }
            }
        }

        // Clean up particulars
        let particulars = entry.transaction_desc.split('(')[0].replace('Leave Approved:', '').replace('UNDO APPROVAL:', 'RESTORED:').trim();

        return {
            period_text: entry.period_text || `${month} ${day}`,
            particulars: particulars,
            absence_w_pay: Math.abs(amount), // Always display as positive withdrawal
            remarks: entry.remarks || ''
        };
    });
}

// Privilege balances at the end of the card: the snapshot of the last ACTUAL activity row.
// "Yearly Initialization"/"Yearly Rollover" rows are skipped because they reset the snapshots
// and would hide the year's usage. null when the year has no ledger rows.
function closingPrivileges(ledgerRows) {
    const actualActivityRows = ledgerRows.filter(r =>
        !r.transaction_desc.includes('Yearly Initialization') &&
        !r.transaction_desc.includes('Yearly Rollover')
    );

    const lastEntry = actualActivityRows[actualActivityRows.length - 1] || ledgerRows[ledgerRows.length - 1];

    if (!lastEntry) return null;
    return {
        special_leave: lastEntry.sp_bal,
        force_leave: lastEntry.fl_bal,
        wellness_leave: lastEntry.wl_bal,
        solo_parent_leave: lastEntry.spl_bal,
        maternity_leave: lastEntry.mat_bal,
        paternity_leave: lastEntry.pat_bal,
        special_benefits_for_women: lastEntry.sbw_bal
    };
}

module.exports = {
    computeStartingBalance,
    buildVlSlRows,
    buildPrivilegeRows,
    closingPrivileges,
};
