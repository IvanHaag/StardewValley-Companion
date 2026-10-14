// Perfection tracker rules (Stardew Valley 1.6, Utility.percentGameComplete).
window.PERFECTION = {
  weights: {
    shipped: 15, obelisks: 4, goldClock: 10, monsters: 10, friends: 11,
    level: 5, stardrops: 10, cooking: 10, crafting: 10, fish: 10, walnuts: 5,
  },
  // Vanilla totals; mods can raise these (editable in the Perfection tab).
  totals: { cooking: 81, crafting: 149, walnuts: 130, level: 25 },
  obelisks: ["Earth Obelisk", "Water Obelisk", "Desert Obelisk", "Island Obelisk"],
  stardrops: [
    { flag: "CF_Fair", label: "Stardew Valley Fair (2,000 star tokens)" },
    { flag: "CF_Fish", label: "Master Angler (Willy's mail)" },
    { flag: "CF_Mines", label: "Mines floor 100 chest" },
    { flag: "CF_Sewer", label: "Krobus (20,000g)" },
    { flag: "museumComplete", label: "Museum: 95 donations" },
    { flag: "CF_Spouse", label: "Spouse / roommate at 13.5 hearts" },
    { flag: "CF_Statue", label: "Old Master Cannoli (Secret Woods)" },
  ],
  // Adventurer's Guild eradication goals and which specificMonstersKilled names count.
  monsterGoals: [
    { name: "Slimes", goal: 1000, monsters: ["Green Slime", "Frost Jelly", "Sludge", "Tiger Slime"] },
    { name: "Void Spirits", goal: 150, monsters: ["Shadow Guy", "Shadow Shaman", "Shadow Brute", "Shadow Sniper"] },
    { name: "Bats", goal: 200, monsters: ["Bat", "Frost Bat", "Lava Bat", "Iridium Bat"] },
    { name: "Skeletons", goal: 50, monsters: ["Skeleton", "Skeleton Mage"] },
    { name: "Cave Insects", goal: 125, monsters: ["Bug", "Fly", "Grub", "Mutant Fly", "Mutant Grub"] },
    { name: "Duggies", goal: 30, monsters: ["Duggy", "Magma Duggy"] },
    { name: "Dust Sprites", goal: 500, monsters: ["Dust Spirit"] },
    { name: "Rock Crabs", goal: 60, monsters: ["Rock Crab", "Lava Crab", "Iridium Crab"] },
    { name: "Mummies", goal: 100, monsters: ["Mummy"] },
    { name: "Pepper Rex", goal: 50, monsters: ["Pepper Rex"] },
    { name: "Serpents", goal: 250, monsters: ["Serpent", "Royal Serpent"] },
    { name: "Magma Sprites", goal: 150, monsters: ["Magma Sprite", "Magma Sparker"] },
  ],
};
