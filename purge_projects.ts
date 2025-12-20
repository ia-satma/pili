import { db } from './server/db';
import { projects } from './shared/schema';

async function purge() {
    console.log("Starting Database Purge...");
    try {
        await db.delete(projects);
        console.log("✅ Database Wiped Successfully (projects table)");
    } catch (err) {
        console.error("❌ Error purging database:", err);
    }
    process.exit(0);
}

purge();
