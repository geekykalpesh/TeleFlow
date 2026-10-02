import { telegramClient } from './src/main/services/telegramClient';
import { Api } from 'telegram';
async function test() {
  try {
    await telegramClient.connect();
    // Use a test channel id if possible, but we don't have one we can easily connect to.
    // Let's just output the types of Api.MessageReplyHeader.
    console.log(Object.keys(Api.MessageReplyHeader.prototype || {}));
    console.log(Object.keys(Api.Message.prototype || {}));
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}
test();
