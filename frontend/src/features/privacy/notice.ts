import { readItem, writeItem } from '../../lib/storage.ts'

/** Where this browser remembers that the privacy notice was seen: the version it was seen at. */
export const PRIVACY_NOTICE_KEY = 'tesda-track.privacy-notice'

/**
 * The policy's date (en.privacy.updated). A new version shows the notice again to everyone who saw an older one, so
 * change it whenever what the policy says changes.
 */
export const PRIVACY_NOTICE_VERSION = '2026-10-21'

export function hasSeenPrivacyNotice(): boolean {
  return readItem(PRIVACY_NOTICE_KEY) === PRIVACY_NOTICE_VERSION
}

/** Where storage is blocked this can't be saved, and the notice shows again on the next visit. */
export function markPrivacyNoticeSeen(): void {
  writeItem(PRIVACY_NOTICE_KEY, PRIVACY_NOTICE_VERSION)
}
