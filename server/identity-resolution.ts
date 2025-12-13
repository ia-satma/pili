import { db } from "./db";
import { initiatives } from "@shared/schema";
import { eq } from "drizzle-orm";

interface InitiativeIdentity {
  devopsCardId?: string | null;
  powerSteeringId?: string | null;
  title: string;
  owner?: string | null;
}

/**
 * Resolves or creates an initiative based on identity fields.
 * Priority: devopsCardId > powerSteeringId > (title + owner) if minimum data present
 * Returns initiative ID
 */
export async function resolveOrCreateInitiative(identity: InitiativeIdentity): Promise<number | null> {
  // Step 1: Try to find by devopsCardId
  if (identity.devopsCardId) {
    const existing = await db.select().from(initiatives)
      .where(eq(initiatives.devopsCardId, identity.devopsCardId))
      .limit(1);
    if (existing.length > 0) {
      return existing[0].id;
    }
  }
  
  // Step 2: Try to find by powerSteeringId
  if (identity.powerSteeringId) {
    const existing = await db.select().from(initiatives)
      .where(eq(initiatives.powerSteeringId, identity.powerSteeringId))
      .limit(1);
    if (existing.length > 0) {
      return existing[0].id;
    }
  }
  
  // Step 3: If no IDs, require title + owner minimum
  if (!identity.devopsCardId && !identity.powerSteeringId) {
    if (!identity.title || !identity.owner) {
      return null; // Cannot create without minimum data
    }
  }
  
  // Step 4: Create new initiative
  const [newInitiative] = await db.insert(initiatives).values({
    devopsCardId: identity.devopsCardId || null,
    powerSteeringId: identity.powerSteeringId || null,
    title: identity.title,
    owner: identity.owner || null,
    currentStatus: null,
    isActive: true,
  }).returning();
  
  return newInitiative.id;
}
