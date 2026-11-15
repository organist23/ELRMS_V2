// Closed-month lock.
// A month is "closed" once monthly credits were generated for that month or any later month
// (a row in accrual_logs). Records from a closed month can no longer be approved, rejected,
// undone or redone.

// SQL expression giving 1/0 for "the month of <dateColumn> is closed" (used as `... AS is_closed`).
const isClosedSql = (dateColumn) =>
    `(SELECT COUNT(*) FROM accrual_logs a WHERE (a.year > YEAR(${dateColumn})) OR (a.year = YEAR(${dateColumn}) AND a.month >= MONTH(${dateColumn}))) > 0`;

// Throws "<action> Locked: This <record> belongs to a closed month (M/YYYY). ..." when the month of
// `date` is closed. The month is taken in the server's local timezone, as before.
async function assertMonthOpen(connection, date, action, record) {
    const d = new Date(date);
    const month = d.getMonth() + 1;
    const year = d.getFullYear();
    const [logs] = await connection.execute(
        'SELECT * FROM accrual_logs WHERE (year > ?) OR (year = ? AND month >= ?)',
        [year, year, month]
    );
    if (logs.length > 0) {
        throw new Error(`${action} Locked: This ${record} belongs to a closed month (${month}/${year}). To correct credits, please perform a Manual Balance Adjustment.`);
    }
}

module.exports = { isClosedSql, assertMonthOpen };
