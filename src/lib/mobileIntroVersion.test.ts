import { describe, it, expect, beforeEach } from 'vitest';
import { VYBE_INTRO_VERSION, hasCompletedCurrentIntro } from '@/lib/mobileIntroVersion';

describe('hasCompletedCurrentIntro', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('is false when intro never seen', () => {
    expect(hasCompletedCurrentIntro()).toBe(false);
  });

  it('keeps legacy dismiss (seen without version)', () => {
    localStorage.setItem('vybe_intro_seen', '1');
    expect(hasCompletedCurrentIntro()).toBe(true);
  });

  it('is true when version matches current', () => {
    localStorage.setItem('vybe_intro_seen', '1');
    localStorage.setItem('vybe_intro_version', VYBE_INTRO_VERSION);
    expect(hasCompletedCurrentIntro()).toBe(true);
  });

  it('is false when stored version is outdated', () => {
    localStorage.setItem('vybe_intro_seen', '1');
    localStorage.setItem('vybe_intro_version', '1');
    expect(hasCompletedCurrentIntro()).toBe(false);
  });
});
