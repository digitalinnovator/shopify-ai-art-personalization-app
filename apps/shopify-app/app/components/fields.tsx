import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { forwardRef, useId } from 'react';
import { Icon, type IconName } from './Icon';

export interface FormFieldProps {
  label: ReactNode;
  htmlFor?: string;
  help?: ReactNode;
  error?: string;
  required?: boolean;
  children: ReactNode;
  /** Ids of the help/error nodes, so inputs can reference them. Provided by the field wrappers. */
  helpId?: string;
  errorId?: string;
  className?: string;
}

export function FormField({
  label,
  htmlFor,
  help,
  error,
  required,
  children,
  helpId,
  errorId,
  className,
}: FormFieldProps) {
  return (
    <div className={['field', className ?? ''].filter(Boolean).join(' ')}>
      <label className="field__label" htmlFor={htmlFor}>
        {label}
        {required ? (
          <span className="field__required" aria-hidden="true">
            *
          </span>
        ) : null}
      </label>
      {children}
      {help ? (
        <p className="field__help" id={helpId}>
          {help}
        </p>
      ) : null}
      {error ? (
        <p className="field__error" id={errorId} role="alert">
          <Icon name="alert-circle" size={16} />
          {error}
        </p>
      ) : null}
    </div>
  );
}

function useFieldIds(id?: string) {
  const generated = useId();
  const base = id ?? `f-${generated}`;
  return { id: base, helpId: `${base}-help`, errorId: `${base}-error` };
}

function describedBy(help: unknown, helpId: string, error: unknown, errorId: string): string | undefined {
  const ids = [help ? helpId : '', error ? errorId : ''].filter(Boolean);
  return ids.length ? ids.join(' ') : undefined;
}

type CommonFieldProps = {
  label: ReactNode;
  help?: ReactNode;
  error?: string;
  className?: string;
};

export const TextField = forwardRef<
  HTMLInputElement,
  CommonFieldProps & InputHTMLAttributes<HTMLInputElement>
>(function TextField({ label, help, error, id, required, className, ...rest }, ref) {
  const ids = useFieldIds(id);
  return (
    <FormField
      label={label}
      htmlFor={ids.id}
      help={help}
      error={error}
      required={required}
      helpId={ids.helpId}
      errorId={ids.errorId}
      className={className}
    >
      <input
        ref={ref}
        id={ids.id}
        className="input"
        type="text"
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(help, ids.helpId, error, ids.errorId)}
        {...rest}
      />
    </FormField>
  );
});

export function NumberField(props: CommonFieldProps & InputHTMLAttributes<HTMLInputElement>) {
  return <TextField type="number" inputMode="decimal" {...props} />;
}

export function TextArea({
  label,
  help,
  error,
  id,
  required,
  mono,
  className,
  ...rest
}: CommonFieldProps & TextareaHTMLAttributes<HTMLTextAreaElement> & { mono?: boolean }) {
  const ids = useFieldIds(id);
  return (
    <FormField
      label={label}
      htmlFor={ids.id}
      help={help}
      error={error}
      required={required}
      helpId={ids.helpId}
      errorId={ids.errorId}
      className={className}
    >
      <textarea
        id={ids.id}
        className={mono ? 'textarea textarea--mono' : 'textarea'}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(help, ids.helpId, error, ids.errorId)}
        {...rest}
      />
    </FormField>
  );
}

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export function Select({
  label,
  help,
  error,
  id,
  required,
  options,
  className,
  children,
  ...rest
}: CommonFieldProps & SelectHTMLAttributes<HTMLSelectElement> & { options?: SelectOption[] }) {
  const ids = useFieldIds(id);
  return (
    <FormField
      label={label}
      htmlFor={ids.id}
      help={help}
      error={error}
      required={required}
      helpId={ids.helpId}
      errorId={ids.errorId}
      className={className}
    >
      <select
        id={ids.id}
        className="select"
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(help, ids.helpId, error, ids.errorId)}
        {...rest}
      >
        {options
          ? options.map((o) => (
              <option key={o.value} value={o.value} disabled={o.disabled}>
                {o.label}
              </option>
            ))
          : children}
      </select>
    </FormField>
  );
}

export function Checkbox({
  label,
  help,
  className,
  ...rest
}: { label: ReactNode; help?: ReactNode; className?: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className={['checkbox', className ?? ''].filter(Boolean).join(' ')}>
      <input type="checkbox" {...rest} />
      <span className="checkbox__text">
        <span>{label}</span>
        {help ? <span className="checkbox__help">{help}</span> : null}
      </span>
    </label>
  );
}

export interface CheckboxGroupOption {
  name: string;
  label: ReactNode;
  defaultChecked?: boolean;
}

export function CheckboxGroup({
  legend,
  options,
  error,
  help,
}: {
  legend: ReactNode;
  options: CheckboxGroupOption[];
  error?: string;
  help?: ReactNode;
}) {
  return (
    <fieldset className="fieldset">
      <legend className="fieldset__legend">{legend}</legend>
      <div className="fieldset__options">
        {options.map((o) => (
          <Checkbox key={o.name} name={o.name} label={o.label} defaultChecked={o.defaultChecked} />
        ))}
      </div>
      {help ? <p className="field__help">{help}</p> : null}
      {error ? (
        <p className="field__error" role="alert">
          <Icon name="alert-circle" size={16} />
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

export interface RadioCardOption {
  value: string;
  label: ReactNode;
  description?: ReactNode;
  icon?: IconName;
}

export function RadioCards({
  legend,
  name,
  options,
  defaultValue,
}: {
  legend: ReactNode;
  name: string;
  options: RadioCardOption[];
  defaultValue?: string;
}) {
  return (
    <fieldset className="fieldset">
      <legend className="fieldset__legend">{legend}</legend>
      <div className="radio-cards">
        {options.map((o) => (
          <label key={o.value} className="radio-card">
            <input type="radio" name={name} value={o.value} defaultChecked={o.value === defaultValue} />
            {o.icon ? (
              <span className="radio-card__icon">
                <Icon name={o.icon} size={24} />
              </span>
            ) : null}
            <span>
              <span className="radio-card__title">{o.label}</span>
              {o.description ? <span className="radio-card__desc">{o.description}</span> : null}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
