import { storage } from "../storage";
import { generateExportExcel } from "./exportEngine";
import { generateCommitteePacket } from "./committeePacketGenerator";
import { generateChaserDrafts } from "./chaserDraftGenerator";
import { runBatchIndependentLimboDetection } from "./limboDetector";
import { generateSystemDocs } from "./systemDocsGenerator";
import type { Job, InsertJobRun } from "@shared/schema";
import { hostname } from "os";

const POLL_INTERVAL_MS = 5000;
const STALE_LOCK_MINUTES = 10;
const BACKOFF_BASE_MS = 60000;

type JobType = "GENERATE_EXPORT_EXCEL" | "GENERATE_COMMITTEE_PACKET" | "DETECT_LIMBO" | "DRAFT_CHASERS" | "GENERATE_SYSTEM_DOCS";

interface JobHandler {
  (job: Job): Promise<Record<string, unknown>>;
}

const jobHandlers: Record<JobType, JobHandler> = {
  GENERATE_EXPORT_EXCEL: async (job: Job) => {
    const payload = job.payload as { requestedBy?: string; filterCriteria?: Record<string, unknown> };
    const result = await generateExportExcel(payload.requestedBy, payload.filterCriteria);
    return {
      artifactId: result.artifactId,
      batchId: result.batchId,
      fileSize: result.fileSize,
    };
  },

  GENERATE_COMMITTEE_PACKET: async (job: Job) => {
    const result = await generateCommitteePacket(job.id);
    return {
      packetId: result.packetId,
      initiativeCount: result.initiativeCount,
    };
  },

  DETECT_LIMBO: async (_job: Job) => {
    const result = await runBatchIndependentLimboDetection();
    
    const hasPending = await storage.hasPendingJobByType("DETECT_LIMBO");
    if (!hasPending) {
      const nextRun = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await storage.createJob({
        jobType: "DETECT_LIMBO",
        status: "QUEUED",
        payload: {},
        runAt: nextRun,
        attempts: 0,
        maxAttempts: 3,
      });
      console.log(`[Worker] Scheduled next DETECT_LIMBO for ${nextRun.toISOString()}`);
    }
    
    return {
      totalAlerts: result.totalAlerts,
      zombiAlerts: result.zombiAlerts,
      missingSnapshotAlerts: result.missingSnapshotAlerts,
      initiativesChecked: result.initiativesChecked,
    };
  },

  DRAFT_CHASERS: async () => {
    const result = await generateChaserDrafts();
    return {
      draftsCreated: result.draftsCreated,
      initiativesProcessed: result.initiativesProcessed,
    };
  },

  GENERATE_SYSTEM_DOCS: async () => {
    const result = await generateSystemDocs();
    return {
      docsCreated: result.docsCreated,
      docTypes: result.docTypes,
    };
  },
};

function getWorkerId(): string {
  const host = hostname();
  const pid = process.pid;
  return `${host}:${pid}`;
}

function calculateBackoff(attempts: number): Date {
  const delayMs = BACKOFF_BASE_MS * Math.pow(2, attempts);
  return new Date(Date.now() + delayMs);
}

