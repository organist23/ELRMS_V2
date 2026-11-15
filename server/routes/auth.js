const express = require('express');
const db = require('../db');
const bcrypt = require('bcrypt');
const { SALT_ROUNDS } = require('../constants');

const router = express.Router();

// 1. Authentication
router.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        // 1. Find user by username only (never compare plain text)
        const [users] = await db.execute('SELECT * FROM admin_users WHERE username = ?', [username]);
        if (users.length === 0) {
            return res.status(401).json({ success: false, message: 'Invalid credentials.' });
        }
        // 2. Compare typed password against stored hash
        const isMatch = await bcrypt.compare(password, users[0].password);
        if (!isMatch) {
            return res.status(401).json({ success: false, message: 'Invalid credentials.' });
        }
        res.json({ success: true, user: { username: users[0].username } });
    } catch (error) {
        console.error('Login Error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Reset Password (Forgot Password)
router.put('/api/auth/reset-password', async (req, res) => {
    const { username, newPassword } = req.body;
    try {
        const [users] = await db.execute('SELECT * FROM admin_users WHERE username = ?', [username]);
        if (users.length === 0) {
            return res.status(404).json({ error: 'Username not found.' });
        }
        // Hash the new password before saving
        const hashed = await bcrypt.hash(newPassword, SALT_ROUNDS);
        await db.execute('UPDATE admin_users SET password = ? WHERE username = ?', [hashed, username]);
        res.json({ success: true, message: 'Password updated successfully.' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
