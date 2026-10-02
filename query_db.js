const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('C:\\Users\\sunit\\AppData\\Roaming\\teleflow\\database\\teleflow.db');
db.all("SELECT session_id, topic_id, message_id, original_filename FROM download_items WHERE chat_id = '-1003810808187' AND topic_id = 2 LIMIT 15", (err, rows) => console.log(rows));
