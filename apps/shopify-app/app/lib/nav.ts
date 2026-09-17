import type { IconName } from '../components/Icon';

export interface NavItem {
  to: string;
  label: string;
  icon: IconName;
  /** Match only the exact path (for the dashboard at `/`). */
  end?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: 'home', end: true },
  { to: '/designs', label: 'Designs', icon: 'image' },
  { to: '/generations', label: 'Generations', icon: 'sparkles' },
  { to: '/orders', label: 'Orders', icon: 'package' },
  { to: '/models', label: 'Models', icon: 'cpu' },
  { to: '/privacy', label: 'Privacy requests', icon: 'shield' },
  { to: '/settings', label: 'Settings', icon: 'settings' },
];
