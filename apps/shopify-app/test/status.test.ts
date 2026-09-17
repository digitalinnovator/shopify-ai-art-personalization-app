import {
  DESIGN_STATUSES,
  DESIGN_VERSION_STATUSES,
  JOB_SOURCES,
  JOB_STATUSES,
  ORDER_STATUSES,
  PREVIEW_STATUSES,
  SELECTION_STATUSES,
  UPLOAD_STATUSES,
} from '@aiart/contracts';
import { describe, expect, it } from 'vitest';
import { hasStatusTone, statusLabel, statusTone } from '../app/lib/status';
import { designFieldName, fieldErrorsFromIssues, settingsFieldName } from '../app/lib/validation';

const ORDER_ITEM_STATUSES = ['pending', 'released', 'needs_attention', 'revoked'];
const PRIVACY_STATUSES = ['received', 'completed'];
const PRIVACY_TOPICS = ['customers/data_request', 'customers/redact', 'shop/redact'];
const ERROR_KINDS = ['refused', 'permanent', 'temporary', 'timeout'];

describe('status tones', () => {
  it('covers every status the app can display', () => {
    const all = [
      ...JOB_STATUSES,
      ...PREVIEW_STATUSES,
      ...UPLOAD_STATUSES,
      ...SELECTION_STATUSES,
      ...ORDER_STATUSES,
      ...DESIGN_STATUSES,
      ...DESIGN_VERSION_STATUSES,
      ...JOB_SOURCES,
      ...ORDER_ITEM_STATUSES,
      ...PRIVACY_STATUSES,
      ...PRIVACY_TOPICS,
      ...ERROR_KINDS,
    ];
    const missing = all.filter((s) => !hasStatusTone(s));
    expect(missing).toEqual([]);
  });

  it('uses attention for a privacy request that is still open, but info for a received order', () => {
    expect(statusTone('received', 'privacy')).toBe('attention');
    expect(statusTone('received', 'order')).toBe('info');
  });

  it('produces readable labels', () => {
    expect(statusLabel('needs_attention')).toBe('Needs attention');
    expect(statusLabel('admin_test')).toBe('Test run');
    expect(statusLabel('ready')).toBe('Ready');
    expect(statusLabel('customers/redact')).toBe('Customer redact');
  });
});

describe('validation path mapping', () => {
  it('maps design config paths to editor field names', () => {
    expect(designFieldName('prompt')).toBe('prompt');
    expect(designFieldName('slots.0.model')).toBe('slotA_model');
    expect(designFieldName('slots.1.settings')).toBe('slotB_settings');
    expect(designFieldName('slots')).toBe('slots');
    expect(designFieldName('referenceImages.scene')).toBe('sceneKey');
    expect(designFieldName('referenceImages.style.2')).toBe('styleKeys');
    expect(designFieldName('exampleImages.0')).toBe('exampleKeys');
    expect(designFieldName('output.aspectRatio')).toBe('output_aspectRatio');
    expect(designFieldName('uploadRules.maxBytes')).toBe('uploadRules_maxMb');
    expect(designFieldName('uploadRules.formats')).toBe('uploadRules_formats');
    expect(designFieldName('limits.regenerationsPerSession')).toBe('limits_regenerationsPerSession');
  });

  it('maps settings paths and keeps the first message per field', () => {
    expect(settingsFieldName('watermark.text')).toBe('watermarkText');
    expect(settingsFieldName('watermark.opacity')).toBe('watermarkOpacity');
    expect(settingsFieldName('retentionDays')).toBe('retentionDays');
    const errors = fieldErrorsFromIssues(
      [
        { path: ['watermark', 'text'], message: 'first' },
        { path: ['watermark', 'text'], message: 'second' },
        { path: ['dailyPreviewCap'], message: 'too small' },
      ],
      settingsFieldName,
    );
    expect(errors).toEqual({ watermarkText: 'first', dailyPreviewCap: 'too small' });
  });
});
