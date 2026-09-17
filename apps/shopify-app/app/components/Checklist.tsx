import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Icon } from './Icon';

export interface ChecklistItem {
  label: ReactNode;
  done: boolean;
  to?: string;
  /** External link (docs). */
  href?: string;
}

export function Checklist({ items }: { items: ChecklistItem[] }) {
  return (
    <ol className="checklist">
      {items.map((item) => (
        <li
          key={String(item.to ?? item.href ?? item.label)}
          className="checklist__item"
          data-done={item.done ? 'true' : 'false'}
        >
          <span className="checklist__mark" aria-hidden="true">
            <Icon name="check" size={16} />
          </span>
          <span className="checklist__text">
            {item.done ? <span className="sr-only">Done: </span> : null}
            {item.label}
          </span>
          {!item.done && item.to ? (
            <Link to={item.to} className="btn btn--plain btn--sm">
              Open
              <Icon name="arrow-right" size={16} />
            </Link>
          ) : null}
          {!item.done && item.href ? (
            <a href={item.href} className="btn btn--plain btn--sm" target="_blank" rel="noreferrer">
              Open
              <Icon name="external-link" size={16} />
            </a>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
