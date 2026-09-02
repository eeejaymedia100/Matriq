#!/usr/bin/env python3
"""Smoke-test the Matriq waitlist site (waitlist/).

Checks every public page for:
  - exactly one primary H1,
  - present, non-empty title + meta description,
  - canonical link that matches the page's real URL,
  - Open Graph + Twitter metadata on social-facing pages,
  - valid JSON-LD (parses, has Organization/WebSite/SoftwareApplication, no LocalBusiness),
  - internal hrefs and referenced assets actually resolve on disk,
  - no duplicate HTML ids within a page.

Run:  python3 scripts/smoke-test-waitlist.py
"""

import json
import os
import re
import sys
from html.parser import HTMLParser

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = os.path.join(ROOT, "waitlist")

PAGES = ["index.html", "terms.html", "privacy.html", "404.html"]


class PageParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.head = []
        self.h1 = []
        self.h2 = []
        self.h3 = []
        self.ids = []
        self.scripts = []
        self.jsonld = []
        self.hrefs = []
        self.srcs = []

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag in ("meta", "title", "link"):
            if tag == "title":
                self.head.append(("title", a.get("data-raw", "")))
            else:
                self.head.append((tag, a))
        if tag == "h1":
            self.h1.append(a.get("id"))
        if tag == "h2":
            self.h2.append(a.get("id"))
        if tag == "h3":
            self.h3.append(a.get("id"))
        if "id" in a:
            self.ids.append(a["id"])
        if tag == "script" and a.get("type") == "application/ld+json":
            self.script_tag = self
        if tag in ("a", "link", "script", "img", "source"):
            if a.get("href"):
                self.hrefs.append(a["href"])
            if a.get("src"):
                self.srcs.append(a["src"])

    def handle_data(self, data):
        if getattr(self, "script_tag", None) is self:
            if data.strip():
                self.jsonld.append(data.strip())


def local_path(url):
    """Map a site-relative URL to a local file path."""
    if "://" in url or url.startswith(("data:", "mailto:", "tel:")):
        return None
    path = url.split("#")[0].split("?")[0]
    if not path:
        return SITE
    return os.path.join(SITE, path.lstrip("/"))


def main():
    errors = 0

    def fail(msg):
        nonlocal errors
        errors += 1
        print(f"  ✗ {msg}")

    for page in PAGES:
        path = os.path.join(SITE, page)
        print(f"\n== {page} ==")
        with open(path, encoding="utf-8") as f:
            html = f.read()

        p = PageParser()
        p.feed(html)

        if len(p.h1) != 1:
            fail(f"expected exactly 1 <h1>, found {len(p.h1)}")
        else:
            print(f"  ✓ 1 <h1> (id={p.h1[0]})")
        for h in p.h2:
            print(f"  ✓ <h2 id={h}>")
        if page in ("index.html", "terms.html", "privacy.html"):
            if len(p.h2) < 4:
                fail("page should have several <h2> sections")

        metas = {m[1].get("name", m[1].get("property", "")): m[1].get("content", "")
                 for m in p.head if m[0] == "meta"}
        title = next((m[1] for m in p.head if m[0] == "title"), None) or \
                next((c for k, c in metas.items() if k == "og:title"), None)
        if not title:
            fail("missing <title>")
        else:
            print(f"  ✓ title: {title[:60]}…")
        descr = metas.get("description")
        if not descr or len(descr) < 40:
            fail(f"description missing or too short ({len(descr or '')} chars)")
        else:
            print(f"  ✓ description ({len(descr)} chars)")

        canon = next((m[1].get("href") for m in p.head if m[0] == "link" and m[1].get("rel") == "canonical"), None)
        expected_canon = {
            "index.html": "https://matriq.com.ng/",
            "terms.html": "https://matriq.com.ng/terms.html",
            "privacy.html": "https://matriq.com.ng/privacy.html",
            "404.html": "https://matriq.com.ng/404.html",
        }[page]
        if canon != expected_canon:
            fail(f"canonical {canon!r} != {expected_canon!r}")
        else:
            print(f"  ✓ canonical {canon}")

        if page != "404.html":
            for key in ("og:title", "og:description", "og:image", "og:url", "og:type", "twitter:card"):
                if not metas.get(key):
                    fail(f"missing social meta {key}")
            else:
                print("  ✓ OG + Twitter meta complete")
            if metas.get("robots"):
                print(f"  ✓ robots {metas['robots']}")

        if page == "index.html":
            if p.jsonld:
                try:
                    data = json.loads(p.jsonld[0])
                    types = {g["@type"] for g in data.get("@graph", [])}
                    for t in ("Organization", "WebSite", "SoftwareApplication"):
                        if t not in types:
                            fail(f"JSON-LD missing {t}")
                    if "LocalBusiness" in types:
                        fail("JSON-LD must NOT contain LocalBusiness")
                    print(f"  ✓ JSON-LD: {sorted(types)} (no LocalBusiness)")
                except json.JSONDecodeError as e:
                    fail(f"JSON-LD does not parse: {e}")
            else:
                fail("index.html has no JSON-LD")

        # Internal link / asset resolution.
        broken = []
        for url in p.hrefs + p.srcs:
            lp = local_path(url)
            if lp and not os.path.exists(lp):
                broken.append(url)
        if broken:
            fail(f"broken local refs: {broken}")
        else:
            print(f"  ✓ all {len(p.hrefs)} links + {len(p.srcs)} assets resolve on disk")

        # Duplicate ids.
        dupes = {i for i in p.ids if p.ids.count(i) > 1}
        if dupes:
            fail(f"duplicate ids: {dupes}")
        else:
            print(f"  ✓ no duplicate ids ({len(p.ids)} unique)")

    # Cross-page: every HTML page referenced from the index exists.
    with open(os.path.join(SITE, "index.html"), encoding="utf-8") as f:
        index_html = f.read()
    for m in re.finditer(r'href="(/[^"#]*\.html)"', index_html):
        if not os.path.exists(os.path.join(SITE, m.group(1).lstrip("/"))):
            print(f"  ✗ index.html links to missing {m.group(1)}")
            errors += 1
    if "privacy.html" not in index_html:
        print("  ✗ index footer should link to privacy.html")
        errors += 1
    if "terms.html" not in index_html:
        print("  ✗ index footer should link to terms.html")
        errors += 1

    print(f"\n{'FAILED' if errors else 'PASSED'} — {errors} problem(s)")
    sys.exit(1 if errors else 0)


if __name__ == "__main__":
    main()