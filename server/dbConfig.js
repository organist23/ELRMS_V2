// MySQL connection settings from the environment (server/.env, loaded by db.js), shared by the
// connection pool (db.js) and the database backup (routes/system.js).
// Read at call time, as each caller did before. Note: when DB_PASSWORD is not set at all the
// password falls back to 'admin' (an empty DB_PASSWORD= means an empty password).
function getDbConnectionConfig() {
    return {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT) || 3306,
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD === undefined ? 'admin' : process.env.DB_PASSWORD,
        database: process.env.DB_NAME || 'elrms_v2',
    };
}

module.exports = { getDbConnectionConfig };
