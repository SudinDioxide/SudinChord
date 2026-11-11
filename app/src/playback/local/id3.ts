/**
 * Comprehensive ID3v2, FLAC Vorbis Comments, and Audio Metadata parser.
 * Extracts Title, Artist, Album, Track Number, embedded Cover Art, and embedded Lyrics.
 */

export interface ParsedMetadata {
  title: string;
  artist: string;
  album: string | null;
  trackNumber: number | null;
  artworkBlobUrl: string | null;
  lyrics: string | null;
}

function decodeText(bytes: Uint8Array, encodingByte: number): string {
  try {
    if (encodingByte === 0) {
      // ISO-8859-1 (Latin1)
      let s = '';
      for (let i = 0; i < bytes.length; i++) {
        const val = bytes[i];
        if (val === undefined || val === 0) break;
        s += String.fromCharCode(val);
      }
      return s.trim();
    }
    if (encodingByte === 1) {
      // UTF-16 with BOM
      const decoder = new TextDecoder('utf-16');
      return decoder.decode(bytes).replace(/\0.*$/, '').trim();
    }
    if (encodingByte === 2) {
      // UTF-16BE
      const decoder = new TextDecoder('utf-16be');
      return decoder.decode(bytes).replace(/\0.*$/, '').trim();
    }
    // UTF-8
    const decoder = new TextDecoder('utf-8');
    return decoder.decode(bytes).replace(/\0.*$/, '').trim();
  } catch {
    return '';
  }
}

function parseSynchsafe(b0: number, b1: number, b2: number, b3: number): number {
  return ((b0 & 0x7f) << 21) | ((b1 & 0x7f) << 14) | ((b2 & 0x7f) << 7) | (b3 & 0x7f);
}

function parseUint32(b0: number, b1: number, b2: number, b3: number): number {
  return (b0 << 24) | (b1 << 16) | (b2 << 8) | b3;
}

/** Parses Vorbis comments (FLAC metadata block 4) */
function parseVorbisComments(bytes: Uint8Array, offset: number, blockLen: number): Record<string, string> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let p = offset;
  const end = Math.min(bytes.length, offset + blockLen);
  if (p + 4 > end) return {};

  const vendorLen = view.getUint32(p, true);
  p += 4 + vendorLen;
  if (p + 4 > end) return {};

  const commentCount = view.getUint32(p, true);
  p += 4;
  const decoder = new TextDecoder('utf-8');
  const tags: Record<string, string> = {};

  for (let i = 0; i < commentCount && p + 4 <= end; i++) {
    const len = view.getUint32(p, true);
    p += 4;
    if (p + len > end) break;
    const str = decoder.decode(bytes.subarray(p, p + len));
    p += len;
    const eq = str.indexOf('=');
    if (eq !== -1) {
      const key = str.slice(0, eq).toUpperCase().trim();
      const val = str.slice(eq + 1).trim();
      if (!tags[key]) tags[key] = val;
    }
  }
  return tags;
}

/** Parses FLAC METADATA_BLOCK_PICTURE (FLAC metadata block 6) */
function parseFlacPicture(bytes: Uint8Array, offset: number, blockLen: number): { url: string; isFront: boolean } | null {
  try {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let p = offset;
    const end = Math.min(bytes.length, offset + blockLen);
    if (p + 32 > end) return null;

    const picType = view.getUint32(p, false);
    p += 4;
    const mimeLen = view.getUint32(p, false);
    p += 4;
    if (p + mimeLen > end) return null;
    const rawMime = new TextDecoder('ascii').decode(bytes.subarray(p, p + mimeLen)) || 'image/jpeg';
    const mime = rawMime.trim().replace(/\0/g, '') || 'image/jpeg';
    p += mimeLen;

    const descLen = view.getUint32(p, false);
    p += 4 + descLen;
    // width, height, depth, colors (16 bytes)
    p += 16;
    if (p + 4 > end) return null;

    const dataLen = view.getUint32(p, false);
    p += 4;
    if (p + dataLen > bytes.length) return null;

    const imgBytes = bytes.subarray(p, p + dataLen);
    const blob = new Blob([imgBytes as BlobPart], { type: mime });
    return { url: URL.createObjectURL(blob), isFront: picType === 3 };
  } catch {
    return null;
  }
}

