"""Real, tiny image bytes for tests: the upload guard verifies pixels with
Pillow now, so a b'jpeg' placeholder no longer passes for a photo."""

import io

from PIL import Image


def _bytes(fmt):
    buf = io.BytesIO()
    Image.new('RGB', (2, 2), 'white').save(buf, fmt)
    return buf.getvalue()


PNG = _bytes('PNG')
JPEG = _bytes('JPEG')
