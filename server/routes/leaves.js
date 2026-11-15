const express = require('express');
const db = require('../db');
const { LEAVE_TYPES } = require('../constants');

const router = express.Router();

// 3. Leave Applications
router.get('/api/leaves/pending', async (req, res) => {
    try {
        const [rows] = await db.execute(`
            SELECT l.*, e.full_name,
                   (SELECT COUNT(*) FROM accrual_logs a WHERE (a.year > YEAR(l.applied_at)) OR (a.year = YEAR(l.applied_at) AND a.month >= MONTH(l.applied_at))) > 0 AS is_closed
            FROM leave_applications l
            JOIN employees e ON l.employee_id = e.id
            WHERE l.status = 'Pending Approval'
            ORDER BY l.applied_at DESC
        `);
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/api/leaves/apply', async (req, res) => {
    let { employee_id, leave_type, date_from, date_to, num_days, reason, inclusive_dates } = req.body;
    try {
        // Convert empty strings to null for DB compatibility
        const clean_from = date_from || null;
        const clean_to = date_to || null;

        if (clean_from && clean_to && new Date(clean_to) < new Date(clean_from)) {
            return res.status(400).json({ error: 'Invalid Date Range: "Date To" cannot be earlier than "Date From".' });
        }

        // Validation check for privileges
        const [balanceRows] = await db.execute('SELECT * FROM leave_balances WHERE employee_id = ?', [employee_id]);
        if (balanceRows.length === 0) return res.status(404).json({ error: 'Employee balance not found' });
        
        const balance = balanceRows[0];
        const limits = {
            [LEAVE_TYPES.SPECIAL]: 3,
            [LEAVE_TYPES.FORCE]: 5,
            [LEAVE_TYPES.WELLNESS]: 5,
            [LEAVE_TYPES.SOLO_PARENT]: 7,
            [LEAVE_TYPES.MATERNITY]: 105,
            [LEAVE_TYPES.PATERNITY]: 7,
            [LEAVE_TYPES.SBW]: 30
        };

        const field_map = {
            [LEAVE_TYPES.SPECIAL]: 'special_leave',
            [LEAVE_TYPES.FORCE]: 'force_leave',
            [LEAVE_TYPES.WELLNESS]: 'wellness_leave',
            [LEAVE_TYPES.SOLO_PARENT]: 'solo_parent_leave',
            [LEAVE_TYPES.MATERNITY]: 'maternity_leave',
            [LEAVE_TYPES.PATERNITY]: 'paternity_leave',
            [LEAVE_TYPES.SBW]: 'special_benefits_for_women'
        };

        if (limits[leave_type]) {
            const field = field_map[leave_type];
            const current_bal = parseFloat(balance[field]);
            if (parseFloat(num_days) > current_bal) {
                 return res.status(400).json({ error: `Not enough credits in ${leave_type}. Remaining: ${current_bal.toFixed(3)}` });
            }
        }

        await db.execute(
            'INSERT INTO leave_applications (employee_id, leave_type, date_from, date_to, num_days, inclusive_dates, reason, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [employee_id, leave_type, clean_from, clean_to, num_days, inclusive_dates, reason, 'Pending Approval']
        );
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/api/leaves/approve', async (req, res) => {
    const { application_id } = req.body;
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const [apps] = await connection.execute('SELECT * FROM leave_applications WHERE id = ?', [application_id]);
        if (apps.length === 0) throw new Error('Application not found');
        const app_data = apps[0];

        // Check if the leave application belongs to a closed month (accrual already generated)
        const leaveDateApprove = new Date(app_data.applied_at);
        const leaveMonthApprove = leaveDateApprove.getMonth() + 1;
        const leaveYearApprove = leaveDateApprove.getFullYear();
        const [accrualLogsApprove] = await connection.execute(
            'SELECT * FROM accrual_logs WHERE (year > ?) OR (year = ? AND month >= ?)',
            [leaveYearApprove, leaveYearApprove, leaveMonthApprove]
        );
        if (accrualLogsApprove.length > 0) {
            throw new Error(`Approve Locked: This leave application belongs to a closed month (${leaveMonthApprove}/${leaveYearApprove}). To correct credits, please perform a Manual Balance Adjustment.`);
        }

        const field_map = {
            'Vacation Leave': 'vacation_leave',
            'Sick Leave': 'sick_leave',
            'Special Leave': 'special_leave',
            'Force Leave': 'force_leave',
            'Wellness Leave': 'wellness_leave',
            'Solo Parent Leave': 'solo_parent_leave',
            'Maternity Leave': 'maternity_leave',
            'Paternity Leave': 'paternity_leave',
            'Special Benefits for Women': 'special_benefits_for_women'
        };
        const field = field_map[app_data.leave_type];
        
        // --- Split Pay Math ---
        // ADDED 'FOR UPDATE' TO PREVENT RACE CONDITIONS
        const [balances] = await connection.execute('SELECT * FROM leave_balances WHERE employee_id = ? FOR UPDATE', [app_data.employee_id]);
        const bal = balances[0];
        const current_val = parseFloat(bal[field] || 0);
        const requested_days = parseFloat(app_data.num_days || 0);

        if (requested_days > current_val) {
            with_pay = current_val;
            without_pay = requested_days - current_val;
        } else {
            with_pay = requested_days;
            without_pay = 0;
        }

        await connection.execute(
            `UPDATE leave_balances SET ${field} = ${field} - ?, leave_w_o_pay = leave_w_o_pay + ? WHERE employee_id = ?`,
            [with_pay, without_pay, app_data.employee_id]
        );

        await connection.execute(
            'UPDATE leave_applications SET status = "Approved", with_pay = ?, without_pay = ? WHERE id = ?',
            [with_pay, without_pay, application_id]
        );

        // Snapshots for ledger
        const [new_bal] = await connection.execute('SELECT * FROM leave_balances WHERE employee_id = ?', [app_data.employee_id]);
        const b = new_bal[0];

        const fmt = (n) => parseFloat(parseFloat(n).toFixed(3)).toString();
        const desc = `Leave Approved: ${app_data.leave_type} (${app_data.inclusive_dates}). Status: ${fmt(with_pay)} Paid, ${fmt(without_pay)} Without Pay.`;
        const leave_type_short = app_data.leave_type === 'Vacation Leave' ? 'VL' : (app_data.leave_type === 'Sick Leave' ? 'SL' : app_data.leave_type);

        await connection.execute(
            'INSERT INTO ledger (employee_id, transaction_desc, vl_bal, sl_bal, sp_bal, fl_bal, wl_bal, spl_bal, mat_bal, pat_bal, sbw_bal, transaction_type, leave_type, deducted_with_pay, deducted_without_pay, remarks, period_text) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [app_data.employee_id, desc, b.vacation_leave, b.sick_leave, b.special_leave, b.force_leave, b.wellness_leave, b.solo_parent_leave, b.maternity_leave, b.paternity_leave, b.special_benefits_for_women, 'LEAVE', leave_type_short, with_pay, without_pay, app_data.reason, app_data.inclusive_dates]
        );

        await connection.commit();
        res.json({ success: true });
    } catch (error) {
        await connection.rollback();
        res.status(500).json({ error: error.message });
    } finally {
        connection.release();
    }
});

router.post('/api/leaves/undo', async (req, res) => {
    const { application_id } = req.body;
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const [apps] = await connection.execute('SELECT * FROM leave_applications WHERE id = ?', [application_id]);
        if (apps.length === 0) throw new Error('Application not found');
        const app_data = apps[0];
        if (app_data.status !== 'Approved') throw new Error('Only approved applications can be undone');

        // Check if the leave application belongs to a closed month (accrual already generated)
        const leaveDate = new Date(app_data.applied_at);
        const leaveMonth = leaveDate.getMonth() + 1;
        const leaveYear = leaveDate.getFullYear();

        const [accrualLogs] = await connection.execute(
            'SELECT * FROM accrual_logs WHERE (year > ?) OR (year = ? AND month >= ?)',
            [leaveYear, leaveYear, leaveMonth]
        );

        if (accrualLogs.length > 0) {
            throw new Error(`Undo Locked: This leave application belongs to a closed month (${leaveMonth}/${leaveYear}). To correct credits, please perform a Manual Balance Adjustment.`);
        }

        const field_map = {
            'Vacation Leave': 'vacation_leave',
            'Sick Leave': 'sick_leave',
            'Special Leave': 'special_leave',
            'Force Leave': 'force_leave',
            'Wellness Leave': 'wellness_leave',
            'Solo Parent Leave': 'solo_parent_leave',
            'Maternity Leave': 'maternity_leave',
            'Paternity Leave': 'paternity_leave',
            'Special Benefits for Women': 'special_benefits_for_women'
        };
        const field = field_map[app_data.leave_type];

        // Reverse the math
        await connection.execute(
            `UPDATE leave_balances SET ${field} = ${field} + ?, leave_w_o_pay = leave_w_o_pay - ? WHERE employee_id = ?`,
            [app_data.with_pay, app_data.without_pay, app_data.employee_id]
        );

        await connection.execute('UPDATE leave_applications SET status = "Pending Approval" WHERE id = ?', [application_id]);

        const [new_bal] = await connection.execute('SELECT * FROM leave_balances WHERE employee_id = ?', [app_data.employee_id]);
        const b = new_bal[0];

        // Build short leave type code consistently with the Approval logic
        const leaveTypeCode = app_data.leave_type === 'Vacation Leave' ? 'VL' : (app_data.leave_type === 'Sick Leave' ? 'SL' : app_data.leave_type);
        const restoredDays = parseFloat(app_data.with_pay);

        await connection.execute(
            'INSERT INTO ledger (employee_id, transaction_desc, vl_bal, sl_bal, sp_bal, fl_bal, wl_bal, spl_bal, mat_bal, pat_bal, sbw_bal, transaction_type, leave_type, deducted_with_pay, period_text) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [app_data.employee_id, `UNDO APPROVAL: Restored ${restoredDays} days to ${app_data.leave_type}`, b.vacation_leave, b.sick_leave, b.special_leave, b.force_leave, b.wellness_leave, b.solo_parent_leave, b.maternity_leave, b.paternity_leave, b.special_benefits_for_women, 'UNDO', leaveTypeCode, restoredDays, app_data.inclusive_dates || null]
        );

        await connection.commit();
        res.json({ success: true });
    } catch (error) {
        await connection.rollback();
        res.status(500).json({ error: error.message });
    } finally {
        connection.release();
    }
});