async function processJob(job: Job): Promise<void> {
  const workerId = getWorkerId();
  
  const lockedJob = await storage.lockJob(job.id, workerId);
  if (!lockedJob) {
    return;
  }

  const jobRun = await storage.createJobRun({
    jobId: job.id,
    status: "RUNNING",
  });

  const startTime = Date.now();

  try {
    const handler = jobHandlers[job.jobType as JobType];
    if (!handler) {
      throw new Error(`Unknown job type: ${job.jobType}`);
    }

    const metrics = await handler(lockedJob);
    const finishedAt = new Date();

    await storage.updateJobRun(jobRun.id, {
      status: "SUCCEEDED",
      finishedAt,
      metricsJson: {
        ...metrics,
        durationMs: Date.now() - startTime,
      },
    });

    await storage.updateJob(job.id, {
      status: "SUCCEEDED",
      lastError: null,
    });

    console.log(`[Worker] Job ${job.id} (${job.jobType}) completed successfully`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const finishedAt = new Date();
    const newAttempts = (job.attempts || 0) + 1;

    await storage.updateJobRun(jobRun.id, {
      status: "FAILED",
      finishedAt,
      errorMessage,
      metricsJson: {
        durationMs: Date.now() - startTime,
        error: errorMessage,
      },
    });

    if (newAttempts >= job.maxAttempts) {
      await storage.updateJob(job.id, {
        status: "FAILED",
        attempts: newAttempts,
        lastError: errorMessage,
        lockedBy: null,
        lockedAt: null,
      });
      console.error(`[Worker] Job ${job.id} (${job.jobType}) failed permanently after ${newAttempts} attempts: ${errorMessage}`);
    } else {
      const nextRunAt = calculateBackoff(newAttempts);
      await storage.updateJob(job.id, {
        status: "RETRYING",
        attempts: newAttempts,
        lastError: errorMessage,
        runAt: nextRunAt,
        lockedBy: null,
        lockedAt: null,
      });
      console.warn(`[Worker] Job ${job.id} (${job.jobType}) failed, will retry at ${nextRunAt.toISOString()}: ${errorMessage}`);
    }
  }
}

async function requeueStaleJobs(): Promise<number> {
  const staleJobs = await storage.getStaleRunningJobs(STALE_LOCK_MINUTES);
  let requeued = 0;

  for (const job of staleJobs) {
    const newAttempts = (job.attempts || 0) + 1;
    
    if (newAttempts >= job.maxAttempts) {
      await storage.updateJob(job.id, {
        status: "FAILED",
        attempts: newAttempts,
        lastError: `Job stale after ${STALE_LOCK_MINUTES} minutes - marked as failed`,
        lockedBy: null,
        lockedAt: null,
      });
      console.warn(`[Worker] Stale job ${job.id} marked as failed (max attempts reached)`);
    } else {
      await storage.updateJob(job.id, {
        status: "QUEUED",
        attempts: newAttempts,
        lastError: `Job stale after ${STALE_LOCK_MINUTES} minutes - requeued`,
        lockedBy: null,
        lockedAt: null,
        runAt: new Date(),
      });
      requeued++;
      console.warn(`[Worker] Requeued stale job ${job.id}`);
    }
  }

  return requeued;
}

async function requeueRetryingJobs(): Promise<number> {
  const retryingJobs = await storage.getQueuedJobs(10);
  return 0;
}

async function pollAndProcess(): Promise<void> {
  try {
    await requeueStaleJobs();

    const jobs = await storage.getQueuedJobs(5);
    
    for (const job of jobs) {
      await processJob(job);
    }
  } catch (error) {
    console.error("[Worker] Poll error:", error);
  }
}

let workerInterval: ReturnType<typeof setInterval> | null = null;
let isRunning = false;

export function startWorker(): void {
  if (isRunning) {
    console.log("[Worker] Already running");
    return;
  }

  isRunning = true;
  console.log(`[Worker] Starting with poll interval ${POLL_INTERVAL_MS}ms`);
  
  pollAndProcess();
  
  workerInterval = setInterval(pollAndProcess, POLL_INTERVAL_MS);
}

export function stopWorker(): void {
  if (workerInterval) {
    clearInterval(workerInterval);
    workerInterval = null;
  }
  isRunning = false;
  console.log("[Worker] Stopped");
}

export async function enqueueJob(
  jobType: JobType,
  payload: Record<string, unknown> = {},
  runAt?: Date
): Promise<number> {
  const job = await storage.createJob({
    jobType,
    status: "QUEUED",
    payload,
    runAt: runAt || new Date(),
    attempts: 0,
    maxAttempts: 3,
  });
  
  console.log(`[Worker] Enqueued job ${job.id} (${jobType})`);
  return job.id;
}

export { JobType };
