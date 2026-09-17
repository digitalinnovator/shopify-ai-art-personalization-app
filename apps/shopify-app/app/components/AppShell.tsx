import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { Icon } from './Icon';
import { BrandMark, Sidebar } from './Sidebar';
import { ToastHost } from './Toast';

export interface AppShellProps {
  shopDomain: string;
  embedded: boolean;
  children: ReactNode;
}

export function AppShell({ shopDomain, embedded, children }: AppShellProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const location = useLocation();

  // Close the drawer on navigation and on Escape; give focus back to the menu button.
  useEffect(() => {
    // Any route change (the pathname is read so the effect re-runs on it) closes the drawer.
    if (location.pathname) setDrawerOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setDrawerOpen(false);
        menuButton.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [drawerOpen]);

  return (
    <div className="shell">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <Sidebar shopDomain={shopDomain} embedded={embedded} />
      <div className="main">
        <header className="topbar">
          <button
            ref={menuButton}
            type="button"
            className="btn btn--plain btn--sm"
            aria-label="Open navigation"
            aria-expanded={drawerOpen}
            aria-controls="app-drawer"
            onClick={() => setDrawerOpen(true)}
          >
            <Icon name="menu" size={20} />
          </button>
          <Link to="/" className="topbar__brand">
            <BrandMark />
            <span>AI Art Preview</span>
          </Link>
        </header>
        <main id="main" tabIndex={-1}>
          {children}
        </main>
      </div>
      <div
        className="drawer"
        id="app-drawer"
        data-open={drawerOpen ? 'true' : 'false'}
        aria-hidden={!drawerOpen}
      >
        <button
          type="button"
          className="drawer__overlay"
          aria-label="Close navigation"
          onClick={() => setDrawerOpen(false)}
          tabIndex={drawerOpen ? 0 : -1}
        />
        <div className="drawer__panel">
          <Sidebar shopDomain={shopDomain} embedded={embedded} onNavigate={() => setDrawerOpen(false)} />
        </div>
      </div>
      <ToastHost />
    </div>
  );
}
