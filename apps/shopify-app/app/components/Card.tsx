import type { ReactNode } from 'react';

export interface CardProps {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  /** Pads the body; turn off when the body is a table or sections. */
  padded?: boolean;
  tone?: 'critical';
  className?: string;
  children?: ReactNode;
  id?: string;
}

export function Card({ title, subtitle, actions, padded = true, tone, className, children, id }: CardProps) {
  const classes = ['card', tone ? `card--tone-${tone}` : '', className ?? ''].filter(Boolean).join(' ');
  return (
    <section className={classes} id={id}>
      {title || actions ? (
        <header className="card__header">
          <div>
            {title ? <h2 className="card__title">{title}</h2> : null}
            {subtitle ? <p className="card__subtitle">{subtitle}</p> : null}
          </div>
          {actions ? <div className="row">{actions}</div> : null}
        </header>
      ) : null}
      {padded ? <div className="card__section">{children}</div> : children}
    </section>
  );
}

export function CardSection({
  children,
  flush,
  className,
}: {
  children: ReactNode;
  flush?: boolean;
  className?: string;
}) {
  return (
    <div
      className={['card__section', flush ? 'card__section--flush' : '', className ?? '']
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </div>
  );
}

export function CardFooter({ children }: { children: ReactNode }) {
  return <footer className="card__footer">{children}</footer>;
}

/** Settings-style layout: title and description on the left, a card on the right. */
export function AnnotatedSection({
  title,
  description,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="annotated">
      <div>
        <h2 className="annotated__title">{title}</h2>
        {description ? <p className="annotated__desc">{description}</p> : null}
      </div>
      <Card>{children}</Card>
    </div>
  );
}
