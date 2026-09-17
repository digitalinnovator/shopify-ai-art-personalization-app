import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Icon } from './Icon';

export interface PageProps {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Renders a "back" link above the title. */
  backTo?: string;
  backLabel?: string;
  /** Badges or other inline elements shown next to the title. */
  titleMeta?: ReactNode;
  actions?: ReactNode;
  narrow?: boolean;
  children: ReactNode;
}

export function Page({
  title,
  subtitle,
  backTo,
  backLabel,
  titleMeta,
  actions,
  narrow,
  children,
}: PageProps) {
  return (
    <div className={narrow ? 'page page--narrow' : 'page'}>
      <header className="page-header">
        <div className="page-header__main">
          {backTo ? (
            <Link to={backTo} className="page-header__back">
              <Icon name="arrow-left" size={16} />
              {backLabel ?? 'Back'}
            </Link>
          ) : null}
          <h1 className="page-header__title">
            <span className="truncate">{title}</span>
            {titleMeta}
          </h1>
          {subtitle ? <p className="page-header__subtitle">{subtitle}</p> : null}
        </div>
        {actions ? <div className="page-header__actions">{actions}</div> : null}
      </header>
      {children}
    </div>
  );
}

/** Sticky bar at the bottom of long forms. Children on the right; `aside` on the left. */
export function ActionBar({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="action-bar">
      {aside}
      <div className="action-bar__spacer" />
      <div className="action-bar__actions">{children}</div>
    </div>
  );
}
