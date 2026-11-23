"""
The scraper tags each story with its own category (CATEGORIES in classifier.py). The app's News page,
dashboard chart and newsletter use a different list, so each story also gets the app category it maps to.
The scraper's label is kept in news.source_category.
"""
from typing import Optional

APP_CATEGORY = {
    "product launch": "Product",
    "marketing & ads": "Product",
    "business & financial": "Industry",
    "stock market list": "Industry",
    "regulatory & legal": "Regulatory",
    "safety & recall": "Safety",
    "competitor & market": "Industry",
    "people & CSR": "People & Company",
    "review & opinion": "Interviews",
    "other": "Industry",
}


def app_category(source_category: Optional[str]) -> str:
    return APP_CATEGORY.get(source_category or "other", "Industry")
