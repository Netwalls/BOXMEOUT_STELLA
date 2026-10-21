/**
 * Cursor checkpointing for the Soroban event poll loop (B-112 / #1410).
 *
 * getEvents returns events only, so the cursor used to advance only on ledgers
 * that contained events. On a quiet chain the persisted cursor fell behind the
 * network head and /ready reported lag that did not exist.
 *
 * A page that is shorter than its limit holds every event up to latestLedger,
 * so the cursor can safely move to latestLedger. A full page may have more
 * events below latestLedger, so the cursor must stay where it is.
 */

export interface EventsPage {
  latestLedger: number;
  eventCount: number;
}

/**
 * Returns the ledger the cursor may advance to after a getEvents page, or
 * null when it must not move.
 */
export function checkpointLedgerForPage(
  page: EventsPage,
  limit: number,
  fromLedger: number
): number | null {
  if (page.eventCount >= limit) return null;
  if (page.latestLedger <= fromLedger) return null;
  return page.latestLedger;
}
