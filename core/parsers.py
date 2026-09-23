"""How a request body is read.

Its own module rather than core.exceptions: that one is also the logging
handler Django resolves during setup(), so importing rest_framework.views
from it closes a circle before DRF's settings exist.
"""
from rest_framework.exceptions import ParseError
from rest_framework.parsers import JSONParser


class ObjectOnlyJSONParser(JSONParser):
    """Reject a JSON body that is not an object.

    Every view in this product reads its input with `request.data.get(...)`,
    which is the right shape for `{"stage_key": "..."}` and an AttributeError
    for `[]`, `"a string"`, `123` or `null` -- 162 call sites, each one a 500
    waiting for a malformed request. DRF parses all four happily, so the check
    belongs where the parsing happens rather than at every reader.

    Nothing in this API takes a top-level array: bulk import is a file upload,
    and every list a client sends is a value inside an object.
    """

    def parse(self, stream, media_type=None, parser_context=None):
        data = super().parse(stream, media_type, parser_context)
        # `null` included: it parses to None, and `None.get` is the same 500.
        if not isinstance(data, dict):
            raise ParseError(
                'Send a JSON object, like {"field": "value"}. '
                f'This request sent {"null" if data is None else type(data).__name__}.')
        return data
