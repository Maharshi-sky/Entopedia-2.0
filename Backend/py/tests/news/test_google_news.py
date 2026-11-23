from datetime import datetime, timezone

from app.news.categories import app_category
from app.news.google_news import brand_queries, dedupe, mentions, normalise_headline, parse_feed, search_url
from app.news.store import story_key
from app.news.types import NewsBrand, Story

FEED = """<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>"Mortein" when:30d - Google News</title>
<item>
  <title>Mortein launches new liquid vaporiser refill - The Economic Times</title>
  <link>https://news.google.com/rss/articles/CBMiAAA?oc=5</link>
  <pubDate>Mon, 16 Nov 2026 06:30:00 GMT</pubDate>
  <source url="https://economictimes.indiatimes.com">The Economic Times</source>
</item>
<item>
  <title>Reckitt Q3 results: hygiene sales up   4%  - Mint</title>
  <link>https://news.google.com/rss/articles/CBMiBBB?oc=5</link>
  <pubDate>Sun, 15 Nov 2026 10:00:00 GMT</pubDate>
  <source url="https://www.livemint.com">Mint</source>
</item>
<item>
  <title>No link here</title>
  <pubDate>Sun, 15 Nov 2026 10:00:00 GMT</pubDate>
</item>
<item>
  <title>Dengue cases rise in Delhi &amp; NCR - NDTV</title>
  <link>https://news.google.com/rss/articles/CBMiCCC?oc=5</link>
  <pubDate>not a date</pubDate>
  <source url="https://www.ndtv.com">NDTV</source>
</item>
</channel></rss>"""


class TestParseFeed:
    items = parse_feed(FEED, '"Mortein"')

    def test_reads_every_item_with_title_and_link(self):
        assert len(self.items) == 3

    def test_removes_publisher_suffix_and_collapses_spaces(self):
        assert self.items[0].title == "Mortein launches new liquid vaporiser refill"
        assert self.items[0].publisher == "The Economic Times"
        assert self.items[1].title == "Reckitt Q3 results: hygiene sales up 4%"
        assert self.items[2].title == "Dengue cases rise in Delhi & NCR"

    def test_turns_pubdate_into_iso_utc_and_bad_date_into_none(self):
        assert self.items[0].published is not None
        parsed = datetime.fromisoformat(self.items[0].published)
        assert parsed == datetime(2026, 11, 16, 6, 30, 0, tzinfo=timezone.utc)
        assert self.items[2].published is None

    def test_keeps_google_link_and_query(self):
        assert self.items[0].url == "https://news.google.com/rss/articles/CBMiAAA?oc=5"
        assert self.items[0].query == '"Mortein"'


class TestSearchUrl:
    def test_builds_google_news_rss_search_for_an_edition(self):
        assert search_url('"All Out" mosquito', 7, "US") == (
            "https://news.google.com/rss/search?q=%22All%20Out%22%20mosquito%20when%3A7d&hl=en-US&gl=US&ceid=US:en"
        )


class TestMentions:
    @staticmethod
    def _cases():
        return [
            ("All Out", "All Out launches a new refill", True),
            ("All Out", "All-Out ultra review", True),
            ("All Out", "Allout sales grow", True),
            ("All Out", "Teams go all out for the final", True),  # a keyword match: the model decides it is unrelated
            ("Mortein", "Morteins", False),
            ("HIT", "Godrej HIT spray", True),
            ("HIT", "Box office hit of the year", False),  # a name in capitals matches in capitals only
            ("HIT", "Hit or Miss: The week in ads", False),
            ("HIT", "Crown Heights Hit And Run", False),
            ("HIT", "Godrej launches new HIT Anti Roach Gel", True),
            ("Mortein", "MORTEIN recalls cans", True),
            ("Godrej", "Reckitt profit rises", False),
        ]

    def test_mentions(self):
        for name, title, expected in self._cases():
            assert mentions(name, title) is expected, f"{name} in '{title}' -> {expected}"


class TestDedupe:
    @staticmethod
    def _s(title: str) -> Story:
        return Story(title=title, publisher="x", url=title, published=None, query="q")

    def test_keeps_first_of_headlines_differing_only_in_case_and_punctuation(self):
        out = dedupe([self._s("Mortein launches refill!"), self._s("mortein launches refill"), self._s("Another story")])
        assert [o.title for o in out] == ["Mortein launches refill!", "Another story"]


class TestBrandQueries:
    def test_searches_name_with_product_words_and_alone(self):
        assert brand_queries(NewsBrand(name="Mortein", about="", search_terms=[])) == [
            '"Mortein" (mosquito OR cockroach OR repellent OR insecticide OR spray)',
            '"Mortein"',
        ]

    def test_extra_terms_join_one_or_group_and_everyday_word_names_are_not_searched_alone(self):
        assert brand_queries(
            NewsBrand(name="All Out", about="", search_terms=["mosquito", '"SC Johnson"'], requires_context=True)
        ) == ['"All Out" (mosquito OR "SC Johnson" OR cockroach OR repellent OR insecticide OR spray)']


class TestStoryKey:
    def test_gives_same_key_as_python_version_so_old_mongodb_stories_map_to_same_rows(self):
        # Reference values from brand_news_check/db.py story_key()
        assert story_key("Mortein", "Mortein launches: NEW refill!") == "a6e1ea52035c666bd417f5f994a7d1ed"
        assert story_key("All Out", "All Out का नया रिफ़िल — ₹99!") == "39d345a046e0c005c0461e71a905248d"
        assert normalise_headline("Mortein launches: NEW refill!") == "mortein launches new refill"

    def test_differs_per_brand_for_the_same_headline(self):
        assert story_key("Mortein", "Same headline") != story_key("Godrej", "Same headline")


class TestAppCategory:
    def test_maps_scraper_categories_to_app_categories(self):
        assert app_category("product launch") == "Product"
        assert app_category("regulatory & legal") == "Regulatory"
        assert app_category("safety & recall") == "Safety"
        assert app_category("people & CSR") == "People & Company"
        assert app_category("stock market list") == "Industry"
        assert app_category(None) == "Industry"
        assert app_category("something new") == "Industry"
