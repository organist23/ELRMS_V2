const express = require('express');
const db = require('../db');

const router = express.Router();

router.get('/api/ledger/history', async (req, res) => {
    try {
        const { employee_id, search, startDate, endDate } = req.query;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20; // Improved pagination limit: 20 per page!
        const offset = (page - 1) * limit;

        let conditions = [];
        let params = [];

        if (employee_id) {
            conditions.push(`l.employee_id = ?`);
            params.push(employee_id);
        }

        if (search) {
            conditions.push(`(e.full_name LIKE ? OR l.employee_id LIKE ? OR l.transaction_desc LIKE ?)`);
            const searchTerm = `%${search}%`;
            params.push(searchTerm, searchTerm, searchTerm);
        }

        if (startDate) {
            conditions.push(`l.action_date >= ?`);
            params.push(startDate);
        }

        if (endDate) {
            conditions.push(`l.action_date <= ?`);
            params.push(`${endDate} 23:59:59`);
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        // Get total count
        const countQuery = `
            SELECT COUNT(*) as total 
            FROM ledger l
            JOIN employees e ON l.employee_id = e.id
            ${whereClause}
        `;
        const [countRows] = await db.execute(countQuery, params);
        const total = countRows[0].total;

        // Get paginated data
        const query = `
            SELECT l.*, e.full_name 
            FROM ledger l 
            JOIN employees e ON l.employee_id = e.id 
            ${whereClause}
            ORDER BY l.action_date DESC, l.id DESC
            LIMIT ${limit} OFFSET ${offset}
        `;
        const [rows] = await db.execute(query, params);

        res.json({
            data: rows,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit)
        });
    } catch (error) {
        console.error('Ledger History Error:', error);
        res.status(500).json({ error: 'Failed to fetch ledger history' });
    }
});

module.exports = router;
