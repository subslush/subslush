import type { ProductListing } from '$lib/types/subscription.js';

export type ProductDisplaySort = 'recommended' | 'price_low' | 'price_high';

export interface ProductDisplayGroup {
	key: string;
	label: string;
	products: ProductListing[];
}

const FALLBACK_GROUP_KEY = '__uncategorized__';
const FALLBACK_GROUP_LABEL = 'Other';
const PLAN_QUALIFIER_STOP_WORDS = new Set([
	'month',
	'months',
	'monthly',
	'year',
	'years',
	'yearly',
	'annual',
	'annually',
	'subscription',
	'subscriptions',
	'plan',
	'plans',
	'access'
]);

const collator = new Intl.Collator(undefined, {
	numeric: true,
	sensitivity: 'base'
});

const normalizeText = (value?: string | null): string =>
	(value || '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, ' ')
		.trim();

const tokenize = (value?: string | null): string[] =>
	normalizeText(value).split(' ').filter(Boolean);

const toTitleCase = (value: string): string =>
	value
		.split(/[\s_-]+/)
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(' ');

const compareText = (left: string, right: string): number => collator.compare(left, right);

const resolveMonthlyPrice = (product: ProductListing): number => {
	const price = Number(product.from_price);
	return Number.isFinite(price) && price >= 0 ? price : Number.POSITIVE_INFINITY;
};

const resolveTermMonths = (product: ProductListing): number => {
	const months = Number(product.from_term_months);
	return Number.isFinite(months) && months > 0 ? months : Number.POSITIVE_INFINITY;
};

const resolveSubCategoryKey = (product: ProductListing): string => {
	const key = normalizeText(product.sub_category);
	return key || FALLBACK_GROUP_KEY;
};

const resolveSubCategoryLabel = (product: ProductListing): string => {
	const label = (product.sub_category || '').trim();
	if (label) {
		return label;
	}
	return FALLBACK_GROUP_LABEL;
};

const buildPlanFamilyKey = (product: ProductListing, subCategoryLabel?: string): string => {
	const serviceTokens = new Set(tokenize(subCategoryLabel || product.sub_category));
	const familyTokens = tokenize(product.name).filter((token) => {
		if (serviceTokens.has(token)) {
			return false;
		}
		if (PLAN_QUALIFIER_STOP_WORDS.has(token)) {
			return false;
		}
		if (/^\d+$/.test(token)) {
			return false;
		}
		return true;
	});

	return familyTokens.join(' ') || 'default';
};

const buildPlanFamilyMinPrices = (
	products: ProductListing[],
	subCategoryLabel?: string
): Map<string, number> => {
	const prices = new Map<string, number>();
	for (const product of products) {
		const familyKey = buildPlanFamilyKey(product, subCategoryLabel);
		const current = prices.get(familyKey) ?? Number.POSITIVE_INFINITY;
		prices.set(familyKey, Math.min(current, resolveMonthlyPrice(product)));
	}
	return prices;
};

export const sortProductsForDisplay = (
	products: ProductListing[],
	sortBy: ProductDisplaySort,
	subCategoryLabel?: string
): ProductListing[] => {
	const productsToSort = [...products];

	if (sortBy === 'price_low') {
		return productsToSort.sort(
			(a, b) =>
				resolveMonthlyPrice(a) - resolveMonthlyPrice(b) ||
				resolveTermMonths(a) - resolveTermMonths(b) ||
				compareText(a.name, b.name)
		);
	}

	if (sortBy === 'price_high') {
		return productsToSort.sort(
			(a, b) =>
				resolveMonthlyPrice(b) - resolveMonthlyPrice(a) ||
				resolveTermMonths(a) - resolveTermMonths(b) ||
				compareText(a.name, b.name)
		);
	}

	const familyMinPrices = buildPlanFamilyMinPrices(productsToSort, subCategoryLabel);

	return productsToSort.sort((a, b) => {
		const aFamily = buildPlanFamilyKey(a, subCategoryLabel);
		const bFamily = buildPlanFamilyKey(b, subCategoryLabel);
		const familyPriceCompare =
			(familyMinPrices.get(aFamily) ?? Number.POSITIVE_INFINITY) -
			(familyMinPrices.get(bFamily) ?? Number.POSITIVE_INFINITY);
		if (familyPriceCompare !== 0) {
			return familyPriceCompare;
		}

		return (
			compareText(aFamily, bFamily) ||
			resolveTermMonths(a) - resolveTermMonths(b) ||
			resolveMonthlyPrice(a) - resolveMonthlyPrice(b) ||
			compareText(a.name, b.name)
		);
	});
};

export const buildProductDisplayGroups = (
	products: ProductListing[],
	sortBy: ProductDisplaySort
): ProductDisplayGroup[] => {
	const groups = new Map<string, { label: string; products: ProductListing[] }>();

	for (const product of products) {
		const key = resolveSubCategoryKey(product);
		const existing = groups.get(key);
		if (existing) {
			existing.products.push(product);
			continue;
		}
		groups.set(key, {
			label: resolveSubCategoryLabel(product),
			products: [product]
		});
	}

	return Array.from(groups.entries())
		.map(([key, group]) => ({
			key,
			label: group.label || toTitleCase(key),
			products: sortProductsForDisplay(group.products, sortBy, group.label)
		}))
		.sort((a, b) => {
			if (a.key === FALLBACK_GROUP_KEY) return 1;
			if (b.key === FALLBACK_GROUP_KEY) return -1;
			return compareText(a.label, b.label);
		});
};
