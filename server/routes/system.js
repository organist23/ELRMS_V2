const express = require('express');
const db = require('../db');
const mysqldump = require('mysqldump');

const router = express.Router();

// ============================================================
// CONNECTION TEST ROUTE
// ============================================================
router.get('/api/ping', async (req, res) => {
    try {
        await db.execute('SELECT 1');
        res.json({ success: true, message: 'Database connected successfully.' });
    } catch (error) {
        let message = 'Unknown database error.';
        if (error.code === 'ECONNREFUSED') {
            message = 'MySQL is not running. Please start WAMP or XAMPP first.';
        } else if (error.code === 'ER_ACCESS_DENIED_ERROR') {
            message = 'Access denied. Check DB_USER and DB_PASSWORD in your .env file.';
        } else if (error.code === 'ER_BAD_DB_ERROR') {
            message = 'Database not found on this server. Check DB_NAME and DB_PORT in your .env file. You may be connecting to the wrong MySQL instance.';
        } else if (error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND') {
            message = 'Connection timed out. Check DB_HOST and DB_PORT in your .env file.';
        } else {
            message = error.message;
        }
        res.status(500).json({ success: false, message });
    }
});

// 7. System Utilities
router.get('/api/system/backup', async (req, res) => {
    try {
        const dump = await mysqldump({
            connection: {
                host: process.env.DB_HOST || 'localhost',
                user: process.env.DB_USER || 'root',
                password: process.env.DB_PASSWORD === undefined ? 'admin' : process.env.DB_PASSWORD,
                database: process.env.DB_NAME || 'elrms_v2',
                port: parseInt(process.env.DB_PORT) || 3306
            },
        });
        
        // Combine schema and data for a full backup
        const fullDump = dump.dump.schema + '\n\n' + dump.dump.data;
        
        res.setHeader('Content-Type', 'application/sql');
        res.setHeader('Content-Disposition', `attachment; filename="elrms_backup_${new Date().toISOString().split('T')[0]}.sql"`);
        res.send(fullDump);
    } catch (error) {
        console.error('Backup Error:', error);
        res.status(500).json({ error: 'Database backup failed: ' + error.message });
    }
});

module.exports = router;
