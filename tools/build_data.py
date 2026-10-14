"""Builds data/items.js, data/npcs.js and icons/ from the Stardew wikis.

Usage:  python tools/build_data.py            (uses cached API responses)
        python tools/build_data.py --refresh  (re-queries the wikis)

Sources:
  vanilla  stardewvalleywiki.com  (+ item IDs from github.com/MateusAquino/stardewids)
  sve      stardew-valley-expanded.fandom.com
  rsv      ridgesidevillage.wiki.gg
"""
import hashlib
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, "tools", ".cache")
UA = "StardewHelper/1.0 (personal item tracker; python urllib)"
BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36"
REFRESH = "--refresh" in sys.argv

VANILLA_API = "https://stardewvalleywiki.com/mediawiki/api.php"
SVE_API = "https://stardew-valley-expanded.fandom.com/api.php"
RSV_API = "https://ridgesidevillage.wiki.gg/api.php"
VANILLA_IDS = "https://raw.githubusercontent.com/MateusAquino/stardewids/main/dist/objects.json"

QUALITY_TYPES = {"Crops", "Fruit", "Forage", "Fish", "Animal Products", "Artisan Goods"}
SHIP_TYPES = {"Crops", "Fruit", "Forage", "Animal Products", "Artisan Goods", "Monster Loot", "Resources"}

# ---------------------------------------------------------------- http helpers

def http_get(url, binary=False, referer=None):
    headers = {"User-Agent": UA}
    if referer:  # image CDNs (fandom) reject non-browser requests without a referer
        headers = {"User-Agent": BROWSER_UA, "Referer": referer}
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=60) as r:
                data = r.read()
            time.sleep(0.15)
            return data if binary else data.decode("utf-8")
        except Exception as e:  # noqa: BLE001
            if attempt == 3:
                raise
            print(f"  retry {url[:90]} ({e})")
            time.sleep(2 * (attempt + 1))


def api(base, **params):
    params.setdefault("format", "json")
    url = base + "?" + urllib.parse.urlencode(params)
    key = hashlib.sha1(url.encode()).hexdigest()
    path = os.path.join(CACHE, key + ".json")
    if not REFRESH and os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    data = json.loads(http_get(url))
    os.makedirs(CACHE, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f)
    return data


def category_members(base, cat, depth=1):
    """Article titles in a category, descending into subcategories `depth` levels."""
    titles, cont = [], {}
    while True:
        d = api(base, action="query", list="categorymembers", cmtitle="Category:" + cat,
                cmlimit=500, **cont)
        for m in d["query"]["categorymembers"]:
            if m["ns"] == 0:
                titles.append(m["title"])
            elif m["ns"] == 14 and depth > 0:
                titles += category_members(base, m["title"].split(":", 1)[1], depth - 1)
        if "continue" not in d:
            return titles
        cont = {"cmcontinue": d["continue"]["cmcontinue"]}


def page_info(base, titles):
    """{requested title: {"title", "cats": [...], "image": url|None}} following redirects."""
    out = {}
    titles = list(dict.fromkeys(titles))
    for i in range(0, len(titles), 50):
        chunk = titles[i:i + 50]
        d = api(base, action="query", titles="|".join(chunk), prop="categories|pageimages",
                piprop="original", cllimit="max", redirects=1)
        q = d["query"]
        alias = {}
        for kind in ("normalized", "redirects"):
            for r in q.get(kind, []):
                alias[r["from"]] = r["to"]
        pages = {p["title"]: p for p in q["pages"].values() if "missing" not in p}
        for t in chunk:
            final = t
            while final in alias:
                final = alias[final]
            p = pages.get(final)
            if p:
                out[t] = {
                    "title": p["title"],
                    "cats": [c["title"].split(":", 1)[1] for c in p.get("categories", [])],
                    "image": p.get("original", {}).get("source"),
                }
    return out


def file_url(base, filename):
    d = api(base, action="query", titles="File:" + filename, prop="imageinfo", iiprop="url")
    for p in d["query"]["pages"].values():
        if p.get("imageinfo"):
            return p["imageinfo"][0]["url"]
    return None


