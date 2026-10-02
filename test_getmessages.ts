import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';
import { Api } from 'telegram';

const apiId = 23961726; // Publicly available testing app ID
const apiHash = '4e86a07ce1e004dd0ebf2a89a0e6ea3b'; // Publicly available testing app hash
const client = new TelegramClient(new StringSession(''), apiId, apiHash, { connectionRetries: 1 });

async function test() {
  try {
    await client.start({ botAuthToken: '' }); // We won't actually log in, but we might not need to if we just want to see the error or behavior.
    // Actually, we can't fetch messages without logging in.
  } catch(e) {}
  process.exit(0);
}
test();
