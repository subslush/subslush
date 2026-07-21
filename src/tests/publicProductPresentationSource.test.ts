import fs from 'node:fs';
import path from 'node:path';

describe('public product presentation contract', () => {
  const page = fs.readFileSync(
    path.resolve(
      __dirname,
      '../../frontend/src/routes/browse/products/[slug]/+page.svelte'
    ),
    'utf8'
  );

  it('shows the upgrade selector only for customer-selectable options', () => {
    expect(page).toContain('{#if hasSelectionChoices && upgradeOptions}');
    expect(page).not.toContain(
      'This plan requires a manual upgrade workflow after purchase.'
    );
  });

  it('allows product delivery-format metadata to override generated copy', () => {
    expect(page).toContain("'delivery_format_label'");
    expect(page).toContain("'delivery_format_description'");
    expect(page).toContain('if (customDeliveryFormatLabel)');
    expect(page).toContain('if (customDeliveryFormatDescription)');
  });
});
