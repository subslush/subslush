import { validateCheckoutAntomStatusInput } from '../schemas/checkout';

describe('Checkout Antom status schema', () => {
  const orderId = '11111111-1111-4111-8111-111111111111';

  it('accepts omitted, null, and blank Antom identifiers as absent', () => {
    const omitted = validateCheckoutAntomStatusInput({
      order_id: orderId,
      payment_request_id: 'antom_request_123',
    });
    expect(omitted.success).toBe(true);
    if (omitted.success) {
      expect(omitted.data.payment_id).toBeNull();
    }

    const explicitNull = validateCheckoutAntomStatusInput({
      order_id: orderId,
      payment_request_id: 'antom_request_123',
      payment_id: null,
    });
    expect(explicitNull.success).toBe(true);
    if (explicitNull.success) {
      expect(explicitNull.data.payment_id).toBeNull();
    }

    const blankValues = validateCheckoutAntomStatusInput({
      checkout_session_key: 'checkout_abc12345',
      payment_request_id: '   ',
      payment_id: '',
    });
    expect(blankValues.success).toBe(true);
    if (blankValues.success) {
      expect(blankValues.data.payment_request_id).toBeNull();
      expect(blankValues.data.payment_id).toBeNull();
    }
  });
});
