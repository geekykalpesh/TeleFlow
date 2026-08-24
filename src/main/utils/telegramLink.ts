export interface ParsedTelegramLink {
  chatId: string | null;
  messageId: number | null;
}

/**
 * Parses Telegram post URLs or message IDs into channel ID and message ID.
 * Examples:
 *  - https://t.me/c/3429930878/642 => { chatId: "-1003429930878", messageId: 642 }
 *  - https://t.me/mychannel/1250 => { chatId: "mychannel", messageId: 1250 }
 *  - 642 => { chatId: null, messageId: 642 }
 */
export function parseTelegramLink(input: string | number | undefined | null): ParsedTelegramLink {
  if (!input) return { chatId: null, messageId: null };
  const str = String(input).trim();

  // Pattern 1: Private channel post link e.g. https://t.me/c/3429930878/642 or t.me/c/3429930878/642
  const privateMatch = str.match(/t\.me\/c\/(\d+)\/(\d+)/i);
  if (privateMatch) {
    const rawId = privateMatch[1];
    const messageId = parseInt(privateMatch[2], 10);
    const chatId = rawId.startsWith('-100') ? rawId : `-100${rawId}`;
    return { chatId, messageId };
  }

  // Pattern 2: Public channel post link e.g. https://t.me/channel_username/642 or t.me/channel_username/642
  const publicMatch = str.match(/t\.me\/([a-zA-Z0-9_]+)\/(\d+)/i);
  if (publicMatch) {
    const chatId = publicMatch[1];
    const messageId = parseInt(publicMatch[2], 10);
    return { chatId, messageId };
  }

  // Pattern 3: Simple numeric message ID e.g. "642"
  const numericMatch = str.match(/^(\d+)$/);
  if (numericMatch) {
    return { chatId: null, messageId: parseInt(numericMatch[1], 10) };
  }

  return { chatId: null, messageId: null };
}
