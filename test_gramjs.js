const { Api, TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');

require('dotenv').config();

const apiId = parseInt(process.env.API_ID);
const apiHash = process.env.API_HASH;
const fs = require('fs');
const initSqlJs = require('sql.js');
const dbPath = 'C:\\Users\\sunit\\AppData\\Roaming\\teleflow\\database\\downloads.db';
let sessionStr = '';

async function start() {
  if (!fs.existsSync(dbPath)) {
    console.log("No DB found");
    return;
  }
  const fileBuffer = fs.readFileSync(dbPath);
  const SQL = await initSqlJs();
  const db = new SQL.Database(fileBuffer);
  
  const res = db.exec("SELECT value FROM settings WHERE key = 'session_string' LIMIT 1");
  if (!res.length || !res[0].values.length) {
    console.log("No session found in DB");
    return;
  }
  
  sessionStr = res[0].values[0][0];
  const stringSession = new StringSession(sessionStr);
  
  console.log('Loading client with saved session...');
  const client = new TelegramClient(stringSession, apiId, apiHash, { connectionRetries: 5 });
  await client.connect();
  console.log('Connected!');

  const inviteLink = 'https://t.me/c/3810808187';
  console.log('Joining group...');
  try {
     const dialogs = await client.getDialogs();
     const entity = dialogs.find(d => d.entity.id && d.entity.id.toString() === '1003810808187' || d.entity.id.toString() === '3810808187')?.entity;
     if (!entity) {
         console.log("Could not find chat in dialogs");
         return;
     }
     const topics = await client.invoke(
         new Api.channels.GetForumTopics({
             channel: entity,
             offsetDate: 0,
             offsetId: 0,
             offsetTopic: 0,
             limit: 10
         })
     );
     console.log('Topics:', topics.topics.map(t => ({ id: t.id, title: t.title })));

     console.log('Fetching replies for topic 16...');
     const allBatch = await client.getMessages(entity, { limit: 100, replyTo: 16 });
     console.log(`Received ${allBatch.length} messages.`);
     
     allBatch.forEach(msg => {
         const replyToObj = msg.replyTo;
         const msgTopicId = replyToObj?.replyToTopId || replyToObj?.replyToMsgId;
         console.log(`Msg ID: ${msg.id}, replyToTopId: ${replyToObj?.replyToTopId}, replyToMsgId: ${replyToObj?.replyToMsgId}`);
     });
  } catch (e) {
      console.log('Error:', e);
  }
}
start();
