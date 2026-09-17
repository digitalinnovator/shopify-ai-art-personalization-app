import { useState } from 'react';
import { Icon, type IconName } from './Icon';

export interface ThumbnailProps {
  src?: string | null;
  alt: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  square?: boolean;
  /** Icon shown when there is no image (or it failed to load, e.g. an expired link). */
  icon?: IconName;
  tone?: 'critical';
  className?: string;
}

export function Thumbnail({
  src,
  alt,
  size = 'sm',
  square,
  icon = 'image',
  tone,
  className,
}: ThumbnailProps) {
  const [failed, setFailed] = useState(false);
  const classes = [
    'thumb',
    `thumb--${size}`,
    square ? 'thumb--square' : '',
    tone ? `thumb--${tone}` : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');
  const iconSize = size === 'xs' || size === 'sm' ? 16 : 24;
  return (
    <span className={classes}>
      {src && !failed ? (
        <img src={src} alt={alt} loading="lazy" onError={() => setFailed(true)} />
      ) : (
        <Icon name={icon} size={iconSize} label={alt} />
      )}
    </span>
  );
}
