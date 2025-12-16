
import { db } from './server/db';
import { getPortfolioSummary, formatSummaryForLLM } from './server/services/chatService';

async function main() {
    try {
        console.log("Fetching portfolio summary...");
        const summary = await getPortfolioSummary();
        console.log("Summary fetched successfully.");
        console.log("Capex Breakdown:", JSON.stringify(summary.capexBreakdown, null, 2));

        console.log("Formatting for LLM...");
        const formatted = formatSummaryForLLM(summary);
        console.log("Formatted Context Length:", formatted.length);
        console.log("Formatted Context Preview:", formatted.substring(0, 200));

        console.log("SUCCESS: Chat Service Logic is sound.");
        process.exit(0);
    } catch (error) {
        console.error("FAILURE: ", error);
        process.exit(1);
    }
}

main();
