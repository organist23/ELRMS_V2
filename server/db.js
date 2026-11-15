const mysql = require('mysql2/promise');
const path = require('path');
const fs = require('fs');
const { getDbConnectionConfig } = require('./dbConfig');

// 1. Detect environment more robustly
const isPackaged = process.mainModule && process.mainModule.filename ? process.mainModule.filename.includes('app.asar') : false;
const envPathProd = process.resourcesPath ? path.join(process.resourcesPath, '.env') : null;
const envPathDev = path.join(__dirname, '.env');

// 2. Prioritize Production path if it exists and we are packaged
let envPath = (isPackaged && envPathProd && fs.existsSync(envPathProd)) ? envPathProd : envPathDev;

if (fs.existsSync(envPath)) {
    require('dotenv').config({ path: envPath });
    console.log(`[DB] Loaded configuration from: ${envPath}`);
}

// 3. Initialize Pool with robust fallbacks
const pool = mysql.createPool({
  ...getDbConnectionConfig(),
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

module.exports = pool;
