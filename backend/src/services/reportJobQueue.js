/* services/reportJobQueue.js
 * P3: In-process FIFO queue for Tier-2 Excel generation. exceljs is CPU-bound
 * in a single Node process, so jobs are serialized rather than run in
 * parallel (parallel workers only thrash the CPU). A row is persisted as
 * PENDING before enqueueing; the job flips it PROCESSING -> READY/FAILED.
 *
 * Future upgrade: a persistent ReportJob table + dedicated worker process so
 * generation survives a restart. Today the queue is in-memory by design.
 */
import logger from '../utils/logger.js';

const queue = [];
let running = false;

export const enqueueReportJob = (job) => {
  queue.push(job);
  logger.info({ event: 'report_job_queued', reportId: job.reportId, depth: queue.length });
  pump();
};

export const reportQueueStats = () => ({ depth: queue.length, running });

const pump = async () => {
  if (running) return;
  running = true;
  while (queue.length) {
    const job = queue.shift();
    try {
      await job.run();
    } catch (err) {
      try {
        await job.fail(err);
      } catch (failErr) {
        logger.error({ event: 'report_job_fail_handler_error', reportId: job.reportId, error: failErr?.message });
      }
    }
  }
  running = false;
};