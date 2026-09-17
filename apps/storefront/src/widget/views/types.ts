import type { DesignPublic, JobView } from '../api';

export interface StagedPhoto {
  file: File;
  /** Object URL for the thumbnail; revoked by the widget when it is no longer shown. */
  url: string;
}

/** Everything a view can ask the widget to do. The widget owns the state; views only render. */
export interface Handlers {
  stageFile(file: File): void;
  clearStaged(): void;
  createPreviews(): void;
  setConsent(checked: boolean): void;
  setEmail(value: string): void;
  select(previewId: string): void;
  regenerate(): void;
  addToCart(): void;
  backToIntro(): void;
  chooseOther(): void;
  openLightbox(url: string, label: string, returnTo: HTMLElement): void;
}

export interface IntroModel {
  design: DesignPublic;
  staged?: StagedPhoto;
  consent: boolean;
  email: string;
  error?: string;
}

export interface JobModel {
  job: JobView;
  error?: string;
}

export interface SelectedModel {
  job: JobView;
  previewId: string;
  adding: boolean;
  error?: string;
}
