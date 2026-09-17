// Every customer-facing string in one place. Plain sentences, no dashes, no jargon.

export const STEPS = ['Upload', 'Generating', 'Choose', 'Added'] as const;

export const COPY = {
  loading: 'Loading',
  missingConfig: 'This block is missing its design or product configuration.',
  loadError: 'Could not load this design. Please refresh the page.',

  introHeading: 'Upload a photo to see yourself in this design',
  introHint: 'Clear, well lit, one person facing the camera works best.',
  dropzoneTitle: 'Drag a photo here or',
  choosePhoto: 'Choose a photo',
  changePhoto: 'Change photo',
  formatsHint: (maxMb: number) => `JPEG, PNG or WebP, up to ${maxMb} MB`,
  consent: 'I confirm I have the right to use this photo.',
  emailLabel: 'Email',
  emailPlaceholder: 'you@example.com',
  createPreviews: 'Create previews',

  needConsent: 'Please confirm you have the right to use this photo.',
  choosePreviewFirst: 'Please create your previews and choose one first. It is added to the cart from here.',
  needEmail: 'Please enter your email to continue.',
  wrongType: 'Please choose a JPEG, PNG or WebP photo.',
  tooLarge: (maxMb: number) => `That photo is too large. The limit is ${maxMb} MB.`,
  uploadFailed: 'We could not upload that photo. Please try again.',

  uploadingTitle: 'Uploading your photo',
  validatingTitle: 'Checking your photo',
  generatingTitle: 'Creating your previews',
  generatingHint: 'This usually takes under a minute. You can keep browsing this page.',

  rejectedTitle: 'That photo could not be used',
  rejectionTips: ['Use a clear, sharp photo', 'Good lighting on the face', 'One person in the frame'],
  tryAnotherPhoto: 'Try another photo',

  chooseHeading: 'Choose your favorite',
  chooseHint: 'Both previews are made from your photo. Pick the one you like best.',
  previewLabel: (slot: string) => `Preview ${slot}`,
  zoom: (slot: string) => `Zoom Preview ${slot}`,
  choose: (slot: string) => `Choose Preview ${slot}`,
  previewFailed: (slot: string) => `Preview ${slot} could not be created.`,
  previewRefused: (slot: string) =>
    `Preview ${slot} was declined by the safety filter. Try a different photo.`,
  partialNote: 'One preview is ready. The other could not be created.',
  allFailed: 'We could not create a preview from that photo.',
  allRefused: 'This photo was declined by the safety filter. Please try a different photo.',
  tryAgain: (left: number) => `Try again (${left} left)`,
  noAttemptsLeft: 'No more attempts for this session.',
  useDifferentPhoto: 'Use a different photo',
  regenerateFailed: 'Could not start a new attempt right now.',
  selectFailed: 'Could not select that preview.',

  selectedNote: (slot: string) => `${slot} selected.`,
  addToCart: 'Add to cart',
  adding: 'Adding',
  chooseOther: 'Choose the other preview',
  addToCartFailed: 'Could not add this to your cart.',

  addedTitle: '✓ Added to your cart.',
  addedHint: 'Your personalized artwork will be created from the preview you chose.',
  viewCart: 'View cart',
  startOver: 'Personalize another photo',

  closeLightbox: 'Close',

  // Screen reader announcements
  announceUploading: 'Uploading your photo.',
  announceGenerating: 'Photo accepted. Creating your previews.',
  announceReady: 'Your previews are ready.',
  announceFailed: 'We could not generate a preview. Please try again.',
  announceAdded: 'Added to your cart.',
} as const;

export const REJECTION_MESSAGES: Record<string, string> = {
  unreadable: 'We could not read that file. Please try a different photo.',
  unsupported_format: 'Please use a JPEG, PNG or WebP photo.',
  too_large: 'That photo is too large. Please choose a smaller file.',
  too_small: 'That photo is too small. Please use a higher resolution photo.',
  too_blurry: 'That photo looks blurry. Please try a clearer, well lit photo.',
  no_face: 'We could not find a face in that photo.',
  multiple_faces: 'Please use a photo with only one person in it.',
};

export function humanizeRejection(reason: string): string {
  return REJECTION_MESSAGES[reason] ?? 'That photo could not be used. Please try another.';
}