router.post('/api/leaves/reject', async (req, res) => {
    const { application_id } = req.body;
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const [apps] = await connection.execute('SELECT * FROM leave_applications WHERE id = ?', [application_id]);
        if (apps.length === 0) throw new Error('Application not found');
        const app_data = apps[0];

        // Check if the leave application belongs to a closed month (accrual already generated)
        const leaveDateReject = new Date(app_data.applied_at);
        const leaveMonthReject = leaveDateReject.getMonth() + 1;
        const leaveYearReject = leaveDateReject.getFullYear();
        const [accrualLogsReject] = await connection.execute(
            'SELECT * FROM accrual_logs WHERE (year > ?) OR (year = ? AND month >= ?)',
            [leaveYearReject, leaveYearReject, leaveMonthReject]
        );
        if (accrualLogsReject.length > 0) {
            throw new Error(`Reject Locked: This leave application belongs to a closed month (${leaveMonthReject}/${leaveYearReject}). To correct credits, please perform a Manual Balance Adjustment.`);
        }

        if (app_data.leave_type === LEAVE_TYPES.FORCE) {
            // === FORCE LEAVE SPECIAL CASE: Exigency of Service ===
            // Rejected Force Leave days are transferred to Vacation Leave
            const transferDays = parseFloat(app_data.num_days || 0);

            // 1. Deduct from force_leave balance, credit to vacation_leave
            await connection.execute(
                'UPDATE leave_balances SET force_leave = force_leave - ?, vacation_leave = vacation_leave + ? WHERE employee_id = ?',
                [transferDays, transferDays, app_data.employee_id]
            );

            // 2. Reject the application
            await connection.execute('UPDATE leave_applications SET status = "Rejected" WHERE id = ?', [application_id]);

            // 3. Take a fresh snapshot of all balances after the update
            const [new_bal] = await connection.execute('SELECT * FROM leave_balances WHERE employee_id = ?', [app_data.employee_id]);
            const b = new_bal[0];

            // 4. DOUBLE ENTRY LEDGER SYSTEM:
            
            // ENTRY A: Updates the VL Card (The "Credit")
            // Routes to VL Card via leave_type='VL'. Shows as "Earned" via balance diff.
            await connection.execute(
                'INSERT INTO ledger (employee_id, transaction_desc, vl_bal, sl_bal, sp_bal, fl_bal, wl_bal, spl_bal, mat_bal, pat_bal, sbw_bal, transaction_type, leave_type, earned, remarks, period_text) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [
                    app_data.employee_id,
                    'VL Transfer (Force Leave Rejected)',
                    b.vacation_leave, b.sick_leave, b.special_leave, b.force_leave, b.wellness_leave, b.solo_parent_leave, b.maternity_leave, b.paternity_leave, b.special_benefits_for_women,
                    'TRANSFER',
                    'VL',
                    transferDays,
                    'Exigency of Service: Force Leave transferred to VL',
                    app_data.inclusive_dates || null
                ]
            );

            // ENTRY B: Updates the Privilege Card (The "Debit")
            // Routes to Privilege Card via leave_type='Force Leave'. Shows as "Absence w/ Pay" via balance diff.
            await connection.execute(
                'INSERT INTO ledger (employee_id, transaction_desc, vl_bal, sl_bal, sp_bal, fl_bal, wl_bal, spl_bal, mat_bal, pat_bal, sbw_bal, transaction_type, leave_type, earned, remarks, period_text) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [
                    app_data.employee_id,
                    'VL Transfer (Force Leave Rejected)',
                    b.vacation_leave, b.sick_leave, b.special_leave, b.force_leave, b.wellness_leave, b.solo_parent_leave, b.maternity_leave, b.paternity_leave, b.special_benefits_for_women,
                    'TRANSFER',
                    LEAVE_TYPES.FORCE,
                    0,
                    'Exigency of Service: Transferred to VL',
                    app_data.inclusive_dates || null
                ]
            );
        } else {
            // === STANDARD REJECTION: No balance changes, simple status update ===
            await connection.execute('UPDATE leave_applications SET status = "Rejected" WHERE id = ?', [application_id]);
        }

        await connection.commit();
        res.json({ success: true });
    } catch (error) {
        await connection.rollback();
        res.status(500).json({ error: error.message });
    } finally {
        connection.release();
    }
});

