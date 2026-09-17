import type { ReactNode } from 'react';
import { BrandMark } from './Sidebar';

/** Centered card used by both sign-in pages (local mock and Shopify store-domain login). */
export function AuthLayout({
  title,
  children,
  footer,
}: {
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="auth">
      <div className="auth__card">
        <div className="auth__brand">
          <BrandMark large />
          <h1 className="auth__title">{title}</h1>
        </div>
        {children}
        {footer ? <p className="auth__footer">{footer}</p> : null}
      </div>
    </div>
  );
}
