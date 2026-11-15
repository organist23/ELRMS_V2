const express = require('express');
const db = require('../db');

const router = express.Router();

// 5. Statistics
router.get('/api/stats', async (req, res) => {
    try {
        const [empCount] = await db.execute('SELECT COUNT(*) as total FROM employees WHERE is_active = 1');
        const [pendingCount] = await db.execute('SELECT COUNT(*) as total FROM leave_applications WHERE status = "Pending Approval"');
        
        res.json({
            totalEmployees: empCount[0].total,
            pendingApproval: pendingCount[0].total
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
