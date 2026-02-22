
import { render, screen } from '@testing-library/react';
import { HouseCrest } from './HouseCrest';
import { HOUSE_CONFIG } from '../../lib/constants';
import { describe, it, expect } from 'vitest';
import '@testing-library/jest-dom';

describe('HouseCrest', () => {
  it('should not render anything when house is undefined', () => {
    const { container } = render(<HouseCrest house={undefined} />);
    // The wrapper div is always there
    const wrapper = container.firstChild;
    expect(wrapper).toHaveClass('relative w-24 h-24 flex items-center justify-center');
    // But no img or svg inside
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(container.querySelector('svg')).not.toBeInTheDocument();
  });

  it('should render the correct crest for Gryffindor', () => {
    render(<HouseCrest house="Gryffindor" />);
    const img = screen.getByRole('img');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', HOUSE_CONFIG['Gryffindor'].crest);
    expect(img).toHaveAttribute('alt', 'Gryffindor Crest');
  });

  it('should render the correct crest for Slytherin', () => {
    render(<HouseCrest house="Slytherin" />);
    const img = screen.getByRole('img');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', HOUSE_CONFIG['Slytherin'].crest);
  });

  it('should render a placeholder for an unknown house', () => {
    const { container } = render(<HouseCrest house="UnknownHouse" />);
    // Should not have an img tag (because DEFAULT_THEME.crest is empty string)
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    
    // Should have an SVG (Shield icon)
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
    // Ideally check if it has text-gray-400 class (placeholder styling)
    expect(svg).toHaveClass('text-gray-400');
  });

  it('should apply the correct primary color for the glow effect', () => {
    const { container } = render(<HouseCrest house="Ravenclaw" />);
    // The glow div has specific classes
    // We can try to find it by style attribute
    const expectedColor = HOUSE_CONFIG['Ravenclaw'].primary;
    // We can iterate over divs and check style.backgroundColor
    const divs = container.querySelectorAll('div');
    let found = false;
    divs.forEach((div) => {
        if (div.style.backgroundColor === expectedColor || 
            // Handle different color formats if browser normalizes (e.g. rgb)
            // But JSDOM might keep hex if set via style prop?
            // Actually, JSDOM normalizes to rgb usually.
            // Let's rely on the fact that we passed it.
            div.getAttribute('style')?.includes(expectedColor)
        ) {
            found = true;
        }
    });
    // This check is a bit loose but confirms the color is applied somewhere.
    // Given the component structure, it's the glow div.
    expect(found).toBe(true);
  });
});
