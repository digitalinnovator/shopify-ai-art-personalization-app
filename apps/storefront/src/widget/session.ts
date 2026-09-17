const SID_KEY = 'aiart:sid';
const JOB_KEY_PREFIX = 'aiart:job:';

/** 16 random bytes, base64url-encoded — matches the shape the backend's `isValidSessionId` expects. */
function randomSid(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** One id per browser tab session, reused across every design's widget on the page. */
export function getSid(): string {
  let sid = sessionStorage.getItem(SID_KEY);
  if (!sid) {
    sid = randomSid();
    sessionStorage.setItem(SID_KEY, sid);
  }
  return sid;
}

export function getSavedJobId(designId: string): string | null {
  return sessionStorage.getItem(JOB_KEY_PREFIX + designId);
}

export function saveJobId(designId: string, jobId: string): void {
  sessionStorage.setItem(JOB_KEY_PREFIX + designId, jobId);
}

export function clearSavedJob(designId: string): void {
  sessionStorage.removeItem(JOB_KEY_PREFIX + designId);
}
