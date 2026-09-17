// Import from the `constants` subpath, never the `@aiart/contracts` barrel: the barrel pulls in zod
// through the schema modules and would add ~90 KB to the storefront bundle (scripts/check-widget-size.mjs guards this).
import {
  POLL_INTERVAL_MS,
  POLL_MAX_INTERVAL_MS,
  SELECTION_LABEL_PROPERTY,
  SELECTION_PROPERTY,
} from '@aiart/contracts/constants';
import { ApiClient, ApiError, type DesignPublic, type JobView } from './api';
import { COPY, humanizeRejection } from './copy';
import { h } from './dom';
import { icon } from './icons';
import { prepareForUpload } from './prepare';
import { clearSavedJob, getSavedJobId, getSid, saveJobId } from './session';
import { guardThemeBuyButtons, readThemeProductForm } from './theme';
import { renderAlert, renderBlockingAlert } from './views/alerts';
import { isWaiting, renderCompare } from './views/compare';
import { renderDone } from './views/done';
import { renderIntro } from './views/intro';
import { openLightbox } from './views/lightbox';
import { renderGenerating, renderUploading } from './views/progress';
import { renderSelected } from './views/selected';
import { renderStepper } from './views/stepper';
import type { Handlers, StagedPhoto } from './views/types';

type State =
  | { kind: 'loading' }
  | { kind: 'load_error'; message: string }
  | { kind: 'intro'; design: DesignPublic; error?: string }
  | { kind: 'uploading'; design: DesignPublic; progress: number }
  | { kind: 'validating'; design: DesignPublic }
  | { kind: 'rejected'; design: DesignPublic; reason: string }
  | { kind: 'job'; design: DesignPublic; job: JobView; error?: string }
  | {
      kind: 'selected';
      design: DesignPublic;
      job: JobView;
      previewId: string;
      selectionToken: string;
      adding?: boolean;
      error?: string;
    }
  | { kind: 'added'; design: DesignPublic };

/** Where focus should land after a user-initiated transition (see `render`). */
type FocusTarget = 'heading' | 'primary' | 'alert' | 'dropzone';

function slotLabel(job: JobView, previewId: string): string {
  const preview = job.previews.find((p) => p.id === previewId);
  return preview ? COPY.previewLabel(preview.slot) : 'Preview';
}

export class Widget implements Handlers {
  private readonly root: HTMLElement;
  private readonly designId: string;
  private readonly variantId: string;
  private readonly api: ApiClient;
  private state: State = { kind: 'loading' };
  private pollHandle?: ReturnType<typeof setTimeout>;
  private pollInterval = POLL_INTERVAL_MS;
  private consent = false;
  private email = '';
  private staged?: StagedPhoto;
  private liveRegion: HTMLElement;
  private focusTarget: FocusTarget | null = null;
  private userInitiated = false;
  private releaseThemeGuard?: () => void;

  constructor(root: HTMLElement) {
    this.root = root;
    this.designId = root.dataset.designId ?? '';
    this.variantId = root.dataset.variantId ?? '';
    const basePath = root.dataset.proxyBase || '/apps/ai-art';
    this.api = new ApiClient(basePath, getSid());
    this.liveRegion = h('div', { class: 'aiart-sr-only', role: 'status', 'aria-live': 'polite' });
    this.root.classList.add('aiart-widget');
    if (!this.designId || !this.variantId) {
      this.state = { kind: 'load_error', message: COPY.missingConfig };
    }
    this.render();
    if (this.designId && this.variantId) {
      // On by default: a personalized product is bought through the widget, with a chosen preview.
      // The block setting "Hide the theme's buy buttons" turns this off (data-hide-theme-buttons="false").
      if (root.dataset.hideThemeButtons !== 'false') {
        this.releaseThemeGuard = guardThemeBuyButtons(root, () => this.onThemeBuyBlocked());
      }
      void this.init();
    }
  }

  destroy(): void {
    if (this.pollHandle) clearTimeout(this.pollHandle);
    this.revokeStaged();
    this.releaseThemeGuard?.();
  }

