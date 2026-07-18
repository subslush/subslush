import fs from 'node:fs';
import path from 'node:path';

describe('admin-next MMU timeline source', () => {
  it('renders MMU timeline labels from backend fields instead of raw cycle indexes', () => {
    const source = fs.readFileSync(
      path.resolve(
        __dirname,
        '../../frontend/src/routes/admin-next/fulfillment/mmu/[taskId]/+page.svelte'
      ),
      'utf8'
    );

    expect(source).toContain('monthLabel(item)');
    expect(source).toContain('shortMonthLabel(item)');
    expect(source).toContain(
      'Initial delivery · {termStart ? formatDate(termStart) :'
    );
    expect(source).not.toContain('Month {toNumber(item.mmu_cycle_index');
    expect(source).not.toContain('history[0]?.due_date');
    expect(source).not.toContain('`Month ${cycleIndex} of ${cycleTotal}`');
  });

  it('includes the next coverage label in completion feedback', () => {
    const source = fs.readFileSync(
      path.resolve(
        __dirname,
        '../../frontend/src/routes/admin-next/fulfillment/mmu/[taskId]/+page.svelte'
      ),
      'utf8'
    );
    expect(source).toContain('Next: ${next}.');
    expect(source).toContain(
      'task.next_month_label || task.next_mmu_label || null'
    );
    expect(source).not.toContain('const nextCoverageLabel');
    expect(source).not.toContain('coveredTo + 1');
  });

  it('keeps credential provisioning out of the MMU schedule display', () => {
    const source = fs.readFileSync(
      path.resolve(
        __dirname,
        '../../frontend/src/routes/admin-next/subscriptions/+page.svelte'
      ),
      'utf8'
    );
    expect(source).toContain("task.task_type === 'manual_monthly_upgrade'");
    expect(source).toContain('{#each selectedMmuTasks as task}');
  });
});
