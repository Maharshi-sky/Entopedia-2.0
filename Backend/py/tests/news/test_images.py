import base64
import json
import urllib.parse

import pytest

from app.news.images import ImageLookup, find_image, lookup, resolve_google, usable_image

ARTICLE = """<!doctype html><html><head>
<meta charset="utf-8">
<meta property="og:site_name" content="Mint">
<meta name="twitter:image" content="https://images.example.com/twitter.jpg">
<meta content="/img/2026/11/mortein-refill.jpg?w=1200&amp;h=630" property="og:image">
<title>Mortein launches refill</title></head><body>…</body></html>"""


class TestFindImage:
    def test_prefers_og_image_resolves_relative_link_and_decodes_entities(self):
        assert find_image(ARTICLE, "https://www.livemint.com/news/mortein-refill-123.html") == (
            "https://www.livemint.com/img/2026/11/mortein-refill.jpg?w=1200&h=630"
        )

    def test_skips_a_logo_and_falls_back_to_the_next_key(self):
        html = (
            '<meta property="og:image" content="https://site.com/static/site-logo.png">'
            '<meta name="twitter:image" content="https://site.com/photos/story.jpg">'
        )
        assert find_image(html, "https://site.com/a") == "https://site.com/photos/story.jpg"

    def test_returns_none_when_page_has_no_preview_image(self):
        assert find_image('<meta name="description" content="x">', "https://site.com/a") is None


@pytest.mark.parametrize(
    "url,expected",
    [
        ("https://cdn.site.com/a/b/photo.jpg", True),
        ("https://cdn.site.com/", False),
        ("https://cdn.site.com", False),
        ("https://cdn.site.com/brand/LOGO-dark.png", False),
        ("data:image/png;base64,AAA", False),
        (None, False),
    ],
)
def test_usable_image(url, expected):
    assert usable_image(url) is expected


GOOGLE_PAGE = '<c-wiz><div jscontroller="x" data-n-a-sg="SIG123" data-n-a-ts="1763280000"></div></c-wiz>'
_batch_inner = [
    "wrb.fr", "Fbv4je",
    '["garturlres","https://www.livemint.com/news/mortein-refill-123.html",1]',
    None, None, None, "generic",
]
BATCH_REPLY = ")]}'\n\n" + json.dumps([_batch_inner])


class TestResolveGoogleAndLookup:
    @pytest.mark.asyncio
    async def test_turns_google_news_link_into_publisher_link_and_reads_its_picture(self, httpx_mock):
        httpx_mock.add_response(url="https://news.google.com/rss/articles/CBMiAAA", status_code=200, content=GOOGLE_PAGE.encode())

        def _batch_callback(request):
            import httpx
            body = urllib.parse.unquote(request.content.decode())
            # The request names the article id, its timestamp and its signature from the Google page.
            assert '\\"CBMiAAA\\",1763280000,\\"SIG123\\"' in body
            return httpx.Response(200, content=BATCH_REPLY.encode())

        httpx_mock.add_callback(_batch_callback, url="https://news.google.com/_/DotsSplashUi/data/batchexecute")
        httpx_mock.add_response(
            url="https://www.livemint.com/news/mortein-refill-123.html", status_code=200,
            headers={"content-type": "text/html; charset=utf-8"}, content=ARTICLE.encode(),
        )

        r = await lookup("https://news.google.com/rss/articles/CBMiAAA?oc=5")
        assert r == ImageLookup(
            article_url="https://www.livemint.com/news/mortein-refill-123.html",
            image="https://www.livemint.com/img/2026/11/mortein-refill.jpg?w=1200&h=630",
            image_checked=True,
            image_error=None,
        )

    @pytest.mark.asyncio
    async def test_leaves_a_publisher_link_as_it_is(self):
        assert await resolve_google("https://www.ndtv.com/story") == "https://www.ndtv.com/story"

    @pytest.mark.asyncio
    async def test_records_a_refusal_as_final_so_it_is_not_retried_on_every_refresh(self, httpx_mock, monkeypatch):
        monkeypatch.delenv("ZYTE_API_KEY", raising=False)
        httpx_mock.add_response(url="https://blocked.example/story", status_code=403, content=b"no")
        r = await lookup("https://blocked.example/story")
        assert r.image is None
        assert r.image_checked is True
        assert r.image_error == "HttpError: HTTP 403"

    @pytest.mark.asyncio
    async def test_leaves_a_timeout_or_rate_limit_open_for_the_next_backfill(self, httpx_mock):
        httpx_mock.add_response(url="https://slow.example/story", status_code=429, content=b"busy")
        r = await lookup("https://slow.example/story")
        assert r.image_checked is False

    @pytest.mark.asyncio
    async def test_retries_a_blocked_site_through_zyte_when_a_key_is_set(self, httpx_mock, monkeypatch):
        monkeypatch.setenv("ZYTE_API_KEY", "test-key")
        httpx_mock.add_response(url="https://blocked.example/story", status_code=403, content=b"no")
        httpx_mock.add_response(
            url="https://api.zyte.com/v1/extract", status_code=200,
            json={"httpResponseBody": base64.b64encode(ARTICLE.encode()).decode()},
        )
        r = await lookup("https://blocked.example/story")
        assert r.image == "https://blocked.example/img/2026/11/mortein-refill.jpg?w=1200&h=630"
