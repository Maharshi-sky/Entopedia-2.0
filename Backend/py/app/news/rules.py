"""
Deterministic rules applied around the model's verdict, so a story is kept only when it is plausibly about
the brand or its pest-control category, whatever the model said:

  final_kind        the model's verdict checked against the headline -> brand | company | related | unrelated
  is_category       does the headline concern household pest control (mosquitoes, cockroaches, repellents…)?
  brand_in_context  does the headline name the brand AS the brand (not "raid" the word, "hit" the verb)?
  is_blocked_source SEO list sites and market-research press-release mills
  is_indian_source  Indian publishers (a .in site or a known Indian outlet)
  cluster_key / same_event  one news event reported by several outlets
"""
import re
from typing import Optional
from urllib.parse import urlsplit

from app.news.google_news import mentions
from app.news.types import NewsBrand

# Words that make a headline about household / public-health pest control.
_CATEGORY = re.compile(
    r"\b(mosquito(e?s)?|cockroach(es)?|roach(es)?|insect(s|icides?)?|insecticid(e|es|al)|pesticides?|"
    r"repellents?|repel(s|ling)?|larv(a|ae|icides?)|vector[- ]borne|dengue|malaria|chikungunya|zika|"
    r"filaria(sis)?|aedes|anopheles|culex|bed ?bugs?|termites?|ants?\b(?! ?(group|financial))|house ?fl(y|ies)|"
    r"fruit ?fl(y|ies)|rodents?|rats?|pests?|pest[- ]control|fumigat\w*|vaporiz(er|ers)|vaporis(er|ers)|"
    r"mosquito ?coils?|liquidator|aerosols?|bug ?spray|gel ?baits?|baits?)\b",
    re.I,
)

# Product words that show a short, ambiguous brand name ("HIT", "Raid", "All Out") is meant as the brand.
_PRODUCT_CONTEXT = re.compile(
    r"\b(spray|sprays|gel|coil|coils|vaporizer|vaporiser|refill|refills|repellent|repellents|insecticide|"
    r"aerosol|bait|baits|liquid|card|cream|roll[- ]on|patch|mosquito|mosquitoes|cockroach|cockroaches|roach|"
    r"insect|insects|bug|bugs|ant|ants|fly|flies|pest|pests|launch|launches|ad|ads|campaign|brand)\b",
    re.I,
)


def is_category(title: str) -> bool:
    return bool(_CATEGORY.search(title))


def brand_in_context(brand: NewsBrand, title: str) -> bool:
    """The headline names the brand, and for an everyday-word brand also shows it is the product."""
    if not mentions(brand.name, title):
        return False
    if not brand.requires_context:
        return True
    company = brand.company or ""
    return bool(_PRODUCT_CONTEXT.search(title)) or (bool(company) and company.lower().split()[0] in title.lower())


def final_kind(brand: NewsBrand, verdict: Optional[str], title: str, company_tracked: bool) -> str:
    """
    The kind a story is saved as, from the model's verdict (None = no model) and the headline:
      brand    -> kept only if the headline names the brand in context; else related if it is about the
                  category; else unrelated
      company  -> company (shown only on request), or unrelated when the company has its own tracked row
      related  -> kept only if the headline is about the pest-control category
      none     -> keyword sorting with the same checks
    """
    if verdict == "unrelated":
        return "unrelated"
    if verdict == "company":
        return "unrelated" if company_tracked else "company"
    if verdict in ("brand", None) and brand_in_context(brand, title):
        return "brand"
    return "related" if is_category(title) else "unrelated"


# ── Sources ─────────────────────────────────────────────────────────────────

# SEO "top 10" list sites and market-research press-release mills: never news about the brand.
_BLOCKED = (
    "pixelfy", "fortune business insights", "fortunebusinessinsights", "openpr", "einpresswire", "ein presswire",
    "marketsandmarkets", "market research future", "precedence research", "coherent market insights",
    "imarc", "grand view research", "verified market", "mordor intelligence", "6wresearch", "custom market insights",
    "expert market research", "market.us", "maximize market research", "allied market research",
    "data bridge market research", "transparency market research", "future market insights", "polaris market research",
    "spherical insights", "the brainy insights", "zion market research", "research nester", "straits research",
    "skyquest technology", "global market insights", "persistence market research", "factmr", "fact.mr",
    "databridgemarketresearch", "openpr.com", "whatech", "newstrail", "digital journal", "taiwannews",
)


def is_blocked_source(publisher: Optional[str], url: Optional[str] = None) -> bool:
    text = f"{publisher or ''} {_domain(url)}".lower()
    return any(b in text for b in _BLOCKED)


_INDIAN_PUBLISHERS = (
    "times of india", "economic times", "hindustan times", "the hindu", "indian express", "financial express",
    "business standard", "livemint", "mint", "moneycontrol", "ndtv", "india today", "news18", "firstpost",
    "free press journal", "business today", "the tribune", "deccan herald", "deccan chronicle", "the print",
    "theprint", "scroll", "the wire", "outlook", "dna india", "zee news", "republic", "abp", "cnbc tv18",
    "cnbctv18", "et retail", "etretail", "brand equity", "exchange4media", "afaqs", "campaign india", "mid-day",
    "mathrubhumi", "the statesman", "telangana today", "the new indian express", "new indian express", "lokmat",
    "dainik", "amar ujala", "jagran", "bhaskar", "navbharat", "pti", "ians", "ani news", "devdiscourse",
    "the week", "frontline", "bizz buzz", "telegraph india", "the telegraph", "medianama", "inc42", "yourstory",
    "entrackr", "the ken", "the morning context", "businessline", "hindu businessline", "et healthworld",
    "et brandequity", "indiatimes", "tv9", "india tv", "mumbai mirror", "pune mirror", "bangalore mirror",
    "the bridge chronicle", "punekar news", "the siasat daily", "siasat", "odishatv", "the sentinel", "greater kashmir",
)


def _domain(url: Optional[str]) -> str:
    try:
        return (urlsplit(url).hostname or "").lower() if url else ""
    except ValueError:
        return ""


def is_indian_source(publisher: Optional[str], url: Optional[str] = None) -> bool:
    domain = _domain(url)
    if domain.endswith(".in") or ".co.in" in domain:
        return True
    name = (publisher or "").lower()
    return any(p == name or p in name for p in _INDIAN_PUBLISHERS)


# ── One event, several outlets ──────────────────────────────────────────────

_STOP = set(
    "a an and are as at be by for from has have in into is it its of on or the to was were with after over says said "
    "new news latest today amid about this that these those than then will would can could may india indian top best "
    "how why what who when where report reports update updates".split()
)


def headline_tokens(title: str) -> set[str]:
    """Content words of a headline: lower case, possessive 's and plural s dropped ("Dabur's" = "dabur")."""
    words = re.findall(r"[a-z]+(?:['’][a-z]+)?", title.lower())
    out = set()
    for w in words:
        w = re.sub(r"['’]s$", "", w).replace("'", "").replace("’", "")
        if len(w) > 2 and w not in _STOP:
            out.add(w.rstrip("s") or w)
    return out


def same_event(a: set[str], b: set[str]) -> bool:
    """Two headlines report the same event: at least 4 shared words and half of the shorter headline."""
    shared = len(a & b)
    return shared >= 4 and shared / max(1, min(len(a), len(b))) >= 0.5
