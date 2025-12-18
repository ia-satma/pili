import * as XLSX from "xlsx";
import { parseExcelBuffer } from "./server/utils/excel_parser";

async function verify() {
    console.log("Creating mock Excel buffer...");

    const data = [
        ["Metadata 1", "Garbage"],
        ["Weighting", 15, 15, 15],
        ["More Metadata", ""],
        ["ID Power Steering", "Card ID DevOps", "Iniciativa", "Descripción", "Status", "Líder", "Progreso", "Beneficios Estimados", "Esfuerzo", "Fecha Inicio"],
        ["PS-001", "DO-001", "Proyecto de Prueba 1", "Una descripción", "On time", "Juan Perez", 0.5, "1M USD", 10, "2025-12-01"],
        [null, null, "", "Empty row test", null, null, null, null, null, null],
        ["PS-002", null, "Smart Grid Implementation", "High value", "Delayed", "Maria Garcia", 75, "500k", 20, "2025-12-15"],
    ];

    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Proyectos PGP");

    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    console.log("Running parseExcelBuffer...");
    const result = parseExcelBuffer(buffer, 1);

    console.log("\nResults Summary:");
    console.log(`Total rows processed: ${result.totalRows}`);
    console.log(`Projects created: ${result.projects.length}`);

    result.projects.forEach((p, i) => {
        console.log(`\nProject ${i + 1}:`);
        console.log(`  Name: ${p.projectName}`);
        console.log(`  PS ID: ${p.powerSteeringId}`);
        console.log(`  DO ID: ${p.devopsCardId}`);
        console.log(`  Leader: ${p.leader}`);
        console.log(`  Status: ${p.status}`);
        console.log(`  Progress: ${p.percentComplete}%`);
        console.log(`  Impact: ${p.financialImpact}`);
        console.log(`  Start Date: ${p.startDate}`);
    });

    // Verify Row 2 weighting was skipped
    const hasWeighting = result.projects.some(p => p.projectName === "Weighting" || p.description === "15");
    if (hasWeighting) {
        console.error("\n❌ FAILED: Found metadata rows in results!");
    } else {
        console.log("\n✅ SUCCESS: Metadata rows were correctly skipped.");
    }

    // Verify "Iniciativa" empty skip
    const hasEmpty = result.projects.some(p => !p.projectName);
    if (hasEmpty) {
        console.error("❌ FAILED: Found project with empty name!");
    } else {
        console.log("✅ SUCCESS: Empty 'Iniciativa' rows were skipped.");
    }
}

verify().catch(console.error);
