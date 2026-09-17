import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Icon, type IconName } from './Icon';

export interface StatProps {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  icon?: IconName;
  tone?: 'critical';
  to?: string;
}

export function Stat({ label, value, hint, icon, tone, to }: StatProps) {
  const className = ['card', 'stat', tone ? `stat--${tone}` : ''].filter(Boolean).join(' ');
  const body = (
    <>
      <span className="stat__label">
        {icon ? <Icon name={icon} size={16} /> : null}
        {label}
      </span>
      <span className="stat__value">{value}</span>
      {hint ? <span className="stat__hint">{hint}</span> : null}
    </>
  );
  return to ? (
    <Link to={to} className={className}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}
