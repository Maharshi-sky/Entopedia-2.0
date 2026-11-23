import pytest

from app.news.http_client import HttpError
from app.news.image_proxy import fetch_image, is_private_address

PUBLIC = "http://93.184.216.34"  # an IP literal: no DNS lookup in the test


@pytest.mark.parametrize(
    "ip,expected",
    [
        ("127.0.0.1", True),
        ("10.2.3.4", True),
        ("172.20.0.1", True),
        ("192.168.1.10", True),
        ("169.254.169.254", True),  # cloud metadata
        ("100.64.0.1", True),
        ("::1", True),
        ("fd00::1", True),
        ("::ffff:127.0.0.1", True),
        ("93.184.216.34", False),
        ("2606:4700::1111", False),
    ],
)
def test_is_private_address(ip, expected):
    assert is_private_address(ip) is expected


class TestFetchImage:
    @pytest.mark.asyncio
    async def test_returns_a_picture_and_sends_the_article_as_referrer(self, httpx_mock):
        httpx_mock.add_response(
            url=f"{PUBLIC}/photo.png", status_code=200,
            headers={"content-type": "image/png"}, content=bytes([137, 80, 78, 71]),
        )
        img = await fetch_image(f"{PUBLIC}/photo.png", "https://www.livemint.com/news/story.html")
        assert img.type == "image/png"
        assert len(img.bytes_) == 4
        request = httpx_mock.get_requests()[0]
        assert request.headers["referer"] == "https://www.livemint.com/news/story.html"

    @pytest.mark.asyncio
    async def test_refuses_localhost_or_metadata_address_also_after_redirect(self, httpx_mock):
        with pytest.raises(RuntimeError, match="not a public address"):
            await fetch_image("http://127.0.0.1/a.jpg")
        with pytest.raises(RuntimeError, match="not a public address"):
            await fetch_image("http://169.254.169.254/latest/meta-data")

        httpx_mock.add_response(
            url=f"{PUBLIC}/redirect.jpg", status_code=302, headers={"location": "http://10.0.0.5/secret.jpg"},
        )
        with pytest.raises(RuntimeError, match="not a public address"):
            await fetch_image(f"{PUBLIC}/redirect.jpg")

    @pytest.mark.asyncio
    async def test_refuses_svg_and_non_image_responses(self, httpx_mock):
        httpx_mock.add_response(url=f"{PUBLIC}/a.svg", status_code=200, headers={"content-type": "image/svg+xml"}, content=b"<svg/>")
        with pytest.raises(RuntimeError, match=r"not a picture \(image/svg\+xml\)"):
            await fetch_image(f"{PUBLIC}/a.svg")

        httpx_mock.add_response(url=f"{PUBLIC}/a.jpg", status_code=200, headers={"content-type": "text/html"}, content=b"<html>")
        with pytest.raises(RuntimeError, match=r"not a picture \(text/html\)"):
            await fetch_image(f"{PUBLIC}/a.jpg")

    @pytest.mark.asyncio
    async def test_refuses_pictures_over_5mb(self, httpx_mock):
        httpx_mock.add_response(
            url=f"{PUBLIC}/big.jpg", status_code=200,
            headers={"content-type": "image/jpeg", "content-length": str(6 * 1024 * 1024)}, content=b"x",
        )
        with pytest.raises(RuntimeError, match="larger than 5 MB"):
            await fetch_image(f"{PUBLIC}/big.jpg")

    @pytest.mark.asyncio
    async def test_refuses_non_http_links(self):
        with pytest.raises(RuntimeError, match=r"only http\(s\)"):
            await fetch_image("file:///etc/passwd")

    @pytest.mark.asyncio
    async def test_passes_on_the_publisher_refusing(self, httpx_mock):
        httpx_mock.add_response(url=f"{PUBLIC}/a.jpg", status_code=403, content=b"no")
        with pytest.raises(HttpError, match="HTTP 403"):
            await fetch_image(f"{PUBLIC}/a.jpg")
