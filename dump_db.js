import { db } from './server/db.js';
import { projects } from './shared/schema.js';
import { eq } from 'drizzle-orm';

async function dump() {
    const all = await db.select().from(projects).limit(5);
    console.log(JSON.stringify(all, null, 2));
    process.exit(0);
}

dump();
