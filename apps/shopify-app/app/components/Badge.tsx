import type { ReactNode } from 'react';
import { type StatusKind, statusIsActive, statusLabel, statusTone, type Tone } from '../lib/status';

export interface BadgeProps {
  tone?: Tone;
  dot?: boolean;
  pulse?: boolean;
  children: ReactNode;
  className?: string;
}

export function Badge({ tone = 'neutral', dot, pulse, children, className }: BadgeProps) {
  const classes = ['badge', `badge--${tone}`, pulse ? 'badge--pulse' : '', className ?? '']
    .filter(Boolean)
    .join(' ');
  return (
    <span className={classes}>
      {dot || pulse ? <span className="badge__dot" aria-hidden="true" /> : null}
      {children}
    </span>
  );
}

export interface StatusBadgeProps {
  status: string;
  kind?: StatusKind;
  className?: string;
}

/** A badge whose color and label come from the shared status vocabulary. */
export function StatusBadge({ status, kind, className }: StatusBadgeProps) {
  const active = statusIsActive(status);
  return (
    <Badge tone={statusTone(status, kind)} dot={active} pulse={active} className={className}>
      {statusLabel(status)}
    </Badge>
  );
}
