const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

async function queryDB() {
  const dbPath = 'C:\\Users\\sunit\\AppData\\Roaming\\teleflow\\database\\downloads.db';
  if (!fs.existsSync(dbPath)) {
    console.log('DB not found at:', dbPath);
    return;
  }
  
  const fileBuffer = fs.readFileSync(dbPath);
  const SQL = await initSqlJs();
  const db = new SQL.Database(fileBuffer);
  
  const res = db.exec("SELECT id, title, topic_id, total_files FROM sessions ORDER BY created_at DESC LIMIT 15");
  if (res.length > 0) {
    console.table(res[0].values);
  } else {
    console.log("No sessions found.");
  }
}

queryDB();
