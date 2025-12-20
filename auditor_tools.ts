import { db } from './server/db';
import { projects } from './shared/schema';
import { sql } from "drizzle-orm";

async function runAuditorTools() {
    console.log("==========================================");
    console.log("🕵️  AUDITOR NUCLEUS: TOOLS INITIATING...");
    console.log("==========================================");

    // 1. REPAIR SCHEMA
    console.log("\n[1/3] 🛠️  Checking Schema Integrity...");
    try {
        await db.execute(sql`
            DO $$ 
            BEGIN 
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                    WHERE table_name='projects' AND column_name='source_origin') THEN
                    ALTER TABLE projects ADD COLUMN source_origin text DEFAULT 'SYSTEM' NOT NULL;
                    RAISE NOTICE 'Column source_origin added to projects table';
                    PERFORM pg_notify('log', 'Schema repaired: source_origin added');
                ELSE
                     PERFORM pg_notify('log', 'Schema integrity verified: source_origin exists');
                END IF;
            END $$;
        `);
        console.log("✅ Schema Integrity Verified.");
    } catch (err) {
        console.error("❌ Schema Repair Failed:", err);
    }

    // 2. AUDIT REPORT
    console.log("\n[2/3] 📊 Generating Pre-Purge Audit Report...");
    try {
        const stats = await db.execute(sql`
            SELECT source_origin, count(*) as count 
            FROM projects 
            GROUP BY source_origin
        `);
        console.table(stats.rows);

        const total = await db.execute(sql`SELECT count(*) FROM projects`);
        console.log(`Total Records: ${total.rows[0].count}`);
    } catch (err) {
        console.error("❌ Audit Failed:", err);
    }

    // 3. NUCLEAR PURGE
    console.log("\n[3/3] ☢️  Initiating NUCLEAR PURGE...");
    try {
        const result = await db.delete(projects);
        console.log(`✅ PURGE COMPLETE. All project records deleted.`);
    } catch (err) {
        console.error("❌ Purge Failed:", err);
    }

    console.log("\n==========================================");
    console.log("🛡️  SYSTEM SECURED. READY FOR CLEAN IMPORT.");
    console.log("==========================================");
    process.exit(0);
}

runAuditorTools();
