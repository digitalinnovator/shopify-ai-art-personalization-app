import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

export interface EmptyStateProps {
  icon?: IconName;
  title: ReactNode;
  text?: ReactNode;
  action?: ReactNode;
}

export function EmptyState({ icon = 'image', title, text, action }: EmptyStateProps) {
  return (
    <div className="empty">
      <div className="empty__icon">
        <Icon name={icon} size={24} />
      </div>
      <h3 className="empty__title">{title}</h3>
      {text ? <p className="empty__text">{text}</p> : null}
      {action ? <div className="empty__action">{action}</div> : null}
    </div>
  );
}
