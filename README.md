# Stardew Helper

A personal tracker for Stardew Valley 1.6, for vanilla and the Mega Expanded Stardew modpack. It tracks:

- **Items**: every crop, fruit, forage item, fish, animal product, artisan good, mineral, artifact, dish and monster loot drop, with the best quality you've had each one at. Items you're missing show as black silhouettes.
- **Bundles**: Community Center bundles, including ingredients you already own at the required quality.
- **Relationships**: hearts and status for every villager. Click a villager to open their page, where you record the gift reactions you discover (loves, likes, neutral, dislikes, hates) and keep notes. It starts empty on purpose, for blind runs. Gift tastes are shared by all farm profiles, since they're the same in every save.
- **Perfection**: all 11 categories of the in-game perfection tracker.
- **Planting**: a calendar for each season that marks the last day you can plant each crop and still harvest it before the season changes and the crop dies. It accounts for Speed-Gro fertilizers, Agriculturist and paddy crops next to water. Load Save highlights today's date and sets Agriculturist from your professions.

## Use it
Open `index.html` in a browser. There's nothing to install and no server.

- **Items**: click an icon to raise its quality (Normal → Silver → Gold → Iridium → cleared). Right-click to lower it.
- **Load Save** reads a save file and fills in bundles, hearts, perfection stats and the items in your collections tab. Saves are in
  `%AppData%\StardewValley\Saves\<Farm_123456789>\<Farm_123456789>`. Pick the file without an extension, not `SaveGameInfo`.
  A save doesn't record item quality, so quality is only raised, never lowered.
- **Farm profiles**: each farm has its own progress. Loading a save switches to (or creates) that farm's profile.
- **Source chips** (Vanilla / SVE / Ridgeside / Custom): choose which content is in that farm's game. They're detected automatically on Load Save.
- **+ Custom item**: add items from other mods in the pack (Sunberry, East Scarp, and so on), with an icon URL or an image file.

Progress lives in the browser's localStorage. Use **Export** now and then to back it up as JSON, and **Import** to restore it or move it to another browser.

## Rebuilding the data
`data/items.js`, `data/npcs.js`, `data/objects.js` and `icons/` are generated from the wikis:

```
python tools/build_data.py            # uses cached wiki responses in tools/.cache
python tools/build_data.py --refresh  # re-queries the wikis
```

Sources:
- [Stardew Valley Wiki](https://stardewvalleywiki.com)
- [SVE wiki](https://stardew-valley-expanded.fandom.com)
- [Ridgeside wiki](https://ridgesidevillage.wiki.gg)
- Vanilla item IDs: [MateusAquino/stardewids](https://github.com/MateusAquino/stardewids)

`data/bundles.js` (the standard bundle layout), `data/perfection.js` (perfection weights and goals) and `data/crops.js` (vanilla crop growth phases) are written by hand.
