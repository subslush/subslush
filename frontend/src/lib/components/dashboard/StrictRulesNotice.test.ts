import { render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import StrictRulesNotice from './StrictRulesNotice.svelte';

describe('StrictRulesNotice', () => {
	it('renders configured rules as inert text and includes their version', () => {
		const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
		const rules = '<script>alert(1)</script> Do not change the profile.';

		const { container } = render(StrictRulesNotice, {
			text: rules,
			version: 7
		});

		expect(screen.getByTestId('strict-rules-text').textContent?.trim()).toBe(rules);
		expect(screen.getByText('Rules version 7')).toBeTruthy();
		expect(container.querySelector('script')).toBeNull();
		expect(container.innerHTML).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
		expect(alertSpy).not.toHaveBeenCalled();

		alertSpy.mockRestore();
	});
});
