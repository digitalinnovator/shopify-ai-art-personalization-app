import { Form, Link, NavLink } from 'react-router';
import { NAV_ITEMS } from '../lib/nav';
import { Icon } from './Icon';

export interface SidebarProps {
  shopDomain: string;
  embedded: boolean;
  onNavigate?: () => void;
}

export function BrandMark({ large }: { large?: boolean }) {
  return (
    <span className={large ? 'brand-mark brand-mark--lg' : 'brand-mark'} aria-hidden="true">
      <Icon name="sparkles" size={large ? 24 : 18} />
    </span>
  );
}

export function Sidebar({ shopDomain, embedded, onNavigate }: SidebarProps) {
  return (
    <aside className="sidebar" aria-label="Main navigation">
      <Link to="/" className="sidebar__brand" onClick={onNavigate}>
        <BrandMark />
        <span>AI Art Preview</span>
      </Link>
      <nav className="sidebar__nav">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}
            onClick={onNavigate}
          >
            <Icon name={item.icon} size={20} />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
      <div className="sidebar__footer">
        <span className="sidebar__shop">
          <Icon name="shopping-bag" size={16} />
          <span className="truncate" title={shopDomain}>
            {shopDomain}
          </span>
        </span>
        {embedded ? null : (
          <Form method="post" action="/logout">
            <button type="submit" className="btn btn--plain btn--sm">
              <Icon name="log-out" size={16} />
              Sign out
            </button>
          </Form>
        )}
      </div>
    </aside>
  );
}
