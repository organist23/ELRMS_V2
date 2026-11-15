const express = require('express');
const db = require('../db');

const router = express.Router();

// 2. Employees CRUD
router.get('/api/employees', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const search = req.query.search || '';
        const includeInactive = req.query.include_inactive === 'true';
        const offset = (page - 1) * limit;

        // By default only fetch active employees; pass include_inactive=true to fetch all
        let whereClause = includeInactive ? 'WHERE 1=1' : 'WHERE e.is_active = 1';
        let params = [];

        if (search) {
            whereClause += ' AND (e.full_name LIKE ? OR e.id LIKE ? OR e.position LIKE ? OR e.office LIKE ? OR e.status LIKE ?)';
            params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
        }

        // 1. Get Total Count for Pagination (Using LEFT JOIN to match data query)
        const [countRows] = await db.execute(`
            SELECT COUNT(*) as total 
            FROM employees e 
            LEFT JOIN leave_balances b ON e.id = b.employee_id
            ${whereClause}
        `, params);
        const total = countRows[0].total;

        // 2. Get Paginated Data
        const [rows] = await db.execute(`
            SELECT e.*, b.vacation_leave, b.sick_leave, b.special_leave, b.force_leave, b.wellness_leave, b.solo_parent_leave, b.maternity_leave, b.paternity_leave, b.special_benefits_for_women, b.bbw_vl, b.bbw_sl, b.forwarded_vl, b.forwarded_sl
            FROM employees e
            LEFT JOIN leave_balances b ON e.id = b.employee_id
            ${whereClause}
            ORDER BY e.full_name ASC
            LIMIT ${limit} OFFSET ${offset}
        `, params);

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

router.post('/api/employees', async (req, res) => {
    const { id, full_name, sex, civil_status, gsis_policy, position, entrance_of_duty, tin, status, office, initial_vl, initial_sl } = req.body;
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        
        await connection.execute(
            'INSERT INTO employees (id, full_name, sex, civil_status, gsis_policy, position, entrance_of_duty, tin, status, office) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [id, full_name, sex, civil_status, gsis_policy, position, entrance_of_duty, tin, status, office]
        );

        await connection.execute(
            'INSERT INTO leave_balances (employee_id, vacation_leave, sick_leave, bbw_vl, bbw_sl, forwarded_vl, forwarded_sl, special_benefits_for_women, paternity_leave) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [id, initial_vl || 0, initial_sl || 0, initial_vl || 0, initial_sl || 0, initial_vl || 0, initial_sl || 0, 30, sex === 'Male' ? 7 : 0]
        );

        await connection.execute(
            'INSERT INTO ledger (employee_id, transaction_desc, vl_bal, sl_bal, sp_bal, fl_bal, wl_bal, spl_bal, mat_bal, pat_bal, sbw_bal, transaction_type, remarks, period_text) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [id, 'First Registration: Initial Balance Set', initial_vl || 0, initial_sl || 0, 3, 5, 5, 7, 105, 7, 30, 'REGISTRATION', 'Initial Balance', new Date().getFullYear()]
        );

        await connection.commit();
        res.json({ success: true, message: 'Employee registered' });
    } catch (error) {
        await connection.rollback();
        res.status(500).json({ error: error.message });
    } finally {
        connection.release();
    }
});

