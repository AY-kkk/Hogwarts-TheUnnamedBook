import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AdminEntryLink } from './AdminEntryLink';

describe('administrator entry link', () => {
  it('keeps a direct path to the model configuration console available', () => {
    render(<AdminEntryLink />);

    expect(screen.getByRole('link', { name: '后台管理与模型配置' })).toHaveAttribute(
      'href',
      '/admin',
    );
  });
});
