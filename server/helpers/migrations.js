// Small additive schema migrations, run once at startup before the server accepts requests.
// Each one checks information_schema first, so running it again does nothing.

async function columnExists(db, table, column) {
    const [rows] = await db.execute(
        'SELECT COUNT(*) AS n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
        [table, column]
    );
    return rows[0].n > 0;
}

async function runMigrations(db) {
    // 2026-11: remember how much of a tardy deduction was actually taken from VL, so Undo gives back
    // exactly that amount (when VL was too low, the rest was without pay and never deducted).
    if (!(await columnExists(db, 'tardy_deductions', 'deducted_with_pay'))) {
        await db.execute('ALTER TABLE tardy_deductions ADD COLUMN deducted_with_pay DECIMAL(10,3) NULL DEFAULT NULL AFTER equivalent_day');
        console.log('[Migration] Added tardy_deductions.deducted_with_pay');
    }
}

module.exports = { runMigrations };