  /** The theme form tried to add to cart without going through the widget. */
  private onThemeBuyBlocked(): void {
    this.announce(COPY.choosePreviewFirst);
    this.root.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (this.state.kind === 'intro' || this.state.kind === 'job') {
      this.userInitiated = true;
      this.setState({ ...this.state, error: COPY.choosePreviewFirst }, 'alert');
    }
  }

  private async init(): Promise<void> {
    try {
      const design = await this.api.getDesign(this.designId);
      const savedJobId = getSavedJobId(this.designId);
      if (savedJobId) {
        try {
          const job = await this.api.getJob(savedJobId);
          this.setState({ kind: 'job', design, job });
          this.schedulePoll();
          return;
        } catch {
          clearSavedJob(this.designId);
        }
      }
      this.setState({ kind: 'intro', design });
    } catch (err) {
      this.setState({
        kind: 'load_error',
        message: err instanceof Error && err.message ? err.message : COPY.loadError,
      });
    }
  }

  private setState(next: State, focus: FocusTarget | null = null): void {
    this.state = next;
    this.focusTarget = focus;
    this.render();
  }

  private announce(message: string): void {
    this.liveRegion.textContent = message;
  }

  private revokeStaged(): void {
    if (this.staged) URL.revokeObjectURL(this.staged.url);
    this.staged = undefined;
  }

  // ---------------------------------------------------------------- polling

  private schedulePoll(): void {
    if (this.state.kind !== 'job') return;
    if (!isWaiting(this.state.job)) {
      this.pollInterval = POLL_INTERVAL_MS;
      return;
    }
    clearTimeout(this.pollHandle);
    this.pollHandle = setTimeout(() => void this.pollOnce(), this.pollInterval);
    this.pollInterval = Math.min(this.pollInterval + 500, POLL_MAX_INTERVAL_MS);
  }

  private async pollOnce(): Promise<void> {
    if (this.state.kind !== 'job') return;
    try {
      const job = await this.api.getJob(this.state.job.jobId);
      const wasWaiting = isWaiting(this.state.job);
      // Poll-driven: no focus request, so a shopper reading elsewhere on the page is not pulled back.
      this.setState({ kind: 'job', design: this.state.design, job });
      if (wasWaiting && (job.status === 'ready' || job.status === 'partial'))
        this.announce(COPY.announceReady);
      if (wasWaiting && job.status === 'failed') this.announce(COPY.announceFailed);
      this.schedulePoll();
    } catch {
      this.schedulePoll();
    }
  }

  // ---------------------------------------------------------------- handlers (user initiated)

  stageFile(file: File): void {
    if (this.state.kind !== 'intro') return;
    this.userInitiated = true;
    const { design } = this.state;
    const maxMb = Math.round(design.uploadRules.maxBytes / 1_000_000);
    const acceptedType = design.uploadRules.formats.some((f) => file.type === `image/${f}`);
    if (!acceptedType) {
      this.setState({ kind: 'intro', design, error: COPY.wrongType }, 'alert');
      return;
    }
    if (file.size > design.uploadRules.maxBytes) {
      this.setState({ kind: 'intro', design, error: COPY.tooLarge(maxMb) }, 'alert');
      return;
    }
    this.revokeStaged();
    this.staged = { file, url: URL.createObjectURL(file) };
    this.setState({ kind: 'intro', design }, 'primary');
  }

  clearStaged(): void {
    if (this.state.kind !== 'intro') return;
    this.userInitiated = true;
    this.revokeStaged();
    this.setState({ kind: 'intro', design: this.state.design }, 'dropzone');
  }

  setConsent(checked: boolean): void {
    this.consent = checked;
  }

  setEmail(value: string): void {
    this.email = value;
  }

