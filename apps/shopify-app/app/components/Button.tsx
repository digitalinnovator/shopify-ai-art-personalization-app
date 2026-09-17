import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react';
import { forwardRef } from 'react';
import { Link, type LinkProps } from 'react-router';
import { Icon, type IconName } from './Icon';

export type ButtonVariant = 'primary' | 'secondary' | 'plain' | 'critical' | 'plain-critical';

export interface ButtonStyleProps {
  variant?: ButtonVariant;
  size?: 'sm' | 'md';
  icon?: IconName;
  iconRight?: IconName;
  loading?: boolean;
  block?: boolean;
  iconOnly?: boolean;
}

export function buttonClass({
  variant = 'secondary',
  size = 'md',
  block,
  iconOnly,
  className,
}: ButtonStyleProps & { className?: string }): string {
  return [
    'btn',
    variant === 'primary' ? 'btn--primary' : '',
    variant === 'critical' ? 'btn--critical' : '',
    variant === 'plain' ? 'btn--plain' : '',
    variant === 'plain-critical' ? 'btn--plain btn--critical-text' : '',
    size === 'sm' ? 'btn--sm' : '',
    block ? 'btn--block' : '',
    iconOnly ? 'btn--icon' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');
}

function ButtonContent({
  icon,
  iconRight,
  loading,
  children,
}: Pick<ButtonStyleProps, 'icon' | 'iconRight' | 'loading'> & { children?: ReactNode }) {
  return (
    <>
      {loading ? <Icon name="loader" size={16} spin /> : icon ? <Icon name={icon} size={16} /> : null}
      {children}
      {iconRight && !loading ? <Icon name={iconRight} size={16} /> : null}
    </>
  );
}

export type ButtonProps = ButtonStyleProps & ButtonHTMLAttributes<HTMLButtonElement>;

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant,
    size,
    icon,
    iconRight,
    loading,
    block,
    iconOnly,
    type = 'button',
    disabled,
    className,
    children,
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={buttonClass({ variant, size, block, iconOnly, className })}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      <ButtonContent icon={icon} iconRight={iconRight} loading={loading}>
        {children}
      </ButtonContent>
    </button>
  );
});

export type ButtonLinkProps = ButtonStyleProps & Omit<LinkProps, 'className'> & { className?: string };

export function ButtonLink({
  variant,
  size,
  icon,
  iconRight,
  block,
  iconOnly,
  className,
  children,
  ...rest
}: ButtonLinkProps) {
  return (
    <Link className={buttonClass({ variant, size, block, iconOnly, className })} {...rest}>
      <ButtonContent icon={icon} iconRight={iconRight}>
        {children}
      </ButtonContent>
    </Link>
  );
}

export type ButtonAnchorProps = ButtonStyleProps & AnchorHTMLAttributes<HTMLAnchorElement>;

/** For plain `<a href>` targets (downloads, external links) that should look like a button. */
export function ButtonAnchor({
  variant,
  size,
  icon,
  iconRight,
  block,
  iconOnly,
  className,
  children,
  ...rest
}: ButtonAnchorProps) {
  return (
    <a className={buttonClass({ variant, size, block, iconOnly, className })} {...rest}>
      <ButtonContent icon={icon} iconRight={iconRight}>
        {children}
      </ButtonContent>
    </a>
  );
}
