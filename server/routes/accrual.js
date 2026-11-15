const express = require('express');
const db = require('../db');

const router = express.Router();

// 4. Accrual & Manual Triggers
router.post('/api/accrual/generate', async (req, res) => {
    const { month, year } = req.body;
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        // 1. Check if already generated
        const [logs] = await connection.execute('SELECT * FROM accrual_logs WHERE month = ? AND year = ?', [month, year]);
        if (logs.length > 0) throw new Error('Credits already generated for this month and year');

        // 2. CHECK: Yearly Rollover for previous year must be completed (If legacy employees exist)
        const prevYear = parseInt(year) - 1;
        const [rolloverCheck] = await connection.execute(
            'SELECT * FROM yearly_action_logs WHERE action_type = "ROLLOVER" AND year = ?',
            [prevYear]
        );
        
        const [legacyCheck] = await connection.execute(
            'SELECT * FROM employees WHERE YEAR(created_at) < ? AND is_active = 1 LIMIT 1',
            [year]
        );

        if (legacyCheck.length > 0 && rolloverCheck.length === 0) {
            throw new Error(`Cannot generate credits for ${year}. The Yearly Rollover for ${prevYear} is still pending because legacy employees exist.`);
        }

        // 2. Add 1.25 to all active employees
        await connection.execute(`
            UPDATE leave_balances lb
            JOIN employees e ON lb.employee_id = e.id
            SET lb.vacation_leave = lb.vacation_leave + 1.25, 
                lb.sick_leave = lb.sick_leave + 1.25
            WHERE e.is_active = 1
        `);

        // 3. Log into accrual_logs
        await connection.execute('INSERT INTO accrual_logs (month, year) VALUES (?, ?)', [month, year]);

        // 4. PREPARE & EXECUTE BULK LEDGER INSERT
        const [balances] = await connection.execute(`
            SELECT lb.* 
            FROM leave_balances lb
            JOIN employees e ON lb.employee_id = e.id
            WHERE e.is_active = 1
        `);

        if (balances.length > 0) {
            const monthNames = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
            const periodText = `AS OF ${monthNames[month - 1]}`;
            
            const ledgerRows = balances.map(b => [
                b.employee_id, 
                `Monthly Accrual: ${month}/${year} (+1.25 VL/SL)`, 
                b.vacation_leave, b.sick_leave, b.special_leave, b.force_leave, b.wellness_leave, b.solo_parent_leave, b.maternity_leave, b.paternity_leave, b.special_benefits_for_women,
                'CREDIT', 1.25, 'Monthly Credit', periodText
            ]);

            await connection.query(
                'INSERT INTO ledger (employee_id, transaction_desc, vl_bal, sl_bal, sp_bal, fl_bal, wl_bal, spl_bal, mat_bal, pat_bal, sbw_bal, transaction_type, earned, remarks, period_text) VALUES ?',
                [ledgerRows]
            );
        }

        await connection.commit();
        res.json({ success: true, message: `Successfully generated credits for ${month}/${year}` });
    } catch (error) {
        await connection.rollback();
        res.status(500).json({ error: error.message });
    } finally {
        connection.release();
    }
});

// Privilege reset is now integrated into the Yearly Rollover process.
// Individual privilege resets can still be performed manually if needed by adjusting employee profiles.