  async createPreviews(): Promise<void> {
    if (this.state.kind !== 'intro') return;
    this.userInitiated = true;
    const { design } = this.state;
    const staged = this.staged;
    if (!staged) {
      this.setState({ kind: 'intro', design }, 'dropzone');
      return;
    }
    if (!this.consent) {
      this.setState({ kind: 'intro', design, error: COPY.needConsent }, 'alert');
      return;
    }
    if (design.requireEmail && !this.email) {
      this.setState({ kind: 'intro', design, error: COPY.needEmail }, 'alert');
      return;
    }

    this.announce(COPY.announceUploading);
    this.setState({ kind: 'uploading', design, progress: 0 }, 'heading');
    try {
      const file = await prepareForUpload(staged.file);
      const result = await this.api.uploadPhoto(
        design.id,
        file,
        { consent: true, email: this.email || undefined },
        (fraction) => {
          // The bytes are across once progress reaches 1; the server then validates the photo.
          if (fraction >= 1) this.setState({ kind: 'validating', design });
          else if (this.state.kind === 'uploading')
            this.setState({ kind: 'uploading', design, progress: fraction });
        },
      );
      if (!result.ok) {
        this.setState({ kind: 'rejected', design, reason: humanizeRejection(result.reason) }, 'heading');
        return;
      }
      const { jobId } = await this.api.createJob(design.id, result.uploadId);
      saveJobId(design.id, jobId);
      const job = await this.api.getJob(jobId);
      this.pollInterval = POLL_INTERVAL_MS;
      this.announce(COPY.announceGenerating);
      this.setState({ kind: 'job', design, job }, 'heading');
      this.schedulePoll();
    } catch (err) {
      this.setState({ kind: 'intro', design, error: this.friendlyError(err, COPY.uploadFailed) }, 'alert');
    }
  }

  async regenerate(): Promise<void> {
    if (this.state.kind !== 'job') return;
    this.userInitiated = true;
    const { design, job } = this.state;
    try {
      const updated = await this.api.regenerate(job.jobId);
      this.pollInterval = POLL_INTERVAL_MS;
      this.setState({ kind: 'job', design, job: updated }, 'heading');
      this.schedulePoll();
    } catch (err) {
      this.setState(
        { kind: 'job', design, job, error: this.friendlyError(err, COPY.regenerateFailed) },
        'alert',
      );
    }
  }

  async select(previewId: string): Promise<void> {
    if (this.state.kind !== 'job') return;
    this.userInitiated = true;
    const { design, job } = this.state;
    try {
      const { selectionToken } = await this.api.select(job.jobId, previewId);
      this.setState({ kind: 'selected', design, job, previewId, selectionToken }, 'primary');
    } catch (err) {
      this.setState({ kind: 'job', design, job, error: this.friendlyError(err, COPY.selectFailed) }, 'alert');
    }
  }

  chooseOther(): void {
    if (this.state.kind !== 'selected') return;
    this.userInitiated = true;
    this.setState({ kind: 'job', design: this.state.design, job: this.state.job }, 'heading');
  }

