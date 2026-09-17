import type { ReactNode } from 'react';
import { useState } from 'react';
import { Icon, type IconName } from './Icon';

export type BannerTone = 'success' | 'info' | 'warning' | 'attention' | 'critical';

const ICON_BY_TONE: Record<BannerTone, IconName> = {
  success: 'check-circle',
  info: 'info',
  warning: 'alert-triangle',
  attention: 'alert-triangle',
  critical: 'alert-circle',
};

export interface BannerProps {
  tone?: BannerTone;
  title?: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  dismissible?: boolean;
  className?: string;
}

export function Banner({ tone = 'info', title, children, actions, dismissible, className }: BannerProps) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  return (
    <div
      className={['banner', `banner--${tone}`, className ?? ''].filter(Boolean).join(' ')}
      role={tone === 'critical' ? 'alert' : 'status'}
    >
      <span className="banner__icon">
        <Icon name={ICON_BY_TONE[tone]} size={20} />
      </span>
      <div className="banner__body">
        {title ? <p className="banner__title">{title}</p> : null}
        {children ? <div>{children}</div> : null}
        {actions ? <div className="banner__actions">{actions}</div> : null}
      </div>
      {dismissible ? (
        <button
          type="button"
          className="btn btn--plain btn--sm"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss"
        >
          <Icon name="x" size={16} />
        </button>
      ) : null}
    </div>
  );
}
