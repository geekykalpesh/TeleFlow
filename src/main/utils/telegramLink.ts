export interface ParsedTelegramLink {
  chatId: string | null;
  messageId: number | null;
  topicId?: number | null;
}

/**
 * Parses Telegram post URLs or message IDs into channel ID, topic ID, and message ID.
 * Examples:
 *  - https://t.me/c/2586510339/3578/3580 => { chatId: "-1002586510339", topicId: 3578, messageId: 3580 }
 *  - https://t.me/c/2586510339/3578 => { chatId: "-1002586510339", topicId: null, messageId: 3578 }
 *  - https://t.me/c/2586510339 => { chatId: "-1002586510339", topicId: null, messageId: null }
 *  - https://t.me/mychannel/1250 => { chatId: "mychannel", topicId: null, messageId: 1250 }
 *  - 642 => { chatId: null, topicId: null, messageId: 642 }
 */
export function parseTelegramLink(input: string | number | undefined | null): ParsedTelegramLink {
  if (!input) return { chatId: null, messageId: null, topicId: null };
  const str = String(input).trim();

  // Pattern 1: Private channel post link with topic e.g. https://t.me/c/2586510339/3578/3580
  const privateTopicMatch = str.match(/t\.me\/c\/(\d+)\/(\d+)\/(\d+)/i);
  if (privateTopicMatch) {
    const rawId = privateTopicMatch[1];
    const topicId = parseInt(privateTopicMatch[2], 10);
    const messageId = parseInt(privateTopicMatch[3], 10);
    const chatId = rawId.startsWith('-100') ? rawId : `-100${rawId}`;
    return { chatId, topicId, messageId };
  }

  // Pattern 2: Private channel post link e.g. https://t.me/c/3429930878/642 or t.me/c/3429930878/642
  const privateMatch = str.match(/t\.me\/c\/(\d+)\/(\d+)/i);
  if (privateMatch) {
    const rawId = privateMatch[1];
    const messageId = parseInt(privateMatch[2], 10);
    const chatId = rawId.startsWith('-100') ? rawId : `-100${rawId}`;
    return { chatId, messageId, topicId: null };
  }

  // Pattern 3: Private channel base link e.g. https://t.me/c/3429930878
  const privateBaseMatch = str.match(/t\.me\/c\/(\d+)/i);
  if (privateBaseMatch) {
    const rawId = privateBaseMatch[1];
    const chatId = rawId.startsWith('-100') ? rawId : `-100${rawId}`;
    return { chatId, messageId: null, topicId: null };
  }

  // Pattern 4: Public channel post link with topic e.g. https://t.me/channel_username/3578/3580
  const publicTopicMatch = str.match(/t\.me\/([a-zA-Z0-9_]+)\/(\d+)\/(\d+)/i);
  if (publicTopicMatch) {
    return {
      chatId: publicTopicMatch[1],
      topicId: parseInt(publicTopicMatch[2], 10),
      messageId: parseInt(publicTopicMatch[3], 10)
    };
  }

  // Pattern 5: Public channel post link e.g. https://t.me/channel_username/642 or t.me/channel_username/642
  const publicMatch = str.match(/t\.me\/([a-zA-Z0-9_]+)\/(\d+)/i);
  if (publicMatch) {
    const chatId = publicMatch[1];
    const messageId = parseInt(publicMatch[2], 10);
    return { chatId, messageId, topicId: null };
  }

  // Pattern 6: Public channel link e.g. https://t.me/channel_username or @channel_username
  const handleMatch = str.match(/(?:t\.me\/|@)([a-zA-Z0-9_]+)/i);
  if (handleMatch) {
    return { chatId: handleMatch[1], messageId: null, topicId: null };
  }

  // Pattern 7: Raw channel ID e.g. -1002586510339 or 2586510339
  const rawIdMatch = str.match(/^(-100\d+|\d{9,})$/);
  if (rawIdMatch) {
    const rawId = rawIdMatch[1];
    const chatId = rawId.startsWith('-100') ? rawId : `-100${rawId}`;
    return { chatId, messageId: null, topicId: null };
  }

  // Pattern 8: Simple numeric message ID e.g. "642"
  const numericMatch = str.match(/^(\d{1,8})$/);
  if (numericMatch) {
    return { chatId: null, messageId: parseInt(numericMatch[1], 10), topicId: null };
  }

  return { chatId: null, messageId: null, topicId: null };
}
