// Mock implementation of uuid for Jest tests
// This solves the ESM compatibility issue with uuid v13+

export const v4 = jest.fn(() => 'mocked-uuid-v4');

export default {
  v4
};