def slug(s):
    return re.sub(r"[^a-z0-9]+", "_", s.lower()).strip("_")


def download_icon(url, rel):
    """Downloads url to ROOT/rel unless it already exists. Returns rel or None."""
    if not url:
        return None
    if "wikia.nocookie.net" in url:  # fandom serves lossy webp to browsers unless asked for the original
        url += ("&" if "?" in url else "?") + "format=original"
    path = os.path.join(ROOT, rel)
    if not os.path.exists(path):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        try:
            parts = urllib.parse.urlsplit(url)
            data = http_get(url, binary=True, referer=f"{parts.scheme}://{parts.netloc}/")
        except Exception as e:  # noqa: BLE001
            print(f"  icon failed {url}: {e}")
            return None
        with open(path, "wb") as f:
            f.write(data)
    return rel.replace("\\", "/")


def save_b64_icon(b64, rel):
    import base64
    path = os.path.join(ROOT, rel)
    if not os.path.exists(path):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "wb") as f:
            f.write(base64.b64decode(b64))
    return rel


# ---------------------------------------------------------------- classification

def classify(cats, fallback=None):
    cl = [c.lower() for c in cats]
    has = lambda pred: any(pred(c) for c in cl)  # noqa: E731
    if has(lambda c: c in ("artifacts", "relics")):
        return "Artifacts"
    if has(lambda c: c in ("minerals", "gems", "foraged minerals", "geode minerals")):
        return "Minerals"
    if has(lambda c: c in ("cooking", "recipes") and c != "crafting"):
        return "Cooking"
    if has(lambda c: c == "artisan goods"):
        return "Artisan Goods"
    if has(lambda c: c == "animal products"):
        return "Animal Products"
    if has(lambda c: c == "fish" or c.endswith(" fish") or c == "legendary fish"):
        return "Fish"
    if has(lambda c: c.endswith(" fruit") or c in ("fruits", "fruit", "fruit tree fruit")):
        return "Fruit"
    if has(lambda c: c.endswith(" crops") or c in ("crops", "vegetables", "flowers")):
        return "Crops"
    if has(lambda c: c.endswith(" forage") or c in ("forage", "foraging", "mushrooms")):
        return "Forage"
    if has(lambda c: c == "monster loot"):
        return "Monster Loot"
    if has(lambda c: c in ("resources", "bars")):
        return "Resources"
    return fallback


# ---------------------------------------------------------------- vanilla

# Objects whose display name is shared with another object: id -> (name, wiki image file)
VANILLA_RENAME = {
    "180": ("Egg (Brown)", "Brown Egg.png"),
    "182": ("Large Egg (Brown)", "Large Brown Egg.png"),
    "DriedFruit": ("Dried Fruit", "Dried Fruit.png"),
    "DriedMushrooms": ("Dried Mushrooms", "Dried Mushrooms.png"),
    "SmokedFish": ("Smoked Fish", "Smoked Fish.png"),
    "126": ("Strange Doll (green)", "Strange Doll (green).png"),
    "127": ("Strange Doll (yellow)", "Strange Doll (yellow).png"),
}
VANILLA_WIKI_TITLE = {"438": "Large Goat Milk"}  # game name differs from the wiki page title
VANILLA_TYPES = {"Basic", "Fish", "Minerals", "Arch", "Cooking"}
TYPE_FALLBACK = {"Fish": "Fish", "Minerals": "Minerals", "Arch": "Artifacts", "Cooking": "Cooking"}
# Checked against a 100% perfection save: its fishCaught/basicShipped lists match these rules.
VANILLA_TYPE_OVERRIDE = {
    "152": "Fish",              # Seaweed counts toward the fish collection
    "433": "Crops",             # Coffee Bean (object type "Seeds")
    "344": "Artisan Goods",     # Jelly
    "438": "Animal Products",   # L. Goat Milk
    "814": "Other",             # Squid Ink
    "DriedFruit": "Artisan Goods", "DriedMushrooms": "Artisan Goods", "SmokedFish": "Artisan Goods",
}
VANILLA_NO_SHIP = {"247", "889", "928"}  # Oil, Qi Fruit, Golden Egg: not part of shipping perfection
VANILLA_SKIP_IDS = {"73", "166", "275", "858", "MysteryBox", "GoldenMysteryBox",  # walnut, chests, troves
                    "167", "168", "169", "170", "171", "172"}  # trash


