import type { ReactNode } from 'react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Form, useNavigation } from 'react-router';
import { Button, type ButtonStyleProps } from './Button';
import { Icon } from './Icon';

export interface ConfirmButtonProps extends ButtonStyleProps {
  /** Button label that opens the dialog. */
  children: ReactNode;
  title: ReactNode;
  message: ReactNode;
  confirmLabel: string;
  confirmVariant?: 'primary' | 'critical';
  /** Hidden fields submitted with the confirmation. */
  fields: Record<string, string>;
  action?: string;
  disabled?: boolean;
}

/**
 * A button that asks for confirmation in a native <dialog> before submitting a small POST form.
 * Used for every destructive or irreversible action (archive, revert, disable a provider in use,
 * mark delivered). Focus returns to the trigger when the dialog closes.
 */
export function ConfirmButton({
  children,
  title,
  message,
  confirmLabel,
  confirmVariant = 'primary',
  fields,
  action,
  disabled,
  ...buttonProps
}: ConfirmButtonProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const navigation = useNavigation();
  const submitting = navigation.state !== 'idle' && navigation.formData?.get('intent') === fields.intent;

  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) {
      if (typeof dialog.showModal === 'function') {
        if (!dialog.open) dialog.showModal();
      } else {
        dialog.setAttribute('open', '');
      }
    } else if (dialog.open) {
      dialog.close();
    }
  }, [open]);

  // Close once a submission that started from this dialog has finished. Only the transition
  // submitting -> idle counts; the dialog is opened while idle too, and must stay open then.
  const wasSubmitting = useRef(false);
  useEffect(() => {
    if (submitting) {
      wasSubmitting.current = true;
      return;
    }
    if (wasSubmitting.current && navigation.state === 'idle') {
      wasSubmitting.current = false;
      setOpen(false);
    }
  }, [submitting, navigation.state]);

  return (
    <>
      <Button ref={triggerRef} {...buttonProps} disabled={disabled} onClick={() => setOpen(true)}>
        {children}
      </Button>
      <dialog
        ref={dialogRef}
        className="modal"
        aria-labelledby={titleId}
        onClose={close}
        onClick={(e) => {
          // A click on the backdrop (outside the form) closes the dialog.
          if (e.target === dialogRef.current) close();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') close();
        }}
      >
        <Form method="post" action={action}>
          <div className="modal__header">
            <span id={titleId}>{title}</span>
            <Button variant="plain" size="sm" iconOnly onClick={close} aria-label="Close">
              <Icon name="x" size={16} />
            </Button>
          </div>
          <div className="modal__body">{message}</div>
          <div className="modal__footer">
            {Object.entries(fields).map(([name, value]) => (
              <input key={name} type="hidden" name={name} value={value} />
            ))}
            <Button variant="secondary" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" variant={confirmVariant} loading={submitting}>
              {confirmLabel}
            </Button>
          </div>
        </Form>
      </dialog>
    </>
  );
}
