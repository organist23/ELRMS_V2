const express = require('express');
const db = require('../db');
const { isClosedSql, assertMonthOpen } = require('../helpers/closedMonth');

const router = express.Router();

// ============================================================
// TARDY DEDUCTION ROUTES (New - Core logic untouched)
// ============================================================

// GET all tardy deductions (for Processed Applications tab)
router.get('/api/tardy', async (req, res) => {
    try {
        const [rows] = await db.execute(`
            SELECT t.*, e.full_name,
                   ${isClosedSql('t.deduction_date')} AS is_closed
            FROM tardy_deductions t
            JOIN employees e ON t.employee_id = e.id
            ORDER BY t.deduction_date DESC
        `);
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST: Deduct equivalent day from VL
router.post('/api/tardy/deduct', async (req, res) => {
    const { employee_id, equivalent_day, period_text, remarks } = req.body;
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        // 1. Validate employee balance
        const [balRows] = await connection.execute(
            'SELECT * FROM leave_balances WHERE employee_id = ? FOR UPDATE',
            [employee_id]
        );
        if (balRows.length === 0) throw new Error('Employee balance not found');
        const bal = balRows[0];
        const currentVL = parseFloat(bal.vacation_leave || 0);
        const days = parseFloat(equivalent_day);

        if (days <= 0) throw new Error('Equivalent day must be greater than 0');

        // 2. Split pay math (same pattern as leave approve)
        const with_pay = Math.min(days, currentVL);
        const without_pay = Math.max(0, days - currentVL);

        // 3. Deduct from VL only
        await connection.execute(
            'UPDATE leave_balances SET vacation_leave = vacation_leave - ? WHERE employee_id = ?',
            [with_pay, employee_id]
        );

        // 4. Save tardy record
        const [result] = await connection.execute(
            'INSERT INTO tardy_deductions (employee_id, equivalent_day, period_text, remarks, status) VALUES (?, ?, ?, ?, ?)',
            [employee_id, days, period_text, remarks || null, 'Deducted']
        );

        // 5. Write ledger snapshot
        const [newBal] = await connection.execute(
            'SELECT * FROM leave_balances WHERE employee_id = ?',
            [employee_id]
        );
        const b = newBal[0];
        const desc = `Tardy Deduction: ${days} days deducted from VL. Period: ${period_text}.`;

        await connection.execute(
            'INSERT INTO ledger (employee_id, transaction_desc, vl_bal, sl_bal, sp_bal, fl_bal, wl_bal, spl_bal, mat_bal, pat_bal, sbw_bal, transaction_type, leave_type, deducted_with_pay, deducted_without_pay, remarks, period_text) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [employee_id, desc, b.vacation_leave, b.sick_leave, b.special_leave, b.force_leave, b.wellness_leave, b.solo_parent_leave, b.maternity_leave, b.paternity_leave, b.special_benefits_for_women, 'TARDY', 'VL', with_pay, without_pay, remarks || null, period_text]
        );

        await connection.commit();
        res.json({ success: true, message: `Deducted ${days} days from VL successfully.` });
    } catch (error) {
        await connection.rollback();
        res.status(500).json({ error: error.message });
    } finally {
        connection.release();
    }
});

// POST: Undo a tardy deduction
router.post('/api/tardy/undo', async (req, res) => {
    const { tardy_id } = req.body;
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        // 1. Get the tardy record
        const [rows] = await connection.execute('SELECT * FROM tardy_deductions WHERE id = ?', [tardy_id]);
        if (rows.length === 0) throw new Error('Tardy record not found');
        const tardy = rows[0];
        if (tardy.status !== 'Deducted') throw new Error('Only active deductions can be undone');

        // Check if the tardy record belongs to a closed month
        await assertMonthOpen(connection, tardy.deduction_date, 'Undo', 'tardiness record');

        const days = parseFloat(tardy.equivalent_day);

        // 2. Restore VL
        await connection.execute(
            'UPDATE leave_balances SET vacation_leave = vacation_leave + ? WHERE employee_id = ?',
            [days, tardy.employee_id]
        );

        // 3. Update tardy status
        await connection.execute(
            'UPDATE tardy_deductions SET status = ? WHERE id = ?',
            ['Undone', tardy_id]
        );

        // 4. Write ledger snapshot
        const [newBal] = await connection.execute(
            'SELECT * FROM leave_balances WHERE employee_id = ?',
            [tardy.employee_id]
        );
        const b = newBal[0];
        const desc = `UNDO TARDY: Restored ${days} days to VL. Period: ${tardy.period_text}.`;

        await connection.execute(
            'INSERT INTO ledger (employee_id, transaction_desc, vl_bal, sl_bal, sp_bal, fl_bal, wl_bal, spl_bal, mat_bal, pat_bal, sbw_bal, transaction_type, leave_type, deducted_with_pay, remarks, period_text) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [tardy.employee_id, desc, b.vacation_leave, b.sick_leave, b.special_leave, b.force_leave, b.wellness_leave, b.solo_parent_leave, b.maternity_leave, b.paternity_leave, b.special_benefits_for_women, 'UNDO', 'VL', days, tardy.remarks || null, tardy.period_text]
        );

        await connection.commit();
        res.json({ success: true, message: 'Tardy deduction undone successfully.' });
    } catch (error) {
        await connection.rollback();
        res.status(500).json({ error: error.message });
    } finally {
        connection.release();
    }
});

// POST: Redo a tardy deduction
router.post('/api/tardy/redo', async (req, res) => {
    const { tardy_id } = req.body;
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        // 1. Get the tardy record
        const [rows] = await connection.execute('SELECT * FROM tardy_deductions WHERE id = ?', [tardy_id]);
        if (rows.length === 0) throw new Error('Tardy record not found');
        const tardy = rows[0];
        if (tardy.status !== 'Undone') throw new Error('Only undone deductions can be redone');

        // Check if the tardy record belongs to a closed month
        await assertMonthOpen(connection, tardy.deduction_date, 'Redo', 'tardiness record');

        const days = parseFloat(tardy.equivalent_day);

        // 2. Validate current balance
        const [balRows] = await connection.execute(
            'SELECT * FROM leave_balances WHERE employee_id = ? FOR UPDATE',
            [tardy.employee_id]
        );
        const bal = balRows[0];
        const currentVL = parseFloat(bal.vacation_leave || 0);
        const with_pay = Math.min(days, currentVL);
        const without_pay = Math.max(0, days - currentVL);

        // 3. Re-deduct from VL
        await connection.execute(
            'UPDATE leave_balances SET vacation_leave = vacation_leave - ? WHERE employee_id = ?',
            [with_pay, tardy.employee_id]
        );

        // 4. Update tardy status back to Deducted
        await connection.execute(
            'UPDATE tardy_deductions SET status = ? WHERE id = ?',
            ['Deducted', tardy_id]
        );

        // 5. Write ledger snapshot
        const [newBal] = await connection.execute(
            'SELECT * FROM leave_balances WHERE employee_id = ?',
            [tardy.employee_id]
        );
        const b = newBal[0];
        const desc = `REDO TARDY: Re-deducted ${days} days from VL. Period: ${tardy.period_text}.`;

        await connection.execute(
            'INSERT INTO ledger (employee_id, transaction_desc, vl_bal, sl_bal, sp_bal, fl_bal, wl_bal, spl_bal, mat_bal, pat_bal, sbw_bal, transaction_type, leave_type, deducted_with_pay, deducted_without_pay, remarks, period_text) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [tardy.employee_id, desc, b.vacation_leave, b.sick_leave, b.special_leave, b.force_leave, b.wellness_leave, b.solo_parent_leave, b.maternity_leave, b.paternity_leave, b.special_benefits_for_women, 'TARDY', 'VL', with_pay, without_pay, tardy.remarks || null, tardy.period_text]
        );

        await connection.commit();
        res.json({ success: true, message: 'Tardy deduction re-applied successfully.' });
    } catch (error) {
        await connection.rollback();
        res.status(500).json({ error: error.message });
    } finally {
        connection.release();
    }
});

module.exports = router;