def build_vanilla(objects):
    print("vanilla: classifying", len(objects), "objects")
    cands = [o for o in objects
             if (o["objectType"] in VANILLA_TYPES or o["id"] in VANILLA_TYPE_OVERRIDE) and o["id"] not in VANILLA_SKIP_IDS]
    names = {o["id"]: VANILLA_RENAME.get(o["id"], (o["names"]["data-en-US"], None))[0] for o in cands}
    # Wiki page to look up: renamed items use their image's name ("Brown Egg"), which redirects to the right page.
    titles = {i: VANILLA_WIKI_TITLE.get(i) or (VANILLA_RENAME[i][1][:-4] if i in VANILLA_RENAME else n)
              for i, n in names.items()}
    info = page_info(VANILLA_API, list(titles.values()))
    items, skipped = [], []
    for o in cands:
        oid, name = o["id"], names[o["id"]]
        img_file = VANILLA_RENAME.get(oid, (name, None))[1]
        pi = info.get(titles[oid]) or {"cats": [], "image": None}
        typ = VANILLA_TYPE_OVERRIDE.get(oid) or classify(pi["cats"], TYPE_FALLBACK.get(o["objectType"]))
        if not typ:
            skipped.append(name)
            continue
        url = file_url(VANILLA_API, img_file) if img_file else pi["image"]
        icon = download_icon(url, f"icons/vanilla/{slug(oid)}.png") or \
            save_b64_icon(o["image"], f"icons/vanilla/{slug(oid)}.png")
        item = make_item("vanilla", oid, name, typ, icon, wiki_url(VANILLA_API, pi.get("title")))
        if oid in VANILLA_NO_SHIP:
            item["ship"] = 0
        if oid == "814":
            item["ship"] = 1
        items.append(item)
    print(f"vanilla: {len(items)} items, skipped {len(skipped)} unclassified")
    return items, skipped


WIKI_PAGE_PREFIX = {
    VANILLA_API: "https://stardewvalleywiki.com/",
    SVE_API: "https://stardew-valley-expanded.fandom.com/wiki/",
    RSV_API: "https://ridgesidevillage.wiki.gg/wiki/",
}


def wiki_url(base, title):
    """Article URL for a page title returned by the API (so it's known to exist), else None."""
    if not title:
        return None
    return WIKI_PAGE_PREFIX[base] + urllib.parse.quote(title.replace(" ", "_"), safe="_()'!,:")


def make_item(source, oid, name, typ, icon, wiki=None):
    item = {
        "k": f"{source}:{oid or slug(name)}",
        "id": oid,
        "n": name,
        "t": typ,
        "s": source,
        "i": icon,
        "q": 1 if typ in QUALITY_TYPES else 0,
        "ship": 1 if typ in SHIP_TYPES else 0,
    }
    if wiki:
        item["w"] = wiki
    return item


# ---------------------------------------------------------------- mods

MOD_CATEGORIES = {
    "sve": (SVE_API, {
        "Crops": "Crops", "Fish": "Fish", "Forage": "Forage", "Cooking": "Cooking",
        "Artisan goods": "Artisan Goods", "Monster Loot": "Monster Loot",
    }),
    "rsv": (RSV_API, {
        "Crops": "Crops", "Fruit": "Fruit", "Fish": "Fish", "Foraging": "Forage",
        "Cooking": "Cooking", "Relics": "Artifacts",
    }),
}
MOD_SKIP = {
    "sve": {"Butter", "Ornate Treasure Chest", "Rusty Blade", "Monster Fruit", "Monster Mushroom"},
    "rsv": {"Fruits"},
}


