import type { ProductTermOption, ProductVariantOption } from '$lib/types/subscription';

export const resolveListingVariant = (
	variants: ProductVariantOption[]
): ProductVariantOption | null => (variants.length === 1 ? variants[0] || null : null);

export const resolveListingTerm = (params: {
	variant: ProductVariantOption;
	durationMonths?: number | null;
}): ProductTermOption | null => {
	const terms = params.variant.term_options;
	if (!Array.isArray(terms) || terms.length === 0) return null;
	if (terms.length === 1) return terms[0] || null;

	const durationMonths = Number(params.durationMonths);
	if (!Number.isInteger(durationMonths) || durationMonths <= 0) return null;
	return terms.find((term) => term.months === durationMonths) || null;
};
