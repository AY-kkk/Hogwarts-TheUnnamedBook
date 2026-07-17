import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../lib/db';
import { hasAgeAcknowledgement } from '../../services/safety';
import { AgeGate } from './AgeGate';

describe('AgeGate', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  afterAll(() => db.close());

  it('requires explicit acknowledgement before continuing', async () => {
    const onAccept = vi.fn();
    render(<AgeGate isOpen onAccept={onAccept} onDecline={vi.fn()} />);

    const continueButton = screen.getByRole('button', { name: '确认并继续' });
    expect(continueButton).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(continueButton);

    await waitFor(() => expect(onAccept).toHaveBeenCalledOnce());
    expect(await hasAgeAcknowledgement()).toBe(true);
  });

  it('allows the user to decline without writing acknowledgement', async () => {
    const onDecline = vi.fn();
    render(<AgeGate isOpen onAccept={vi.fn()} onDecline={onDecline} />);

    fireEvent.click(screen.getByRole('button', { name: '暂不进入' }));

    expect(onDecline).toHaveBeenCalledOnce();
    expect(await hasAgeAcknowledgement()).toBe(false);
  });
});
