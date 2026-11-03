import { BASE_URL } from '../config';
import { guardedFetch, getHeaders, failWith } from '../client';

/** Uploads that belong to no one area: voice notes. */
export const uploadsApi = {
  // A dictated note's recording. Stored in media, URL comes back; the caller
  // saves that URL with the note through the endpoint that owns the note.
  async uploadVoiceNote(blob) {
    const formData = new FormData();
    const ext = (blob.type || 'audio/webm').split('/')[1].split(';')[0];
    formData.append('audio', blob, `note.${ext}`);
    const res = await guardedFetch(`${BASE_URL}/voice-notes/`, {
      method: 'POST', headers: getHeaders(true), body: formData,
    });
    if (!res.ok) await failWith(res, 'Could not save the recording');
    return (await res.json()).url;
  },
};
