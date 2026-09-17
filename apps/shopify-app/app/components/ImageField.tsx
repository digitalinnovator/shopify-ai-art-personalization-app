import type { ReactNode } from 'react';
import { useId, useState } from 'react';
import { Button } from './Button';
import { Icon } from './Icon';
import { Thumbnail } from './Thumbnail';

export interface ImageItem {
  key: string;
  url: string | null;
}

export interface ImageFieldProps {
  label: ReactNode;
  help?: ReactNode;
  error?: string;
  /** Hidden input carrying the kept storage keys (comma separated, or a single key). */
  hiddenName: string;
  /** File input name read by the action. */
  fileName: string;
  items: ImageItem[];
  multiple?: boolean;
  max?: number;
}

/**
 * Reference-image manager for the design editor: existing images as thumbnails with Remove,
 * plus a drop area / file picker for new ones. Removing only drops the key from the hidden input;
 * the object itself stays in storage because older versions may still use it.
 */
export function ImageField({
  label,
  help,
  error,
  hiddenName,
  fileName,
  items,
  multiple,
  max,
}: ImageFieldProps) {
  const [kept, setKept] = useState(items);
  const [pending, setPending] = useState<string[]>([]);
  const inputId = useId();
  const remaining = max ? Math.max(0, max - kept.length) : undefined;
  const full = remaining === 0;

  return (
    <div className="field">
      <span className="field__label">{label}</span>
      <input type="hidden" name={hiddenName} value={kept.map((k) => k.key).join(',')} />
      {kept.length > 0 ? (
        <div className="image-grid">
          {kept.map((item) => (
            <div key={item.key} className="image-tile">
              <Thumbnail src={item.url} alt={item.key.split('/').pop() ?? item.key} size="md" />
              <Button
                variant="secondary"
                size="sm"
                iconOnly
                className="image-tile__remove"
                aria-label={`Remove ${item.key.split('/').pop()}`}
                onClick={() => setKept((current) => current.filter((k) => k.key !== item.key))}
              >
                <Icon name="x" size={16} />
              </Button>
              <p className="image-tile__caption truncate" title={item.key}>
                {item.key.split('/').pop()}
              </p>
            </div>
          ))}
        </div>
      ) : null}
      {!full ? (
        <label className="dropzone" htmlFor={inputId}>
          <Icon name="upload" size={20} />
          <span>
            {pending.length > 0
              ? `${pending.length} file${pending.length === 1 ? '' : 's'} selected: ${pending.join(', ')}`
              : multiple
                ? 'Click to choose images'
                : 'Click to choose an image'}
          </span>
          <span className="text-xs">
            JPEG, PNG or WebP, up to 10 MB each
            {remaining !== undefined ? `. ${remaining} more allowed.` : '.'}
          </span>
          <input
            id={inputId}
            type="file"
            name={fileName}
            accept="image/jpeg,image/png,image/webp"
            multiple={multiple}
            onChange={(e) => setPending(Array.from(e.target.files ?? []).map((f) => f.name))}
          />
        </label>
      ) : (
        <p className="field__help">Maximum of {max} reached. Remove one to add another.</p>
      )}
      {help ? <p className="field__help">{help}</p> : null}
      {error ? (
        <p className="field__error" role="alert">
          <Icon name="alert-circle" size={16} />
          {error}
        </p>
      ) : null}
    </div>
  );
}
