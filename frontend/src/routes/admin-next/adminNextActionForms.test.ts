import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ProductsPage from './products/+page.svelte';
import ProductDetailPage from './products/[productId=uuid]/+page.svelte';
import OrderFilePage from './orders/[orderId]/+page.svelte';
import CouponsPage from './coupons/+page.svelte';
import type { PageData as ProductsPageData } from './products/$types';
import type { PageData as ProductDetailPageData } from './products/[productId=uuid]/$types';
import type { PageData as OrderFilePageData } from './orders/[orderId]/$types';
import type { PageData as CouponsPageData } from './coupons/$types';

const mocks = vi.hoisted(() => ({
  createProduct: vi.fn(),
  createVariant: vi.fn(),
  createVariantTerm: vi.fn(),
  setCurrentPrice: vi.fn(),
  updateProduct: vi.fn(),
  markOrderPaidManually: vi.fn(),
  createCoupon: vi.fn(),
  invalidateAll: vi.fn(),
}));

vi.mock('$app/navigation', () => ({ invalidateAll: mocks.invalidateAll }));
vi.mock('$lib/api/admin.js', () => ({
  adminService: {
    createProduct: mocks.createProduct,
    createVariant: mocks.createVariant,
    createVariantTerm: mocks.createVariantTerm,
    setCurrentPrice: mocks.setCurrentPrice,
    updateProduct: mocks.updateProduct,
    createCoupon: mocks.createCoupon,
  },
}));
vi.mock('$lib/api/adminNext.js', () => ({
  adminNextService: { markOrderPaidManually: mocks.markOrderPaidManually },
}));

const productData = { products: [], variantCounts: {}, error: '' };

