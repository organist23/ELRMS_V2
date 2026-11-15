const express = require('express');
const db = require('../db');
const { computeStartingBalance, buildVlSlRows, buildPrivilegeRows, closingPrivileges } = require('../helpers/leaveCard');

const router = express.Router();

// 6. Leave Card Report API
router.get('/api/employees/:id/leave-card/:year', async (req, res) => {
    const { id, year } = req.params;
    try {
        // 1. Get Employee Info with live balances
        const [empRows] = await db.execute(`
            SELECT e.*, b.special_leave, b.force_leave, b.wellness_leave, b.solo_parent_leave, b.maternity_leave, b.paternity_leave, b.special_benefits_for_women, b.bbw_vl, b.bbw_sl
            FROM employees e
            JOIN leave_balances b ON e.id = b.employee_id
            WHERE e.id = ?
        `, [id]);
        if (empRows.length === 0) return res.status(404).json({ error: 'Employee not found' });
        const employee = empRows[0];

        // 2. Get Starting Balance (see computeStartingBalance for the case priority)
        const { startingBalance, cutoffLedgerId } = await computeStartingBalance(employee, year, {
            archive: async (prevYear) => {
                const [rows] = await db.execute(
                    'SELECT * FROM yearly_credits_archive WHERE employee_id = ? AND year = ?',
                    [id, prevYear]
                );
                return rows;
            },
            registration: async () => {
                const [rows] = await db.execute(
                    `SELECT * FROM ledger WHERE employee_id = ? AND YEAR(action_date) = ? AND transaction_type = 'REGISTRATION' ORDER BY action_date ASC LIMIT 1`,
                    [id, year]
                );
                return rows;
            },
            rollover: async () => {
                const [rows] = await db.execute(
                    `SELECT * FROM ledger WHERE employee_id = ? AND YEAR(action_date) = ? AND transaction_type = 'ROLLOVER' ORDER BY action_date ASC LIMIT 1`,
                    [id, year]
                );
                return rows;
            },
        });

        // 3. Get Ledger Entries for the Year
        const [ledgerRows] = await db.execute(
            'SELECT * FROM ledger WHERE employee_id = ? AND YEAR(action_date) = ? ORDER BY action_date ASC',
            [id, year]
        );

        const rows = buildVlSlRows(ledgerRows, startingBalance, cutoffLedgerId, year);
        const privilegeRows = buildPrivilegeRows(ledgerRows);
        const closing = closingPrivileges(ledgerRows);

        res.json({
            employee: empRows[0],
            startingBalance,
            rows,
            privilegeRows: privilegeRows,
            closingPrivileges: closing // Pass the snapshot
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
