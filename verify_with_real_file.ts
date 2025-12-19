import * as fs from "fs";
import { parseExcelBuffer } from "./server/utils/excel_parser";

const filePath = "/Users/imacdesantiago/proyecto pili/pili/attached_assets/pilar_prueba_1766008488535.xlsx";

async function verify() {
    console.log(`Reading file: ${filePath}`);
    const buffer = fs.readFileSync(filePath);

    console.log("Running parseExcelBuffer...");
    const result = parseExcelBuffer(buffer, 1);

    console.log("\nResults Summary:");
    console.log(`Total rows processed: ${result.totalRows}`);
    console.log(`Projects created: ${result.projects.length}`);

    console.log("\n--- FIRST 20 PROJECTS ---");
    result.projects.slice(0, 20).forEach((p, i) => {
        console.log(`Row ${i + 5}: Name='${p.projectName}', ID='${p.legacyId}'`);
    });

    const ids = result.projects.map(p => p.legacyId).filter(id => id !== null);
    const idCounts: Record<string, number> = {};
    ids.forEach(id => {
        if (id) idCounts[id] = (idCounts[id] || 0) + 1;
    });

    console.log("\n--- ID Duplicate Check ---");
    Object.entries(idCounts).forEach(([id, count]) => {
        if (count > 1) {
            console.log(`ID '${id}' appears ${count} times!`);
        }
    });
}

verify().catch(console.error);