router.post('/api/accrual/rollover', async (req, res) => {
    const { from_year, to_year } = req.body;
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        // 1. Check if rollover already performed for this source year
        const [existing] = await connection.execute(
            'SELECT * FROM yearly_action_logs WHERE action_type = "ROLLOVER" AND year = ?',
            [from_year]
        );
        if (existing.length > 0) {
            throw new Error(`Yearly rollover for ${from_year} has already been completed.`);
        }

        // 2. Perform Dual Action: Move current VL/SL to Forwarded AND Reset Privileges to defaults (ACTIVE ONLY)
        await connection.execute(`
            UPDATE leave_balances lb
            JOIN employees e ON lb.employee_id = e.id
            SET lb.forwarded_vl = lb.vacation_leave, 
                lb.forwarded_sl = lb.sick_leave,
                lb.special_leave = 3.000, 
                lb.force_leave = 5.000, 
                lb.wellness_leave = 5.000, 
                lb.solo_parent_leave = 7.000,
                lb.maternity_leave = 105.000,
                lb.paternity_leave = (CASE WHEN e.sex = 'Male' THEN 7.000 ELSE 0.000 END),
                lb.special_benefits_for_women = 30.000
            WHERE e.is_active = 1
        `);

        // 3. PREPARE & EXECUTE BULK LEDGER & ARCHIVE INSERTS
        const [balances] = await connection.execute(`
            SELECT lb.* 
            FROM leave_balances lb
            JOIN employees e ON lb.employee_id = e.id
            WHERE e.is_active = 1
        `);

        if (balances.length > 0) {
            // A. Bulk Ledger Rows
            const ledgerRows = balances.map(b => [
                b.employee_id, 
                `Yearly Initialization (${from_year} -> ${to_year}): Balances Forwarded & Privilege Leaves Reset`, 
                b.vacation_leave, b.sick_leave, b.special_leave, b.force_leave, b.wellness_leave, b.solo_parent_leave, b.maternity_leave, b.paternity_leave, b.special_benefits_for_women,
                'ROLLOVER', 0, `Yearly Rollover ${from_year} to ${to_year}`, to_year.toString()
            ]);

            await connection.query(
                'INSERT INTO ledger (employee_id, transaction_desc, vl_bal, sl_bal, sp_bal, fl_bal, wl_bal, spl_bal, mat_bal, pat_bal, sbw_bal, transaction_type, earned, remarks, period_text) VALUES ?',
                [ledgerRows]
            );

            // B. Bulk Yearly Credits Archive Rows (Using ON DUPLICATE KEY logic)
            const archiveRows = balances.map(b => [
                b.employee_id, 
                from_year, 
                b.forwarded_vl, 
                b.forwarded_sl
            ]);

            await connection.query(
                'INSERT INTO yearly_credits_archive (employee_id, year, vl_forwarded, sl_forwarded) VALUES ? ON DUPLICATE KEY UPDATE vl_forwarded = VALUES(vl_forwarded), sl_forwarded = VALUES(sl_forwarded)',
                [archiveRows]
            );
        }

        // 4. Record the actions separately in the action logs (as requested)
        await connection.execute(
            'INSERT INTO yearly_action_logs (action_type, year) VALUES (?, ?)',
            ['ROLLOVER', from_year]
        );
        await connection.execute(
            'INSERT INTO yearly_action_logs (action_type, year) VALUES (?, ?)',
            ['PRIVILEGE_RESET', from_year]
        );

        await connection.commit();
        res.json({ success: true, message: `Annual initialization from ${from_year} to ${to_year} completed successfully.` });
    } catch (error) {
        await connection.rollback();
        res.status(400).json({ error: error.message });
    } finally {
        connection.release();
    }
});

router.get('/api/system/audit', async (req, res) => {
    try {
        const now = new Date();
        const currentMonth = now.getMonth() + 1;
        const currentYear = now.getFullYear();
        
        // 1. Check for Pending Accrual of Current Month
        const [accrualLogs] = await db.execute(
            'SELECT * FROM accrual_logs WHERE month = ? AND year = ?',
            [currentMonth, currentYear]
        );
        
        // 2. Check for Pending Rollover of Previous Year (if it's a new year)
        const prevYear = currentYear - 1;
        const [rolloverLogs] = await db.execute(
            'SELECT * FROM yearly_action_logs WHERE action_type = "ROLLOVER" AND year = ?',
            [prevYear]
        );

        // 3. SMART CHECK: Only require rollover if there are employees from previous years
        const [legacyEmployees] = await db.execute(
            'SELECT * FROM employees WHERE YEAR(created_at) < ? AND is_active = 1 LIMIT 1',
            [currentYear]
        );
        
        // Rollover is only pending if legacy employees exist AND no rollover log is found
        const isRolloverPending = legacyEmployees.length > 0 && rolloverLogs.length === 0;

        res.json({
            pendingAccrual: accrualLogs.length === 0,
            pendingRollover: isRolloverPending,
            month: currentMonth,
            year: currentYear,
            prevYear: prevYear
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
