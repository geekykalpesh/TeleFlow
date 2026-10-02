import { telegramClient } from './src/main/services/telegramClient.ts';
import { scannerService } from './src/main/services/scannerService.ts';
import { dbService } from './src/main/services/dbService.ts';
import * as path from 'path';
import * as fs from 'fs';
require('dotenv').config();

async function test() {
    console.log('Initializing DB...');
    dbService.init();

    console.log('Initializing Telegram...');
    await telegramClient.init();


    
    console.log('Starting scan...');
    const sessions = await scannerService.scanAndEnqueueAllTopics({
        chat_id: '-1003810808187',
        chat_title: 'Train With Shubham Udaan Batch',
        download_mode: 'sequential',
        concurrency: 1,
        skip_existing_files: false
    });
    
    console.log('Scan finished. Sessions:', sessions.length);
    for (const session of sessions) {
        console.log(`Session: ${session.topic_title} -> ${session.total_files} files`);
    }
    
    process.exit(0);
}

test().catch(console.error);
