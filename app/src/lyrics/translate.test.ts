import { describe, it, expect, vi, beforeEach } from 'vitest';
import { autoTranslateLyrics } from './translate';
import { line } from './model';

describe('autoTranslateLyrics', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('translates Japanese to English', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [['Hello\nGoodbye', 'ja']],
    }));

    const lines = [
      line(1000, 'こんにちは'),
      line(3000, 'さようなら'),
    ];
    const translated = await autoTranslateLyrics(lines, 'en');
    expect(translated[0]?.translation).toBe('Hello');
    expect(translated[1]?.translation).toBe('Goodbye');
  });

  it('leaves English lines untranslated without duplicate subtitles', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [['I love you so much\nNever gonna give you up', 'en']],
    }));

    const lines = [
      line(1000, 'I love you so much'),
      line(3000, 'Never gonna give you up'),
    ];
    const translated = await autoTranslateLyrics(lines, 'en');
    expect(translated[0]?.translation).toBeUndefined();
    expect(translated[1]?.translation).toBeUndefined();
  });
});
