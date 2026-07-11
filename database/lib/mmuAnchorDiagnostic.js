'use strict';

const ANCHOR_TOLERANCE_MS = 60 * 60 * 1000;

const toDate = value => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const toIso = value => {
  const date = toDate(value);
  return date ? date.toISOString() : null;
};

const classifyMmuAnchor = row => {
  const termMonths = Math.max(1, Number(row.term_months) || 1);
  const intervalMonths = Math.max(1, Number(row.interval_months) || 1);
  const completedCycles = Math.max(0, Number(row.completed_cycles) || 0);
  const highestCompletedCycle =
    row.max_completed_cycle === null || row.max_completed_cycle === undefined
      ? null
      : Number(row.max_completed_cycle);
  const expectedRenewalCycles = Math.max(
    0,
    Math.ceil(termMonths / intervalMonths) - 1
  );
  const initialCoverageMonths = Math.min(termMonths, intervalMonths);
  const deliveredCoverageMonths =
    initialCoverageMonths + completedCycles * intervalMonths;
  const deliveredExcessMonths = Math.max(
    0,
    deliveredCoverageMonths - termMonths
  );

  const termStart = toDate(row.term_start_at);
  const inferredAnchor = toDate(row.inferred_anchor);
  const firstCompletedTaskCreatedAt = toDate(
    row.first_completed_task_created_at
  );
  const anchorMovedAfterCompletion = Boolean(
    termStart &&
      firstCompletedTaskCreatedAt &&
      termStart.getTime() > firstCompletedTaskCreatedAt.getTime()
  );
  const anchorDiffersFromInitialDelivery = Boolean(
    termStart &&
      inferredAnchor &&
      Math.abs(termStart.getTime() - inferredAnchor.getTime()) >
        ANCHOR_TOLERANCE_MS
  );
  const anchorCorrupt =
    anchorMovedAfterCompletion || anchorDiffersFromInitialDelivery;

  // An intact immutable anchor can only schedule the remaining bounded cycles,
  // regardless of how quickly explicit reference times completed prior cycles.
  // A moved anchor can replay coverage already delivered before the reset.
  const replayableDeliveredMonths = anchorCorrupt
    ? Math.min(
        Math.max(0, termMonths - initialCoverageMonths),
        completedCycles * intervalMonths
      )
    : 0;
  const projectedExcessMonths = Math.max(
    deliveredExcessMonths,
    replayableDeliveredMonths
  );
  const projectedTotalMonths = termMonths + projectedExcessMonths;
  const maxValidCycleIndex = Math.max(0, termMonths - intervalMonths);
  const invalidInterval =
    intervalMonths > termMonths || termMonths % intervalMonths !== 0;

  const flags = [];
  if (invalidInterval) {
    flags.push('invalid_mmu_interval_not_divisible_by_purchased_term');
  }
  if (anchorMovedAfterCompletion) {
    flags.push('anchor_after_first_completed_task_created');
  }
  if (anchorDiffersFromInitialDelivery) {
    flags.push('anchor_differs_from_initial_delivery');
  }
  if (completedCycles > expectedRenewalCycles) {
    flags.push(
      `completed_renewal_cycles_exceed_expected_by_${completedCycles - expectedRenewalCycles}`
    );
  }
  if (
    highestCompletedCycle !== null &&
    highestCompletedCycle > maxValidCycleIndex
  ) {
    flags.push('highest_completed_cycle_exceeds_purchased_term');
  }
  if (deliveredExcessMonths > 0) {
    flags.push(
      `delivered_coverage_exceeds_purchased_term_by_${deliveredExcessMonths}_months`
    );
  }
  if (replayableDeliveredMonths > 0) {
    flags.push(
      `repeat_schedule_can_overdeliver_by_${replayableDeliveredMonths}_months`
    );
  }

  return {
    subscription_id: row.id,
    order_id: row.order_id,
    customer_email: row.customer_email,
    purchased_term_months: termMonths,
    interval_months: intervalMonths,
    immutable_anchor_currently_stored: toIso(row.term_start_at),
    inferred_initial_delivery_anchor: toIso(row.inferred_anchor),
    first_completed_task_created_at: toIso(
      row.first_completed_task_created_at
    ),
    completed_cycles: completedCycles,
    expected_renewal_cycles: expectedRenewalCycles,
    highest_completed_cycle_index: highestCompletedCycle,
    delivered_coverage_months: deliveredCoverageMonths,
    projected_total_months_if_unfixed: projectedTotalMonths,
    projected_excess_months_if_unfixed: projectedExcessMonths,
    flags,
  };
};

module.exports = { ANCHOR_TOLERANCE_MS, classifyMmuAnchor };