router.put('/api/employees/:id', async (req, res) => {
    const { full_name, sex, civil_status, gsis_policy, position, entrance_of_duty, tin, status, office, vacation_leave, sick_leave } = req.body;
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        // 1. Get old balances for comparison
        const [old] = await connection.execute('SELECT * FROM leave_balances WHERE employee_id = ? FOR UPDATE', [req.params.id]);
        if (old.length === 0) throw new Error('Employee not found');
        
        const old_vl = old[0]?.vacation_leave || 0;
        const old_sl = old[0]?.sick_leave || 0;

        // Validation: Prevent negative balances
        if (parseFloat(vacation_leave) < 0 || parseFloat(sick_leave) < 0) {
            throw new Error('Balances cannot be negative.');
        }

        // 2. Update credentials
        await connection.execute(
            'UPDATE employees SET full_name=?, sex=?, civil_status=?, gsis_policy=?, position=?, entrance_of_duty=?, tin=?, status=?, office=? WHERE id=?',
            [full_name, sex, civil_status, gsis_policy, position, entrance_of_duty, tin, status, office, req.params.id]
        );

        // 3. Update balances (VL and SL only)
        await connection.execute(
            'UPDATE leave_balances SET vacation_leave = ?, sick_leave = ? WHERE employee_id = ?',
            [vacation_leave, sick_leave, req.params.id]
        );

        // 4. Ledger entry if balances changed
        if (Math.abs(parseFloat(old_vl) - parseFloat(vacation_leave)) > 0.0001 || Math.abs(parseFloat(old_sl) - parseFloat(sick_leave)) > 0.0001) {
            const [b_rows] = await connection.execute('SELECT * FROM leave_balances WHERE employee_id = ?', [req.params.id]);
            const b = b_rows[0];
            const desc = `Manual Update: ${full_name}'s balances adjusted by Admin. (Old VL: ${parseFloat(old_vl).toFixed(3)}, Old SL: ${parseFloat(old_sl).toFixed(3)})`;
            
            let updatedTypes = [];
            if (Math.abs(parseFloat(old_vl) - parseFloat(vacation_leave)) > 0.0001) updatedTypes.push('VL');
            if (Math.abs(parseFloat(old_sl) - parseFloat(sick_leave)) > 0.0001) updatedTypes.push('SL');
            const leaveTypeLabel = updatedTypes.join('/') || 'ADJUSTMENT';

            await connection.execute(
                'INSERT INTO ledger (employee_id, transaction_desc, vl_bal, sl_bal, sp_bal, fl_bal, wl_bal, spl_bal, mat_bal, pat_bal, sbw_bal, transaction_type, leave_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [req.params.id, desc, b.vacation_leave, b.sick_leave, b.special_leave, b.force_leave, b.wellness_leave, b.solo_parent_leave, b.maternity_leave, b.paternity_leave, b.special_benefits_for_women, 'MANUAL', leaveTypeLabel]
            );
        }

        await connection.commit();
        res.json({ success: true, message: 'Employee and balances updated' });
    } catch (error) {
        await connection.rollback();
        console.error('Update Error:', error.message);
        res.status(400).json({ error: error.message });
    } finally {
        connection.release();
    }
});

router.delete('/api/employees/:id', async (req, res) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        // 1. Soft Delete
        await connection.execute('UPDATE employees SET is_active = 0 WHERE id = ?', [req.params.id]);

        // 2. Log in Ledger
        const [b_rows] = await connection.execute('SELECT * FROM leave_balances WHERE employee_id = ?', [req.params.id]);
        const b = b_rows[0];
        
        await connection.execute(
            'INSERT INTO ledger (employee_id, transaction_desc, vl_bal, sl_bal, sp_bal, fl_bal, wl_bal, spl_bal, mat_bal, pat_bal, sbw_bal) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [req.params.id, 'Account Archived: Employee moved to inactive records.', b.vacation_leave, b.sick_leave, b.special_leave, b.force_leave, b.wellness_leave, b.solo_parent_leave, b.maternity_leave, b.paternity_leave, b.special_benefits_for_women]
        );

        await connection.commit();
        res.json({ success: true, message: 'Employee archived successfully' });
    } catch (error) {
        await connection.rollback();
        res.status(500).json({ error: error.message });
    } finally {
        connection.release();
    }
});

router.get('/api/employees/:id/yearly-history', async (req, res) => {
    try {
        const [rows] = await db.execute(
            'SELECT * FROM yearly_credits_archive WHERE employee_id = ? ORDER BY year DESC',
            [req.params.id]
        );
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