/** Parses metadata from an ArrayBuffer containing audio file header bytes */
export function parseAudioBufferMetadata(buffer: ArrayBuffer, fileName: string): ParsedMetadata {
  const fallback = parseFileName(fileName);
  const result: ParsedMetadata = {
    title: fallback.title,
    artist: fallback.artist,
    album: null,
    trackNumber: null,
    artworkBlobUrl: null,
    lyrics: null,
  };

  const bytes = new Uint8Array(buffer);
  if (bytes.length < 10) return result;

  try {
    let offset = 0;

    // 1. Check if ID3v2 tag is present
    if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
      const version = bytes[3] ?? 3;
      const tagSize = parseSynchsafe(bytes[6] ?? 0, bytes[7] ?? 0, bytes[8] ?? 0, bytes[9] ?? 0);
      const maxOffset = Math.min(bytes.length, 10 + tagSize);
      let p = 10;

      while (p + 10 < maxOffset) {
        const b0 = bytes[p] ?? 0;
        const b1 = bytes[p + 1] ?? 0;
        const b2 = bytes[p + 2] ?? 0;
        const b3 = bytes[p + 3] ?? 0;
        if (b0 === 0) break;

        const frameId = String.fromCharCode(b0, b1, b2, b3);
        const fSize0 = bytes[p + 4] ?? 0;
        const fSize1 = bytes[p + 5] ?? 0;
        const fSize2 = bytes[p + 6] ?? 0;
        const fSize3 = bytes[p + 7] ?? 0;

        const frameSize =
          version === 4
            ? parseSynchsafe(fSize0, fSize1, fSize2, fSize3)
            : parseUint32(fSize0, fSize1, fSize2, fSize3);

        p += 10;
        if (p + frameSize > bytes.length || frameSize <= 0) break;

        const frameData = bytes.subarray(p, p + frameSize);
        const enc = frameData[0] ?? 0;

        if (frameId === 'TIT2') {
          const title = decodeText(frameData.subarray(1), enc);
          if (title) result.title = title;
        } else if (frameId === 'TPE1' || frameId === 'TPE2') {
          const artist = decodeText(frameData.subarray(1), enc);
          if (artist) result.artist = artist;
        } else if (frameId === 'TALB') {
          const album = decodeText(frameData.subarray(1), enc);
          if (album) result.album = album;
        } else if (frameId === 'TRCK') {
          const trck = decodeText(frameData.subarray(1), enc);
          const num = parseInt(trck.split('/')[0] ?? '', 10);
          if (!isNaN(num)) result.trackNumber = num;
        } else if ((frameId === 'USLT' || frameId === 'SYLT') && !result.lyrics) {
          // Unsynchronized or Synchronized lyrics in ID3
          try {
            // USLT format: enc (1) + lang (3) + content descriptor (null-terminated) + lyrics
            let q = 4;
            if (enc === 1 || enc === 2) {
              while (q + 1 < frameData.length && !(frameData[q] === 0 && frameData[q + 1] === 0)) q += 2;
              q += 2;
            } else {
              while (q < frameData.length && frameData[q] !== 0) q++;
              q++;
            }
            if (q < frameData.length) {
              const lyricsText = decodeText(frameData.subarray(q), enc);
              if (lyricsText) result.lyrics = lyricsText;
            }
          } catch {}
        } else if (frameId === 'APIC' && !result.artworkBlobUrl) {
          try {
            let q = 1;
            let mime = '';
            while (q < frameData.length && frameData[q] !== 0) {
              const char = frameData[q];
              if (char !== undefined) mime += String.fromCharCode(char);
              q++;
            }
            q++; // skip null
            if (!mime) mime = 'image/jpeg';
            q++; // skip pic type

            if (enc === 1 || enc === 2) {
              while (q + 1 < frameData.length && !(frameData[q] === 0 && frameData[q + 1] === 0)) q += 2;
              q += 2;
            } else {
              while (q < frameData.length && frameData[q] !== 0) q++;
              q++;
            }

            if (q < frameData.length) {
              const imageBytes = frameData.subarray(q);
              const blob = new Blob([imageBytes as unknown as BlobPart], { type: mime });
              result.artworkBlobUrl = URL.createObjectURL(blob);
            }
          } catch {}
        }

        p += frameSize;
      }

      offset = 10 + tagSize;
    }

    // 2. Check for FLAC magic ('fLaC' = 0x66, 0x4C, 0x61, 0x43)
    if (
      offset + 4 <= bytes.length &&
      bytes[offset] === 0x66 &&
      bytes[offset + 1] === 0x4c &&
      bytes[offset + 2] === 0x61 &&
      bytes[offset + 3] === 0x43
    ) {
      let p = offset + 4;
      let isLast = false;

      while (!isLast && p + 4 <= bytes.length) {
        const header0 = bytes[p] ?? 0;
        isLast = (header0 & 0x80) !== 0;
        const blockType = header0 & 0x7f;
        const blockLen = ((bytes[p + 1] ?? 0) << 16) | ((bytes[p + 2] ?? 0) << 8) | (bytes[p + 3] ?? 0);
        p += 4;

        if (blockType === 4) {
          // VORBIS_COMMENT
          const tags = parseVorbisComments(bytes, p, blockLen);
          if (tags.TITLE) result.title = tags.TITLE;
          if (tags.ARTIST) result.artist = tags.ARTIST;
          if (tags.ALBUM) result.album = tags.ALBUM;
          if (tags.TRACKNUMBER) {
            const num = parseInt(tags.TRACKNUMBER, 10);
            if (!isNaN(num)) result.trackNumber = num;
          }
          if (tags.LYRICS || tags.UNSYNCEDLYRICS) {
            result.lyrics = tags.LYRICS || tags.UNSYNCEDLYRICS || null;
          }
        } else if (blockType === 6) {
          // PICTURE
          const pic = parseFlacPicture(bytes, p, blockLen);
          if (pic) {
            if (!result.artworkBlobUrl || pic.isFront) {
              result.artworkBlobUrl = pic.url;
            }
          }
        }

        p += blockLen;
      }
    }
  } catch {
    // Return whatever was successfully parsed
  }

  return result;
}

export async function parseAudioFileMetadata(file: File): Promise<ParsedMetadata> {
  try {
    // Read up to 16MB of header to capture Vorbis comments and large embedded FLAC artwork
    const sliceSize = Math.min(file.size, 16 * 1024 * 1024);
    const headerBuffer = await file.slice(0, sliceSize).arrayBuffer();
    return parseAudioBufferMetadata(headerBuffer, file.name);
  } catch {
    return parseAudioBufferMetadata(new ArrayBuffer(0), file.name);
  }
}

/** Guess Artist and Title from filename like "Artist - Title.flac" or "01. Title.mp3" */
export function parseFileName(fileName: string): { title: string; artist: string } {
  const base = fileName.replace(/\.[a-zA-Z0-9]+$/, '').trim();

  if (base.includes(' - ')) {
    const parts = base.split(' - ');
    const artistPart = parts[0];
    if (artistPart) {
      const artist = artistPart.replace(/^\d+[\s.-]+/, '').trim();
      const title = parts.slice(1).join(' - ').trim();
      if (artist && title) {
        return { artist, title };
      }
    }
  }

  const title = base.replace(/^\d+[\s._-]+/, '').trim() || base;
  return {
    title,
    artist: 'Unknown Artist',
  };
}
