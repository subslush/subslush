import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ProductsPage from './products/+page.svelte';
import ProductDetailPage from './products/[productId=uuid]/+page.svelte';
import OrderFilePage from './orders/[orderId]/+page.svelte';
import type { PageData as ProductsPageData } from './products/$types';
import type { PageData as ProductDetailPageData } from './products/[productId=uuid]/$types';
import type { PageData as OrderFilePageData } from './orders/[orderId]/$types';

const mocks = vi.hoisted(() => ({
  createProduct: vi.fn(),
  createVariant: vi.fn(),
  createVariantTerm: vi.fn(),
  setCurrentPrice: vi.fn(),
  markOrderPaidManually: vi.fn(),
  invalidateAll: vi.fn(),
}));

vi.mock('$app/navigation', () => ({ invalidateAll: mocks.invalidateAll }));
vi.mock('$lib/api/admin.js', () => ({
  adminService: {
    createProduct: mocks.createProduct,
    createVariant: mocks.createVariant,
    createVariantTerm: mocks.createVariantTerm,
    setCurrentPrice: mocks.setCurrentPrice,
  },
}));
vi.mock('$lib/api/adminNext.js', () => ({
  adminNextService: { markOrderPaidManually: mocks.markOrderPaidManually },
}));

const productData = { products: [], variantCounts: {}, error: '' };

const productDetailData = {
  product: { id: 'product-id', name: 'Smoke Product', slug: 'smoke-product', status: 'inactive', default_currency: 'USD', metadata: {} },
  variants: [],
  variantTerms: [],
  priceHistory: [],
  media: [],
};

const pendingOrderData = {
  error: '',
  file: {
    order: {
      id: '11111111-1111-4111-8111-111111111111',
      status: 'pending_payment',
      payment_provider: 'stripe',
      created_at: '2026-07-10T00:00:00.000Z',
      total_cents: 1000,
      currency: 'USD',
    },
    customer: { delivery_email: 'qa-form@example.test' },
    items: [],
    payments: [],
    payment_events: [],
    evidence: [],
    emails: [],
    guest_claim: null,
    open_fulfillment: [],
  },
};

describe('admin-next action forms', () => {
  beforeEach(() => {
    mocks.createProduct.mockResolvedValue({ id: 'product-id' });
    mocks.createVariant.mockResolvedValue({ id: 'variant-id' });
    mocks.createVariantTerm.mockResolvedValue({ id: 'term-id' });
    mocks.setCurrentPrice.mockResolvedValue({ id: 'price-id' });
    mocks.markOrderPaidManually.mockResolvedValue({});
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    mocks.createProduct.mockReset();
    mocks.createVariant.mockReset();
    mocks.createVariantTerm.mockReset();
    mocks.setCurrentPrice.mockReset();
    mocks.markOrderPaidManually.mockReset();
    mocks.invalidateAll.mockReset();
  });

  it('submits product creation through real DOM input and submit events', async () => {
    render(ProductsPage, { data: productData as unknown as ProductsPageData });

    await fireEvent.click(screen.getByRole('button', { name: '+ New product' }));
    await fireEvent.input(screen.getByLabelText('Name'), { target: { value: 'QA Browser Product' } });
    await fireEvent.input(screen.getByLabelText('Slug'), { target: { value: 'qa-browser-product' } });
    await fireEvent.input(screen.getByLabelText('Service type'), { target: { value: 'qa' } });
    await fireEvent.input(screen.getByLabelText('Category'), { target: { value: 'QA' } });

    const submit = screen.getByRole('button', { name: 'Create inactive product' });
    expect((submit as HTMLButtonElement).disabled).toBe(false);
    await fireEvent.submit(submit.closest('form')!);

    await waitFor(() => expect(mocks.createProduct).toHaveBeenCalledTimes(1));
    expect(mocks.createProduct).toHaveBeenCalledWith(expect.objectContaining({
      name: 'QA Browser Product',
      slug: 'qa-browser-product',
      status: 'inactive',
    }));
  });

  it('submits manual mark-paid through real DOM input and submit events', async () => {
    render(OrderFilePage, { data: pendingOrderData as unknown as OrderFilePageData });

    const note = screen.getByLabelText('Verification note');
    await fireEvent.input(note, { target: { value: 'Confirmed in provider dashboard.' } });
    const submit = screen.getByRole('button', { name: 'Mark as paid manually' });
    expect((submit as HTMLButtonElement).disabled).toBe(false);
    await fireEvent.submit(submit.closest('form')!);

    await waitFor(() => expect(mocks.markOrderPaidManually).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
      'Confirmed in provider dashboard.',
    ));
  });

  it('propagates a newly created variant into the native term form and submits the term', async () => {
    render(ProductDetailPage, { data: productDetailData as unknown as ProductDetailPageData });

    await fireEvent.click(screen.getByRole('button', { name: 'Variants & Terms' }));
    await fireEvent.input(screen.getByPlaceholderText('Name'), { target: { value: 'Smoke variant' } });
    await fireEvent.input(screen.getByPlaceholderText('Code'), { target: { value: 'smoke-variant' } });
    await fireEvent.submit(screen.getByRole('button', { name: 'Add variant' }).closest('form')!);

    await waitFor(() => expect(mocks.createVariant).toHaveBeenCalledTimes(1));
    await fireEvent.submit(screen.getByRole('button', { name: 'Add term' }).closest('form')!);

    await waitFor(() => expect(mocks.createVariantTerm).toHaveBeenCalledWith(expect.objectContaining({
      product_variant_id: 'variant-id',
      months: 1,
      discount_percent: 0,
    })));
  });
});
