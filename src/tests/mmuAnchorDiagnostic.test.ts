import fs from 'node:fs';
import path from 'node:path';

// The production diagnostic is CommonJS because it is executed directly by Node.
const { classifyMmuAnchor } = require('../../database/lib/mmuAnchorDiagnostic');

describe('MMU anchor diagnostic lifecycle classification', () => {
  it.each([
    {
      id: 'cc378347-48c4-43ba-b6fd-f301045b3808',
      term_months: 6,
      interval_months: 1,
      term_start_at: '2026-07-11T08:23:42.842Z',
      inferred_anchor: '2026-07-11T08:23:42.842Z',
      first_completed_task_created_at: '2026-07-11T08:51:05.297Z',
      completed_cycles: 5,
      max_completed_cycle: 5,
    },
    {
      id: '19988bd8-93f6-4c65-ae8f-f05f57e8a191',
      term_months: 12,
      interval_months: 2,
      term_start_at: '2026-07-11T08:25:09.206Z',
      inferred_anchor: '2026-07-11T08:25:09.206Z',
      first_completed_task_created_at: '2026-07-11T08:52:58.982Z',
      completed_cycles: 5,
      max_completed_cycle: 10,
    },
  ])('does not flag reference-time-compressed correct fixture $id', row => {
    const finding = classifyMmuAnchor(row);
    expect(finding.flags).toEqual([]);
    expect(finding.delivered_coverage_months).toBe(row.term_months);
    expect(finding.projected_excess_months_if_unfixed).toBe(0);
  });

  it('keeps known intact fixture 9b619566 unflagged', () => {
    const finding = classifyMmuAnchor({
      id: '9b619566-b9df-442d-a1ed-d45de0e42241',
      term_months: 12,
      interval_months: 2,
      term_start_at: '2026-07-09T22:44:59.256Z',
      inferred_anchor: '2026-07-09T22:44:59.256Z',
      completed_cycles: 0,
      max_completed_cycle: null,
    });
    expect(finding.flags).toEqual([]);
  });

  it('keeps known corrupt fixture a84c8871 flagged without wall-clock projection', () => {
    const finding = classifyMmuAnchor({
      id: 'a84c8871-b58a-4f8b-99fa-193ebf476277',
      term_months: 6,
      interval_months: 1,
      term_start_at: '2026-07-09T19:58:32.658Z',
      inferred_anchor: '2026-06-14T22:00:00.000Z',
      first_completed_task_created_at: '2026-07-09T19:58:23.911Z',
      completed_cycles: 1,
      max_completed_cycle: 1,
    });
    expect(finding.flags).toEqual(
      expect.arrayContaining([
        'anchor_after_first_completed_task_created',
        'anchor_differs_from_initial_delivery',
        'repeat_schedule_can_overdeliver_by_1_months',
      ])
    );
  });

  it('flags actual delivered coverage beyond the purchased term', () => {
    const finding = classifyMmuAnchor({
      id: 'actual-overdelivery',
      term_months: 6,
      interval_months: 1,
      term_start_at: '2026-01-01T00:00:00Z',
      inferred_anchor: '2026-01-01T00:00:00Z',
      completed_cycles: 6,
      max_completed_cycle: 6,
    });
    expect(finding.flags).toEqual(
      expect.arrayContaining([
        'completed_renewal_cycles_exceed_expected_by_1',
        'highest_completed_cycle_exceeds_purchased_term',
        'delivered_coverage_exceeds_purchased_term_by_1_months',
      ])
    );
  });

  it('does not weaken detection for an invalid legacy interval', () => {
    const finding = classifyMmuAnchor({
      id: 'invalid-legacy-interval',
      term_months: 6,
      interval_months: 4,
      term_start_at: '2026-01-01T00:00:00Z',
      inferred_anchor: '2026-01-01T00:00:00Z',
      completed_cycles: 0,
      max_completed_cycle: null,
    });
    expect(finding.flags).toContain(
      'invalid_mmu_interval_not_divisible_by_purchased_term'
    );
  });

  it('keeps the known abb2499c expired fixture outside the active-only scan', () => {
    // The fixture classification is exclusion, not a clean active finding.
    const knownFixture = {
      id: 'abb2499c-4d4e-4f95-82f9-9f71b685b05d',
      status: 'expired',
    };
    expect(knownFixture.status).not.toBe('active');
    const script = fs.readFileSync(
      path.resolve(__dirname, '../../database/diagnose-mmu-anchors.js'),
      'utf8'
    );
    expect(script).toContain("WHERE s.status = 'active'");
  });
});