def build_mod(source, vanilla_names):
    base, cats = MOD_CATEGORIES[source]
    typed = {}
    for cat, typ in cats.items():
        for t in category_members(base, cat):
            if t in cats or t in MOD_SKIP[source] or t in vanilla_names or t.endswith(" Tree"):
                continue
            typed.setdefault(t, typ)
    info = page_info(base, list(typed))
    items = []
    for name, typ in sorted(typed.items()):
        pi = info.get(name, {})
        # "<Name>.png" is the item sprite; the page's lead image is sometimes a fish pond or scene.
        url = file_url(base, name + ".png") or pi.get("image")
        icon = download_icon(url, f"icons/{source}/{slug(name)}.png")
        items.append(make_item(source, "", name, typ, icon, wiki_url(base, pi.get("title"))))
    print(f"{source}: {len(items)} items")
    return items


# ---------------------------------------------------------------- NPCs

VANILLA_NPCS = [
    "Abigail", "Alex", "Caroline", "Clint", "Demetrius", "Dwarf", "Elliott", "Emily", "Evelyn",
    "George", "Gus", "Haley", "Harvey", "Jas", "Jodi", "Kent", "Krobus", "Leah", "Leo", "Lewis",
    "Linus", "Marnie", "Maru", "Pam", "Penny", "Pierre", "Robin", "Sam", "Sandy", "Sebastian",
    "Shane", "Vincent", "Willy", "Wizard",
]
VANILLA_MARRY = {"Abigail", "Alex", "Elliott", "Emily", "Haley", "Harvey", "Leah", "Maru",
                 "Penny", "Sam", "Sebastian", "Shane"}
MOD_NPC_CATS = {
    "sve": (SVE_API, "Marriage candidates", "Non-Marriage candidates"),
    "rsv": (RSV_API, "Marriage candidates", "Non-Marriageable"),
}


def npc_icon(base, source, name, page_image):
    # Prefer the small "<Name> Icon.png" head sprite, fall back to the page's main image.
    url = file_url(base, f"{name} Icon.png") or page_image
    return download_icon(url, f"icons/{source}/npc_{slug(name)}.png")


def build_npcs():
    npcs = []
    info = page_info(VANILLA_API, VANILLA_NPCS)
    for n in VANILLA_NPCS:
        icon = npc_icon(VANILLA_API, "vanilla", n, info.get(n, {}).get("image"))
        npcs.append({"n": n, "s": "vanilla", "i": icon, "m": 1 if n in VANILLA_MARRY else 0})
    for source, (base, marry_cat, other_cat) in MOD_NPC_CATS.items():
        marry = category_members(base, marry_cat, 0)
        other = category_members(base, other_cat, 0)
        info = page_info(base, marry + other)
        for n in marry + other:
            if n in VANILLA_NPCS:
                continue
            icon = npc_icon(base, source, n, info.get(n, {}).get("image"))
            npcs.append({"n": n, "s": source, "i": icon, "m": 1 if n in marry else 0})
    print(f"npcs: {len(npcs)}")
    return npcs


# ---------------------------------------------------------------- main

def write_js(rel, var, data):
    path = os.path.join(ROOT, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(f"// Generated by tools/build_data.py - do not edit by hand.\nwindow.{var} = ")
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
        f.write(";\n")


def main():
    os.makedirs(CACHE, exist_ok=True)
    ids_path = os.path.join(CACHE, "vanilla_objects.json")
    if REFRESH or not os.path.exists(ids_path):
        with open(ids_path, "w", encoding="utf-8") as f:
            f.write(http_get(VANILLA_IDS))
    with open(ids_path, encoding="utf-8") as f:
        objects = json.load(f)

    vanilla, skipped = build_vanilla(objects)
    vnames = {i["n"] for i in vanilla}
    items = vanilla + build_mod("sve", vnames) + build_mod("rsv", vnames)
    write_js("data/items.js", "ITEMS", items)

    # Every vanilla object's name + sprite, for bundle ingredients / save IDs not in the catalog.
    names = {o["id"]: o["names"]["data-en-US"] for o in objects}
    write_js("data/objects.js", "OBJECT_NAMES", names)
    for o in objects:
        save_b64_icon(o["image"], f"icons/objects/{slug(o['id'])}.png")

    write_js("data/npcs.js", "NPCS", build_npcs())
    print("unclassified vanilla objects (not tracked):", ", ".join(skipped))


if __name__ == "__main__":
    main()