const productDetailData = {
  product: {
    id: 'product-id',
    name: 'Smoke Product',
    slug: 'smoke-product',
    status: 'inactive',
    default_currency: 'USD',
    metadata: {
      upgrade_options: {
        allow_new_account: true,
        strict_rules: true,
        strict_rules_version: 1,
      },
    },
  },
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
    mocks.updateProduct.mockResolvedValue({ id: 'product-id' });
    mocks.markOrderPaidManually.mockResolvedValue({});
    mocks.createCoupon.mockResolvedValue({ id: 'coupon-id' });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    mocks.createProduct.mockReset();
    mocks.createVariant.mockReset();
    mocks.createVariantTerm.mockReset();
    mocks.setCurrentPrice.mockReset();
    mocks.updateProduct.mockReset();
    mocks.markOrderPaidManually.mockReset();
    mocks.createCoupon.mockReset();
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

  it('converts coupon datetime-local bounds to zoned ISO timestamps', async () => {
    const view = render(CouponsPage, {
      data: { coupons: [], products: [], newsletter: null, error: '' } as unknown as CouponsPageData,
    });
    const couponPage = within(view.container);

    const codeLabel = couponPage.getAllByText('Code').find(node => node.closest('label'))!;
    await fireEvent.input(codeLabel.closest('label')!.querySelector('input')!, {
      target: { value: 'QA-DATE' },
    });
    await fireEvent.input(couponPage.getByText('Start').closest('label')!.querySelector('input')!, {
      target: { value: '2026-07-11T10:30' },
    });
    await fireEvent.input(couponPage.getByText('End').closest('label')!.querySelector('input')!, {
      target: { value: '2026-07-12T10:30' },
    });
    await fireEvent.click(couponPage.getByRole('button', { name: 'Create coupon' }));

    await waitFor(() => expect(mocks.createCoupon).toHaveBeenCalledTimes(1));
    expect(mocks.createCoupon).toHaveBeenCalledWith(expect.objectContaining({
      starts_at: new Date('2026-07-11T10:30').toISOString(),
      ends_at: new Date('2026-07-12T10:30').toISOString(),
    }));
  });

  it('hides expired coupons by default and reveals them with the toggle', async () => {
    const expiredCode = 'QA-EXPIRED-VISIBLE';
    const view = render(CouponsPage, {
      data: {
        coupons: [
          {
            id: 'expired-coupon-id',
            code: expiredCode,
            percent_off: 5,
            scope: 'global',
            apply_scope: 'highest_eligible_item',
            status: 'active',
            starts_at: '2026-01-01T00:00:00.000Z',
            ends_at: '2026-01-02T00:00:00.000Z',
            redemptions_used: 0,
          },
        ],
        products: [],
        newsletter: null,
        error: '',
      } as unknown as CouponsPageData,
    });
    const couponPage = within(view.container);

    expect(couponPage.queryByText(expiredCode)).toBeNull();
    await fireEvent.click(couponPage.getByLabelText('Include expired'));
    await waitFor(() => expect(couponPage.getByText(expiredCode)).toBeTruthy());
  });

  it('submits the one product variant through the native form', async () => {
    render(ProductDetailPage, { data: productDetailData as unknown as ProductDetailPageData });

    await fireEvent.click(screen.getByRole('button', { name: 'Variants & Terms' }));
    await fireEvent.input(screen.getByPlaceholderText('Name'), { target: { value: 'Smoke variant' } });
    await fireEvent.input(screen.getByPlaceholderText('Code'), { target: { value: 'smoke-variant' } });
    await fireEvent.submit(screen.getByRole('button', { name: 'Create product variant' }).closest('form')!);

    await waitFor(() => expect(mocks.createVariant).toHaveBeenCalledTimes(1));
    expect(mocks.createVariant).toHaveBeenCalledWith(expect.objectContaining({
      product_id: 'product-id',
      name: 'Smoke variant',
      variant_code: 'smoke-variant',
    }));
  });

  it('persists strict-rules text and its incremented version in one product update', async () => {
    const view = render(ProductDetailPage, { data: productDetailData as unknown as ProductDetailPageData });
    const productPage = within(view.container);

    await fireEvent.click(productPage.getByRole('button', { name: 'Fulfillment settings' }));
    const rulesInput = productPage.getByText('Rules text').closest('label')?.querySelector('textarea');
    expect(rulesInput).not.toBeNull();
    await fireEvent.input(rulesInput!, {
      target: { value: '<script>alert(1)</script> Do not change the profile.' },
    });
    await fireEvent.click(productPage.getByRole('button', { name: 'Save fulfillment settings' }));

    await waitFor(() => expect(mocks.updateProduct).toHaveBeenCalledTimes(1));
    expect(mocks.updateProduct).toHaveBeenCalledWith(
      'product-id',
      expect.objectContaining({
        metadata: expect.objectContaining({
          upgrade_options: expect.objectContaining({
            strict_rules: true,
            strict_rules_text: '<script>alert(1)</script> Do not change the profile.',
            strict_rules_version: 2,
          }),
        }),
      }),
    );
  });

  it('persists custom delivery-format copy from the catalog presentation form', async () => {
    const view = render(ProductDetailPage, {
      data: productDetailData as unknown as ProductDetailPageData,
    });
    const productPage = within(view.container);

    await fireEvent.click(productPage.getByRole('button', { name: 'Catalog' }));
    await fireEvent.input(productPage.getByLabelText('Delivery format title'), {
      target: { value: 'Activation code delivery' },
    });
    await fireEvent.input(productPage.getByLabelText('Delivery format details'), {
      target: { value: 'A redemption code is emailed after purchase.' },
    });
    await fireEvent.click(productPage.getByRole('button', { name: 'Save presentation' }));

    await waitFor(() => expect(mocks.updateProduct).toHaveBeenCalledTimes(1));
    expect(mocks.updateProduct).toHaveBeenCalledWith(
      'product-id',
      expect.objectContaining({
        metadata: expect.objectContaining({
          delivery_format_label: 'Activation code delivery',
          delivery_format_description:
            'A redemption code is emailed after purchase.',
        }),
      }),
    );
  });
});
