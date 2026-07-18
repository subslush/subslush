import { describe, expect, it } from 'vitest';
import type { ProductVariantOption } from '$lib/types/subscription';
import { resolveListingTerm, resolveListingVariant } from './listingSelection';

const variant: ProductVariantOption = {
	id: 'six-month-variant',
	plan_code: 'six-month-plan',
	display_name: 'Six month listing',
	description: '',
	features: [],
	base_price: 12,
	currency: 'USD',
	term_options: [
		{ months: 1, total_price: 12, is_recommended: true },
		{ months: 6, total_price: 72, is_recommended: false }
	]
};

describe('storefront listing selection', () => {
	it('binds the sole listing variant to the product duration, not the recommended first term', () => {
		expect(resolveListingVariant([variant])).toBe(variant);
		expect(resolveListingTerm({ variant, durationMonths: 6 })).toEqual(
			expect.objectContaining({ months: 6, total_price: 72 })
		);
	});

	it('refuses ambiguous variants or terms instead of silently buying the first', () => {
		expect(resolveListingVariant([variant, { ...variant, id: 'other' }])).toBeNull();
		expect(resolveListingTerm({ variant, durationMonths: null })).toBeNull();
	});
});
