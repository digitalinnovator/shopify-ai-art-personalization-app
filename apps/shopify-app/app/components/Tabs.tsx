import { Link } from 'react-router';

export interface TabItem {
  to: string;
  label: string;
  active: boolean;
  count?: number;
}

/** Link-based filter tabs (each tab is a URL, so filters survive refresh and are shareable). */
export function Tabs({ items, label }: { items: TabItem[]; label: string }) {
  return (
    <nav className="tabs" aria-label={label}>
      {items.map((item) => (
        <Link
          key={item.to}
          to={item.to}
          className="tab"
          aria-current={item.active ? 'page' : undefined}
          replace
        >
          {item.label}
          {item.count !== undefined ? <span className="tab__count">{item.count}</span> : null}
        </Link>
      ))}
    </nav>
  );
}
