"""Brand-news relevance rules, checked on headlines that reached the News page before the rules existed."""
import pytest

from app.news.google_news import brand_queries
from app.news.rules import (
    brand_in_context, final_kind, headline_tokens, is_blocked_source, is_category, is_indian_source, same_event,
)
from app.news.types import NewsBrand

HIT = NewsBrand(name="HIT", about="", company="Godrej Consumer Products", requires_context=True,
                exclude_terms=["box office", "hit and run", "film"])
RAID = NewsBrand(name="Raid", about="", company="SC Johnson", requires_context=True)
MORTEIN = NewsBrand(name="Mortein", about="", company="Reckitt")
ODOMOS = NewsBrand(name="Odomos", about="", company="Dabur")
GOOD_KNIGHT = NewsBrand(name="Good Knight", about="", company="Godrej Consumer Products", requires_context=True)


@pytest.mark.parametrize(
    "brand, verdict, title, expected",
    [
        # The brand name used as an ordinary word, wrongly judged "brand" before.
        (RAID, "brand", "Raid nana’s jewellery box: Cup Day’s ‘playground of fashion’ set to usher back brooches", "unrelated"),
        (HIT, "brand", "India’s first home-grown insecticide molecule Pioxaniliprole to hit market this Rabi season", "related"),
        (HIT, "brand", "Pune: PMC Inspects 14 Lakh Houses, Detects Mosquito Breeding In 13,000, Collects ₹6.3 Lakh In Fines", "related"),
        # The product itself, in any story.
        (MORTEIN, "brand", "Mortein can with lighter taped near nozzle found after erratic driver crash", "brand"),
        (HIT, "brand", "Godrej launches new Kala HIT spray with longer protection", "brand"),
        # Nothing to do with pest control.
        (HIT, "related", "Key facts: Record Q3 Profit, Dividend and Buyback; TBC Sets 2028 Targets", "unrelated"),
        (ODOMOS, "related", "Dabur Home and Personal Care rises 10.9% on hair care", "unrelated"),
        (GOOD_KNIGHT, "related", "Shipra Chinchankar joins Kinnect as National Planning Director", "unrelated"),
        # Company news: kept apart, shown only when asked for.
        (ODOMOS, "company", "Mohit Malhotra resigns as Dabur CEO, Herjit Bhalla joins board | India News", "company"),
        # No model: keyword sorting with the same checks.
        (RAID, None, "Police raid on illegal factory in Pune", "unrelated"),
        (MORTEIN, None, "Dengue cases rise in Mumbai as monsoon lingers", "related"),
    ],
)
def test_final_kind(brand, verdict, title, expected):
    assert final_kind(brand, verdict, title, company_tracked=False) == expected


def test_company_news_goes_to_the_companys_own_row_when_tracked():
    assert final_kind(ODOMOS, "company", "Dabur Q3 results beat estimates", company_tracked=True) == "unrelated"


def test_everyday_word_brand_needs_a_product_word():
    assert not brand_in_context(RAID, "Raid on the casino")
    assert brand_in_context(RAID, "SC Johnson launches Raid ant gel in India")
    assert brand_in_context(MORTEIN, "Mortein's new ad stars a cricketer")  # not an everyday word


def test_category_words():
    assert is_category("Chikungunya cases climb in Kerala")
    assert is_category("Best mosquito coil for monsoon")
    assert not is_category("Important update on tax filing")  # "ant" inside a word
    assert not is_category("Godrej Consumer Products holds FY27 growth guidance despite commodity inflation")


def test_sources():
    assert is_blocked_source("Pixelfy.me")
    assert is_blocked_source("Fortune Business Insights")
    assert not is_blocked_source("The Hindu")
    assert is_indian_source("Hindustan Times")
    assert is_indian_source("Some Blog", "https://www.example.co.in/story")
    assert not is_indian_source("The Standard | Warrnambool, VIC", "https://www.standard.net.au/story")


def test_same_event_headlines_group_together():
    a = headline_tokens("Mohit Malhotra resigns as Dabur CEO, Herjit Bhalla joins board | India News")
    b = headline_tokens("Dabur Global CEO Mohit Malhotra Resigns After 30 Years, Stock Slips 2.5%")
    c = headline_tokens("Dabur's global CEO resigns, India boss joins board")
    d = headline_tokens("Godrej Consumer Products holds FY27 growth guidance despite commodity inflation")
    assert same_event(a, b) and same_event(a, c) and same_event(b, c)
    assert "dabur" in c  # "Dabur's" counts as "dabur"
    assert not same_event(a, d)
    assert not same_event(headline_tokens("Top 5 Best Roach Killer For Home 2026"),
                          headline_tokens("Top 5 Best Indoor Pest Sprays 2026"))


def test_search_queries_carry_exclusions():
    q = brand_queries(NewsBrand(name="HIT", about="", search_terms=['"cockroach spray"'], company="Godrej Consumer Products",
                                requires_context=True, exclude_terms=["box office", "film", '"hit and run"']))
    assert q == [
        '"HIT" ("cockroach spray" OR mosquito OR cockroach OR repellent OR insecticide OR spray OR Godrej)'
        ' -"box office" -film -"hit and run"'
    ]


def test_plain_name_is_searched_too_unless_it_is_an_everyday_word():
    q = brand_queries(NewsBrand(name="Mortein", about="", search_terms=['"mosquito repellent"'], company="Reckitt"))
    assert q == [
        '"Mortein" ("mosquito repellent" OR mosquito OR cockroach OR repellent OR insecticide OR spray OR Reckitt)',
        '"Mortein"',
    ]