  async addToCart(): Promise<void> {
    if (this.state.kind !== 'selected') return;
    this.userInitiated = true;
    const current = this.state;
    this.setState({ ...current, adding: true, error: undefined });
    // The size (variant) and quantity belong to the theme's product form; read them now so the
    // customer's choices go into the cart with the personalized item.
    const theme = readThemeProductForm(this.root);
    const variantId = theme.variantId ?? this.variantId;
    try {
      const res = await fetch('/cart/add.js', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          items: [
            {
              id: Number(variantId),
              quantity: theme.quantity,
              properties: {
                [SELECTION_PROPERTY]: current.selectionToken,
                [SELECTION_LABEL_PROPERTY]: slotLabel(current.job, current.previewId),
              },
            },
          ],
        }),
      });
      if (!res.ok) throw new Error(`Add to cart failed (${res.status})`);
      clearSavedJob(current.design.id);
      this.revokeStaged();
      this.announce(COPY.announceAdded);
      this.userInitiated = true;
      this.setState({ kind: 'added', design: current.design }, 'heading');
      this.root.dispatchEvent(
        new CustomEvent('aiart:added', {
          bubbles: true,
          detail: { variantId, quantity: theme.quantity, designId: current.design.id },
        }),
      );
    } catch (err) {
      this.userInitiated = true;
      this.setState(
        { ...current, adding: false, error: this.friendlyError(err, COPY.addToCartFailed) },
        'alert',
      );
    }
  }

  backToIntro(): void {
    if (this.state.kind === 'loading' || this.state.kind === 'load_error') return;
    this.userInitiated = true;
    const { design } = this.state;
    if (this.state.kind === 'job' || this.state.kind === 'selected') clearSavedJob(design.id);
    clearTimeout(this.pollHandle);
    this.revokeStaged();
    this.setState({ kind: 'intro', design }, 'dropzone');
  }

  openLightbox(url: string, label: string, returnTo: HTMLElement): void {
    openLightbox(url, label, returnTo);
  }

  private friendlyError(err: unknown, fallback: string): string {
    if (err instanceof ApiError && (err.code === 'daily_cap_reached' || err.code === 'rate_limited'))
      return err.message;
    return fallback;
  }

  // ---------------------------------------------------------------- render

  private render(): void {
    const view = this.view();
    this.root.replaceChildren(this.liveRegion, view);

    // Move focus only for transitions the shopper caused, or when they were already inside the
    // widget. A poll finishing while they read the product description must not yank focus.
    const focusInside = this.root.contains(document.activeElement);
    if (this.focusTarget && (this.userInitiated || focusInside)) {
      const target = this.root.querySelector<HTMLElement>(`[data-aiart-focus="${this.focusTarget}"]`);
      target?.focus();
    }
    this.userInitiated = false;
    this.focusTarget = null;
  }

  private view(): HTMLElement {
    switch (this.state.kind) {
      case 'loading':
        return h(
          'div',
          { class: 'aiart-card', 'aria-busy': 'true' },
          renderStepper(1),
          h('div', { class: 'aiart-skeleton aiart-skeleton--line', 'aria-hidden': 'true' }),
          h('div', { class: 'aiart-skeleton aiart-skeleton--block', 'aria-hidden': 'true' }),
          h('span', { class: 'aiart-sr-only' }, COPY.loading),
        );
      case 'load_error':
        return renderBlockingAlert(this.state.message);
      case 'intro':
        return renderIntro(
          {
            design: this.state.design,
            staged: this.staged,
            consent: this.consent,
            email: this.email,
            error: this.state.error,
          },
          this,
        );
      case 'uploading':
        return renderUploading(this.staged, this.state.progress, COPY.uploadingTitle);
      case 'validating':
        return renderUploading(this.staged, null, COPY.validatingTitle);
      case 'rejected':
        return this.renderRejected(this.state.reason);
      case 'job':
        return isWaiting(this.state.job)
          ? renderGenerating()
          : renderCompare({ job: this.state.job, error: this.state.error }, this);
      case 'selected':
        return renderSelected(
          {
            job: this.state.job,
            previewId: this.state.previewId,
            adding: Boolean(this.state.adding),
            error: this.state.error,
          },
          this,
        );
      case 'added':
        return renderDone(this);
    }
  }

  private renderRejected(reason: string): HTMLElement {
    return h(
      'div',
      { class: 'aiart-card' },
      renderStepper(1),
      h('h3', { class: 'aiart-heading', tabindex: '-1', 'data-aiart-focus': 'heading' }, COPY.rejectedTitle),
      renderAlert('error', reason),
      h(
        'ul',
        { class: 'aiart-tips' },
        ...COPY.rejectionTips.map((tip) => h('li', {}, icon('check', 14), tip)),
      ),
      h(
        'div',
        { class: 'aiart-actions' },
        h(
          'button',
          {
            class: 'aiart-btn aiart-btn-primary aiart-btn--block',
            type: 'button',
            onClick: () => this.backToIntro(),
          },
          COPY.tryAnotherPhoto,
        ),
      ),
    );
  }
}