router.get('/api/leaves/history', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const search = req.query.search || '';
        const offset = (page - 1) * limit;

        let countQuery = `
            SELECT COUNT(*) as total 
            FROM leave_applications l
            JOIN employees e ON l.employee_id = e.id
            WHERE l.status != 'Pending Approval'
        `;
        let dataQuery = `
            SELECT l.*, e.full_name,
                   (SELECT COUNT(*) FROM accrual_logs a WHERE (a.year > YEAR(l.applied_at)) OR (a.year = YEAR(l.applied_at) AND a.month >= MONTH(l.applied_at))) > 0 AS is_closed
            FROM leave_applications l
            JOIN employees e ON l.employee_id = e.id
            WHERE l.status != 'Pending Approval'
        `;
        
        let queryParams = [];
        
        if (search) {
            const searchTerm = `%${search}%`;
            countQuery += ` AND (e.full_name LIKE ? OR l.employee_id LIKE ?)`;
            dataQuery += ` AND (e.full_name LIKE ? OR l.employee_id LIKE ?)`;
            queryParams.push(searchTerm, searchTerm);
        }
        
        dataQuery += ` ORDER BY l.applied_at DESC LIMIT ${limit} OFFSET ${offset}`;

        const [countRows] = await db.execute(countQuery, queryParams);
        const total = countRows[0].total;

        const [rows] = await db.execute(dataQuery, queryParams);

        res.json({
            data: rows,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit)
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
