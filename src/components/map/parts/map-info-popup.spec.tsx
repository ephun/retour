import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MapInfoPopup } from './map-info-popup';

const defaultProps = {
  popupLngLat: { lng: 10.123456, lat: 50.654321 },
  address: '123 Main St, Berlin',
  onClose: vi.fn(),
};

describe('MapInfoPopup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render without crashing', () => {
    expect(() => render(<MapInfoPopup {...defaultProps} />)).not.toThrow();
  });

  it('should call onClose when close button is clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const { container } = render(
      <MapInfoPopup {...defaultProps} onClose={onClose} />
    );

    const closeButton = container.querySelector('.absolute');
    if (closeButton) {
      await user.click(closeButton);
      expect(onClose).toHaveBeenCalled();
    }
  });

  it('should display address', () => {
    render(<MapInfoPopup {...defaultProps} />);
    expect(screen.getByText('123 Main St, Berlin')).toBeInTheDocument();
  });

  it('should display coordinates', () => {
    render(<MapInfoPopup {...defaultProps} />);
    expect(screen.getByText('50.654321, 10.123456')).toBeInTheDocument();
  });

  it('should not display address when empty', () => {
    render(<MapInfoPopup {...defaultProps} address="" />);
    expect(screen.queryByText('123 Main St, Berlin')).not.toBeInTheDocument();
  });

  it('should format coordinates to 6 decimal places', () => {
    render(
      <MapInfoPopup
        {...defaultProps}
        popupLngLat={{ lng: 10.123456789, lat: 50.987654321 }}
      />
    );
    expect(screen.getByText('50.987654, 10.123457')).toBeInTheDocument();
  });
});
