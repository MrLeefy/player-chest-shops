// src/import.ts
import { world as world5, system as system4 } from "@minecraft/server";

// src/config.ts
var config = {
  currency: "money",
  currencyType: "scoreboard",
  // Can be 'scoreboard' or 'item'
  currencySymbol: "$",
  shopLimit: 500,
  adminTag: "admin",
  signConfig: [
    "[shop]"
  ],
  containers: [
    "minecraft:chest",
    "minecraft:barrel",
    "minecraft:black_shulker_box",
    "minecraft:blue_shulker_box",
    "minecraft:brown_shulker_box",
    "minecraft:cyan_shulker_box",
    "minecraft:gray_shulker_box",
    "minecraft:green_shulker_box",
    "minecraft:light_blue_shulker_box",
    "minecraft:light_gray_shulker_box",
    "minecraft:lime_shulker_box",
    "minecraft:magenta_shulker_box",
    "minecraft:orange_shulker_box",
    "minecraft:pink_shulker_box",
    "minecraft:purple_shulker_box",
    "minecraft:red_shulker_box",
    "minecraft:white_shulker_box",
    "minecraft:yellow_shulker_box"
  ]
};
var config_default = config;

// src/database.ts
import { world } from "@minecraft/server";
var MAX_PROPERTY_SIZE = 32e3;
var DynamicPropertyDatabase = class {
  #prefix;
  #indexId;
  #indexCache = null;
  constructor(name) {
    if (!name || typeof name !== "string") {
      throw new Error("Database name must be a non-empty string.");
    }
    this.#prefix = `db:${name}:`;
    this.#indexId = `${this.#prefix}__index__`;
  }
  #getIndex() {
    if (this.#indexCache) {
      return this.#indexCache;
    }
    try {
      const rawIndex = world.getDynamicProperty(this.#indexId);
      this.#indexCache = typeof rawIndex === "string" ? JSON.parse(rawIndex) : {};
      return this.#indexCache || {};
    } catch (e) {
      return {};
    }
  }
  #setIndex(index) {
    this.#indexCache = index;
    world.setDynamicProperty(this.#indexId, JSON.stringify(index));
  }
  #clearProperties(key) {
    const index = this.#getIndex();
    const propIds = index[key];
    if (!propIds)
      return;
    if (Array.isArray(propIds)) {
      for (const chunkId of propIds) {
        world.setDynamicProperty(chunkId, void 0);
      }
    } else if (typeof propIds === "string") {
      world.setDynamicProperty(propIds, void 0);
    }
  }
  set(key, value) {
    const index = this.#getIndex();
    const oldPropIds = index[key];
    const serializedValue = JSON.stringify(value);
    if (serializedValue.length > MAX_PROPERTY_SIZE) {
      const chunks = [];
      const propIds = [];
      for (let i = 0; i < serializedValue.length; i += MAX_PROPERTY_SIZE) {
        chunks.push(serializedValue.substring(i, i + MAX_PROPERTY_SIZE));
      }
      chunks.forEach((chunk, i) => {
        const chunkId = `${this.#prefix}${key}_chunk_${i}`;
        world.setDynamicProperty(chunkId, chunk);
        propIds.push(chunkId);
      });
      index[key] = propIds;
    } else {
      const propId = `${this.#prefix}${key}`;
      world.setDynamicProperty(propId, serializedValue);
      index[key] = propId;
    }
    if (oldPropIds) {
      if (Array.isArray(oldPropIds)) {
        for (const chunkId of oldPropIds) {
          const isReused = Array.isArray(index[key]) ? index[key].includes(chunkId) : index[key] === chunkId;
          if (!isReused) {
            world.setDynamicProperty(chunkId, void 0);
          }
        }
      } else if (typeof oldPropIds === "string" && index[key] !== oldPropIds) {
        world.setDynamicProperty(oldPropIds, void 0);
      }
    }
    this.#setIndex(index);
    return this;
  }
  get(key) {
    const index = this.#getIndex();
    const propIds = index[key];
    if (!propIds) {
      return void 0;
    }
    try {
      if (Array.isArray(propIds)) {
        const chunks = propIds.map((chunkId) => world.getDynamicProperty(chunkId));
        return JSON.parse(chunks.join(""));
      } else if (typeof propIds === "string") {
        const rawVal = world.getDynamicProperty(propIds);
        return typeof rawVal === "string" ? JSON.parse(rawVal) : void 0;
      }
    } catch (e) {
      console.warn(`[Database] Failed to get or parse value for key "${key}":`, e);
      return void 0;
    }
  }
  delete(key) {
    const index = this.#getIndex();
    if (!index.hasOwnProperty(key)) {
      return false;
    }
    this.#clearProperties(key);
    delete index[key];
    this.#setIndex(index);
    return true;
  }
  has(key) {
    const index = this.#getIndex();
    return index.hasOwnProperty(key);
  }
  clear() {
    const index = this.#getIndex();
    for (const key in index) {
      this.#clearProperties(key);
    }
    this.#setIndex({});
  }
  keys() {
    return Object.keys(this.#getIndex());
  }
  values() {
    return this.keys().map((key) => this.get(key));
  }
  entries() {
    return this.keys().map((key) => [key, this.get(key)]);
  }
  forEach(callback) {
    for (const [key, value] of this.entries()) {
      callback(value, key);
    }
  }
};
var Database = class {
  #onSetCallback = [];
  Database;
  constructor(name) {
    this.Database = new DynamicPropertyDatabase(name);
  }
  get length() {
    return this.Database.keys().length;
  }
  get(key) {
    return this.Database.get(key);
  }
  set(key, value) {
    this.#onSetCallback.forEach((callback) => callback({ key, value }));
    return this.Database.set(key, value);
  }
  has(key) {
    return this.Database.has(key);
  }
  delete(key) {
    return this.Database.delete(key);
  }
  clear() {
    this.Database.clear();
  }
  keys() {
    return this.Database.keys();
  }
  values() {
    return this.Database.values();
  }
  entries() {
    return this.Database.entries();
  }
  forEach(callback) {
    this.Database.forEach((value, key) => callback(value, key));
  }
  onSet = {
    subscribe: (callback) => {
      this.#onSetCallback.push(callback);
      return { callback };
    },
    unsubscribe: (listener) => {
      const index = this.#onSetCallback.indexOf(listener.callback);
      if (index !== -1) {
        this.#onSetCallback.splice(index, 1);
      }
    }
  };
};

// src/utility.ts
import { world as world2, system, Player } from "@minecraft/server";
function getScore(participant, objectiveId) {
  try {
    const objective = world2.scoreboard.getObjective(objectiveId);
    if (!objective)
      return 0;
    return objective.getScore(participant) ?? 0;
  } catch {
    return 0;
  }
}
function setScore(participant, objectiveId, score) {
  try {
    const objective = world2.scoreboard.getObjective(objectiveId);
    if (!objective)
      return;
    objective.setScore(participant, score);
  } catch (err) {
    try {
      if (participant instanceof Player) {
        participant.runCommand(`scoreboard players set @s ${objectiveId} ${score}`);
      } else if (typeof participant === "string") {
        world2.getDimension("overworld").runCommand(`scoreboard players set "${participant}" ${objectiveId} ${score}`);
      } else if (typeof participant.name === "string") {
        world2.getDimension("overworld").runCommand(`scoreboard players set "${participant.name}" ${objectiveId} ${score}`);
      }
    } catch (cmdErr) {
      console.warn(`[Shop Scoreboard] Failed to set score for ${objectiveId}: ${cmdErr}`);
    }
  }
}
function addScore(participant, objectiveId, score) {
  try {
    const objective = world2.scoreboard.getObjective(objectiveId);
    if (!objective)
      return;
    objective.addScore(participant, score);
  } catch (err) {
    try {
      if (participant instanceof Player) {
        participant.runCommand(`scoreboard players add @s ${objectiveId} ${score}`);
      } else if (typeof participant === "string") {
        world2.getDimension("overworld").runCommand(`scoreboard players add "${participant}" ${objectiveId} ${score}`);
      } else if (typeof participant.name === "string") {
        world2.getDimension("overworld").runCommand(`scoreboard players add "${participant.name}" ${objectiveId} ${score}`);
      }
    } catch (cmdErr) {
      console.warn(`[Shop Scoreboard] Failed to add score for ${objectiveId}: ${cmdErr}`);
    }
  }
}
function subtractScore(participant, objectiveId, score) {
  try {
    const objective = world2.scoreboard.getObjective(objectiveId);
    if (!objective)
      return;
    try {
      const previousScore = objective.getScore(participant) ?? 0;
      objective.setScore(participant, previousScore - score);
    } catch {
      if (participant instanceof Player) {
        participant.runCommand(`scoreboard players remove @s ${objectiveId} ${score}`);
      } else if (typeof participant === "string") {
        world2.getDimension("overworld").runCommand(`scoreboard players remove "${participant}" ${objectiveId} ${score}`);
      } else if (typeof participant.name === "string") {
        world2.getDimension("overworld").runCommand(`scoreboard players remove "${participant.name}" ${objectiveId} ${score}`);
      }
    }
  } catch (err) {
    console.warn(`[Shop Scoreboard] Failed to subtract score for ${objectiveId}: ${err}`);
  }
}
function resetScore(participant, objectiveId) {
  try {
    const objective = world2.scoreboard.getObjective(objectiveId);
    if (!objective)
      return;
    objective.removeParticipant(participant);
  } catch (err) {
    try {
      if (participant instanceof Player) {
        participant.runCommand(`scoreboard players reset @s ${objectiveId}`);
      } else if (typeof participant === "string") {
        world2.getDimension("overworld").runCommand(`scoreboard players reset "${participant}" ${objectiveId}`);
      } else if (typeof participant.name === "string") {
        world2.getDimension("overworld").runCommand(`scoreboard players reset "${participant.name}" ${objectiveId}`);
      }
    } catch (cmdErr) {
    }
  }
}
function setTimeout(callback, delayMs) {
  const ticks = Math.max(1, Math.round(delayMs / 50));
  return system.runTimeout(callback, ticks);
}
function iName(str) {
  if (!str)
    return "Unknown Item";
  const parts = str.split(":");
  let name = parts[1] || parts[0];
  name = name.replace(/_/g, " ");
  return name.replace(/\b\w/g, (txt) => txt.charAt(0).toUpperCase() + txt.substring(1).toLowerCase());
}
function encode(str) {
  return str.split("").map((char) => "\xA7" + char).join("");
}
function romanize(num) {
  if (num > 10)
    return "X";
  const romanNumerals = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
  return romanNumerals[num] || num.toString();
}
function displayFormat(input) {
  const words = input.split(/(?=[A-Z])/);
  return words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}

// src/item.ts
import { ItemStack } from "@minecraft/server";
var tippedArrowMapping = {
  "jump_boost": "Arrow of Leaping",
  "jump": "Arrow of Leaping",
  "slowness": "Arrow of Slowness",
  "swiftness": "Arrow of Swiftness",
  "speed": "Arrow of Swiftness",
  "instant_health": "Arrow of Healing",
  "healing": "Arrow of Healing",
  "instant_damage": "Arrow of Harming",
  "harming": "Arrow of Harming",
  "poison": "Arrow of Poison",
  "regeneration": "Arrow of Regeneration",
  "strength": "Arrow of Strength",
  "weakness": "Arrow of Weakness",
  "turtle_master": "Arrow of the Turtle Master",
  "water_breathing": "Arrow of Water Breathing",
  "invisibility": "Arrow of Invisibility",
  "night_vision": "Arrow of Night Vision",
  "fire_resistance": "Arrow of Fire Resistance",
  "slow_falling": "Arrow of Slow Falling"
};
function areItemsIdentical(item1, item2) {
  if (!item1 || !item2)
    return false;
  if (item1.typeId !== item2.typeId)
    return false;
  if ((item1.nameTag ?? "") !== (item2.nameTag ?? ""))
    return false;
  if (item1.typeId === "minecraft:arrow" || item1.typeId === "minecraft:potion" || item1.typeId === "minecraft:splash_potion" || item1.typeId === "minecraft:lingering_potion") {
    const locKey1 = item1.localizationKey ?? "";
    const locKey2 = item2.localizationKey ?? "";
    if (locKey1 !== locKey2)
      return false;
  }
  const lore1 = item1.getLore()?.join("\n") ?? "";
  const lore2 = item2.getLore()?.join("\n") ?? "";
  if (lore1 !== lore2)
    return false;
  const enchantComponent1 = item1.getComponent("enchantable");
  const enchantComponent2 = item2.getComponent("enchantable");
  const enchants1 = enchantComponent1?.getEnchantments() ?? [];
  const enchants2 = enchantComponent2?.getEnchantments() ?? [];
  if (enchants1.length !== enchants2.length)
    return false;
  for (const e1 of enchants1) {
    if (!enchants2.some((e2) => e2.type.id === e1.type.id && e2.level === e1.level)) {
      return false;
    }
  }
  return true;
}
function getPotionDisplayName(sellItem, forSign = false) {
  const locKey = sellItem.localizationKey;
  if (!locKey) {
    return sellItem.nameTag || iName(sellItem.typeId);
  }
  if (locKey.includes("potion.effect.")) {
    const effectName = locKey.replace("potion.effect.", "");
    const shortEffectNames = {
      "jump_boost": "Leaping",
      "slowness": "Slow",
      "swiftness": "Swift",
      "speed": "Swift",
      "instant_health": "Heal",
      "healing": "Heal",
      "instant_damage": "Harm",
      "harming": "Harm",
      "poison": "Poison",
      "regeneration": "Regen",
      "strength": "Strength",
      "weakness": "Weak",
      "turtle_master": "Turtle",
      "water_breathing": "W.Breath",
      "invisibility": "Invis",
      "night_vision": "N.Vision",
      "fire_resistance": "F.Resist",
      "slow_falling": "S.Fall"
    };
    const fullEffectNames = {
      "jump_boost": "Leaping",
      "slowness": "Slowness",
      "swiftness": "Swiftness",
      "speed": "Swiftness",
      "instant_health": "Healing",
      "healing": "Healing",
      "instant_damage": "Harming",
      "harming": "Harming",
      "poison": "Poison",
      "regeneration": "Regeneration",
      "strength": "Strength",
      "weakness": "Weakness",
      "turtle_master": "Turtle Master",
      "water_breathing": "Water Breathing",
      "invisibility": "Invisibility",
      "night_vision": "Night Vision",
      "fire_resistance": "Fire Resistance",
      "slow_falling": "Slow Falling"
    };
    const effectNames = forSign ? shortEffectNames : fullEffectNames;
    const properEffect = effectNames[effectName] || effectName.charAt(0).toUpperCase() + effectName.slice(1).replace(/_/g, " ");
    if (forSign) {
      if (sellItem.typeId === "minecraft:splash_potion") {
        return `SP ${properEffect}`;
      } else if (sellItem.typeId === "minecraft:lingering_potion") {
        return `LP ${properEffect}`;
      } else {
        return `P ${properEffect}`;
      }
    } else {
      if (sellItem.typeId === "minecraft:splash_potion") {
        return `Splash Potion of ${properEffect}`;
      } else if (sellItem.typeId === "minecraft:lingering_potion") {
        return `Lingering Potion of ${properEffect}`;
      } else {
        return `Potion of ${properEffect}`;
      }
    }
  }
  if (locKey.includes("%potion.") && locKey.includes(".name")) {
    const effectMatch = locKey.match(/%potion\.([^.]+)\./);
    if (effectMatch) {
      const effectName = effectMatch[1];
      const shortEffectNames = {
        "jump_boost": "Leaping",
        "slowness": "Slow",
        "swiftness": "Swift",
        "speed": "Swift",
        "instant_health": "Heal",
        "healing": "Heal",
        "instant_damage": "Harm",
        "harming": "Harm",
        "poison": "Poison",
        "regeneration": "Regen",
        "strength": "Strength",
        "weakness": "Weak",
        "turtle_master": "Turtle",
        "water_breathing": "W.Breath",
        "invisibility": "Invis",
        "night_vision": "N.Vision",
        "fire_resistance": "F.Resist",
        "slow_falling": "S.Fall"
      };
      const fullEffectNames = {
        "jump_boost": "Leaping",
        "slowness": "Slowness",
        "swiftness": "Swiftness",
        "speed": "Swiftness",
        "instant_health": "Healing",
        "healing": "Healing",
        "instant_damage": "Harming",
        "harming": "Harming",
        "poison": "Poison",
        "regeneration": "Regeneration",
        "strength": "Strength",
        "weakness": "Weakness",
        "turtle_master": "Turtle Master",
        "water_breathing": "Water Breathing",
        "invisibility": "Invisibility",
        "night_vision": "Night Vision",
        "fire_resistance": "Fire Resistance",
        "slow_falling": "Slow Falling"
      };
      const effectNames = forSign ? shortEffectNames : fullEffectNames;
      const properEffect = effectNames[effectName] || effectName.charAt(0).toUpperCase() + effectName.slice(1).replace(/_/g, " ");
      if (forSign) {
        if (sellItem.typeId === "minecraft:splash_potion") {
          return `SP ${properEffect}`;
        } else if (sellItem.typeId === "minecraft:lingering_potion") {
          return `LP ${properEffect}`;
        } else {
          return `P ${properEffect}`;
        }
      } else {
        if (sellItem.typeId === "minecraft:splash_potion") {
          return `Splash Potion of ${properEffect}`;
        } else if (sellItem.typeId === "minecraft:lingering_potion") {
          return `Lingering Potion of ${properEffect}`;
        } else {
          return `Potion of ${properEffect}`;
        }
      }
    }
  }
  if (locKey === "potion.water") {
    if (forSign) {
      if (sellItem.typeId === "minecraft:potion") {
        return "Water Bottle";
      } else if (sellItem.typeId === "minecraft:splash_potion") {
        return "SW Water";
      } else if (sellItem.typeId === "minecraft:lingering_potion") {
        return "LW Water";
      }
    } else {
      if (sellItem.typeId === "minecraft:potion") {
        return "Water Bottle";
      } else if (sellItem.typeId === "minecraft:splash_potion") {
        return "Splash Water Bottle";
      } else if (sellItem.typeId === "minecraft:lingering_potion") {
        return "Lingering Water Bottle";
      }
    }
  }
  if (locKey === "potion.awkward") {
    if (forSign) {
      if (sellItem.typeId === "minecraft:splash_potion") {
        return "SA Awkward";
      } else if (sellItem.typeId === "minecraft:lingering_potion") {
        return "LA Awkward";
      } else {
        return "Awkward Potion";
      }
    } else {
      if (sellItem.typeId === "minecraft:splash_potion") {
        return "Splash Awkward Potion";
      } else if (sellItem.typeId === "minecraft:lingering_potion") {
        return "Lingering Awkward Potion";
      } else {
        return "Awkward Potion";
      }
    }
  }
  if (locKey === "potion.thick") {
    if (sellItem.typeId === "minecraft:splash_potion") {
      return "S.Thick";
    } else if (sellItem.typeId === "minecraft:lingering_potion") {
      return "L.Thick";
    } else {
      return "Thick Potion";
    }
  }
  if (locKey === "potion.mundane") {
    if (sellItem.typeId === "minecraft:splash_potion") {
      return "S.Mundane";
    } else if (sellItem.typeId === "minecraft:lingering_potion") {
      return "L.Mundane";
    } else {
      return "Mundane Potion";
    }
  }
  if (locKey.includes("potion.")) {
    const potionType = locKey.replace("potion.", "");
    const capitalizedType = potionType.charAt(0).toUpperCase() + potionType.slice(1).replace(/_/g, " ");
    if (sellItem.typeId === "minecraft:splash_potion") {
      return `S.${capitalizedType}`;
    } else if (sellItem.typeId === "minecraft:lingering_potion") {
      return `L.${capitalizedType}`;
    } else {
      return `P.${capitalizedType}`;
    }
  }
  return sellItem.nameTag || iName(sellItem.typeId);
}
function processItems(container) {
  let sellItem = void 0;
  let totalAmount = 0;
  for (let i = 0; i < container.size; i++) {
    const item = container.getItem(i);
    if (item && item.typeId !== "je:chest_lock_2") {
      sellItem = item;
      break;
    }
  }
  if (!sellItem) {
    return { error: "SHOP EMPTY" };
  }
  for (let i = 0; i < container.size; i++) {
    const item = container.getItem(i);
    if (areItemsIdentical(sellItem, item) && item) {
      totalAmount += item.amount;
    }
  }
  const enchantComponent = sellItem.getComponent("enchantable");
  const enchants = {};
  const enchantments = enchantComponent?.getEnchantments() ?? [];
  for (const ench of enchantments) {
    enchants[ench.type.id] = ench.level;
  }
  let itemName = "";
  const sellLocKey = sellItem.localizationKey;
  if (sellItem.typeId === "minecraft:arrow") {
    if (sellLocKey && sellLocKey.includes("tipped_arrow.effect.")) {
      const effectName = sellLocKey.replace("tipped_arrow.effect.", "");
      const mappedName = tippedArrowMapping[effectName];
      if (mappedName) {
        itemName = mappedName;
      } else {
        itemName = `Arrow of ${effectName.charAt(0).toUpperCase() + effectName.slice(1).replace(/_/g, " ")}`;
      }
    } else if (sellItem.nameTag) {
      itemName = sellItem.nameTag;
    } else {
      itemName = iName(sellItem.typeId);
    }
  } else if (sellItem.typeId === "minecraft:potion" || sellItem.typeId === "minecraft:splash_potion" || sellItem.typeId === "minecraft:lingering_potion") {
    itemName = getPotionDisplayName(sellItem, false);
  } else {
    itemName = sellItem.nameTag || iName(sellItem.typeId);
  }
  return {
    itemAmount: totalAmount,
    itemName,
    enchants,
    sell: sellItem,
    hasNametag: !!sellItem.nameTag,
    error: null
  };
}
function uContainer(objContainer, amount) {
  const newCont = { ...objContainer };
  let remaining = amount;
  for (const slotStr in newCont) {
    const slot = parseInt(slotStr);
    if (remaining <= 0)
      break;
    const available = newCont[slot];
    const toTake = Math.min(available, remaining);
    newCont[slot] -= toTake;
    remaining -= toTake;
  }
  return [newCont, remaining];
}
function createItemStacks(typeId, amount) {
  const stacks = [];
  let remaining = amount;
  let maxStackSize = 64;
  try {
    const tempItem = new ItemStack(typeId, 1);
    maxStackSize = tempItem.maxAmount;
  } catch (e) {
    console.warn(`Failed to determine max stack size for ${typeId}: ${e}`);
  }
  while (remaining > 0) {
    const currentAmount = Math.min(remaining, maxStackSize);
    stacks.push(new ItemStack(typeId, currentAmount));
    remaining -= currentAmount;
  }
  return stacks;
}

// src/protection.ts
import { world as world3, system as system2, Player as Player2, ItemStack as ItemStack2 } from "@minecraft/server";
var protectedBlockTypes = new Set(config_default.containers);
world3.afterEvents.playerPlaceBlock.subscribe((event) => {
  const { player, block } = event;
  if (block.typeId !== "minecraft:hopper")
    return;
  const directions = [
    { x: 0, y: 1, z: 0 },
    { x: 0, y: -1, z: 0 },
    { x: 1, y: 0, z: 0 },
    { x: -1, y: 0, z: 0 },
    { x: 0, y: 0, z: 1 },
    { x: 0, y: 0, z: -1 }
  ];
  const dim = block.dimension;
  for (const offset of directions) {
    const checkPos = {
      x: block.location.x + offset.x,
      y: block.location.y + offset.y,
      z: block.location.z + offset.z
    };
    if (checkPos.y < -64 || checkPos.y >= 320)
      continue;
    try {
      const adjacentBlock = dim.getBlock(checkPos);
      if (adjacentBlock && protectedBlockTypes.has(adjacentBlock.typeId)) {
        const inventory = adjacentBlock.getComponent("inventory");
        if (inventory && inventory.container) {
          for (let i = 0; i < inventory.container.size; i++) {
            const item = inventory.container.getItem(i);
            if (item?.typeId === "je:chest_lock_2") {
              const lore = item.getLore();
              const ownerName = lore[0]?.substring(2);
              if (ownerName && ownerName !== player.name && !player.hasTag(config_default.adminTag)) {
                block.setType("minecraft:air");
                system2.runTimeout(() => {
                  player.playSound("note.bass");
                  player.sendMessage(`\xA7cYou cannot place hoppers adjacent to \xA7e${ownerName}'s \xA7clocked shop chest.`);
                  const playerInvComp = player.getComponent("inventory");
                  if (playerInvComp && playerInvComp.container) {
                    playerInvComp.container.addItem(new ItemStack2("minecraft:hopper", 1));
                  }
                }, 1);
                return;
              }
            }
          }
        }
      }
    } catch (e) {
    }
  }
});
world3.beforeEvents.explosion.subscribe((e) => {
  const impacted = e.getImpactedBlocks();
  const newImpacted = [];
  let modified = false;
  for (const block of impacted) {
    try {
      if (block && protectedBlockTypes.has(block.typeId)) {
        const inventory = block.getComponent("inventory");
        let isLocked = false;
        if (inventory && inventory.container) {
          for (let i = 0; i < inventory.container.size; i++) {
            const item = inventory.container.getItem(i);
            if (item?.typeId === "je:chest_lock_2") {
              isLocked = true;
              break;
            }
          }
        }
        if (isLocked) {
          modified = true;
          continue;
        }
      }
    } catch (err) {
    }
    newImpacted.push(block);
  }
  if (modified) {
    e.setImpactedBlocks(newImpacted);
  }
});
if ("pistonActivate" in world3.beforeEvents) {
  world3.beforeEvents.pistonActivate.subscribe((e) => {
    const pistonComp = e.piston.getComponent("piston");
    if (!pistonComp)
      return;
    try {
      const attachedBlocks = pistonComp.getAttachedBlocks();
      for (const blockLoc of attachedBlocks) {
        const block = e.dimension.getBlock(blockLoc);
        if (block) {
          if (protectedBlockTypes.has(block.typeId)) {
            const inventory = block.getComponent("inventory");
            if (inventory && inventory.container) {
              for (let i = 0; i < inventory.container.size; i++) {
                const item = inventory.container.getItem(i);
                if (item?.typeId === "je:chest_lock_2") {
                  e.cancel = true;
                  return;
                }
              }
            }
          }
          if (block.typeId.endsWith("sign")) {
            const signComp = block.getComponent("sign");
            const text = signComp?.getText();
            if (text && text.includes("||")) {
              e.cancel = true;
              return;
            }
          }
          const directions = [
            { x: 0, y: 1, z: 0 },
            { x: 0, y: -1, z: 0 },
            { x: 1, y: 0, z: 0 },
            { x: -1, y: 0, z: 0 },
            { x: 0, y: 0, z: 1 },
            { x: 0, y: 0, z: -1 }
          ];
          for (const offset of directions) {
            try {
              const adjBlock = e.dimension.getBlock({ x: blockLoc.x + offset.x, y: blockLoc.y + offset.y, z: blockLoc.z + offset.z });
              if (adjBlock && adjBlock.typeId.endsWith("sign")) {
                const signComp = adjBlock.getComponent("sign");
                const text = signComp?.getText();
                if (text && text.includes("||")) {
                  e.cancel = true;
                  return;
                }
              }
            } catch {
            }
          }
        }
      }
    } catch (err) {
    }
  });
}
world3.beforeEvents.playerBreakBlock.subscribe((a) => {
  if (!(a.player instanceof Player2))
    return;
  const { player, block } = a;
  const location = block.location;
  if (block.typeId?.endsWith("sign")) {
    const signComponent = block.getComponent("sign");
    const text = signComponent?.getText();
    if (text) {
      const lines = text.split("\n");
      if (lines[0] && lines[0].includes("||")) {
        const ownerName = lines[0].substring(lines[0].indexOf(`|`) + 1).replace(/[|]/g, "").trim();
        const isShopSign = text.includes(config_default.currencySymbol) || config_default.currencyType === "item" && text.includes(iName(config_default.currency));
        if (isShopSign) {
          if (player.name !== ownerName && !player.hasTag(config_default.adminTag)) {
            a.cancel = true;
            system2.runTimeout(() => {
              player.onScreenDisplay.setActionBar("\xA7cYou can't break this sign.\n\xA7eInteract to refresh shop");
            }, 1);
          } else {
            try {
              const currentCount = getScore(ownerName, "signC");
              if (currentCount > 0) {
                setScore(ownerName, "signC", currentCount - 1);
              }
              player.sendMessage("\uE200 \xA7aShop sign broken and shop count slot cleared.\xA7r");
            } catch (e) {
              console.warn(`Failed to decrement shop count for ${ownerName}: ${e}`);
            }
          }
        }
      }
    }
    return;
  }
  if (block.getComponent("inventory") && protectedBlockTypes.has(block.typeId)) {
    const inventory = block.getComponent("inventory");
    if (inventory && inventory.container) {
      const container = inventory.container;
      for (let i = 0; i < container.size; i++) {
        const item = container.getItem(i);
        if (item?.typeId === "je:chest_lock_2") {
          const lore = item.getLore();
          const ownerName = lore?.[0]?.substring(2);
          if (ownerName && player.name !== ownerName && !player.hasTag(config_default.adminTag)) {
            a.cancel = true;
            system2.runTimeout(() => {
              player.playSound("note.bass");
              player.onScreenDisplay.setActionBar(`\xA7cThis chest is protected by \xA7e${ownerName}`);
            }, 1);
            return;
          }
        }
      }
    }
  }
  const blockAbove = world3.getDimension(a.player.dimension.id).getBlock({ x: location.x, y: location.y + 1, z: location.z });
  if (blockAbove && protectedBlockTypes.has(blockAbove.typeId)) {
    const chestInventory = blockAbove.getComponent("inventory");
    if (chestInventory && chestInventory.container) {
      for (let i = 0; i < chestInventory.container.size; i++) {
        const item = chestInventory.container.getItem(i);
        if (item?.typeId === "je:chest_lock_2") {
          const lore = item.getLore();
          const ownerName = lore?.[0]?.substring(2);
          if (ownerName && a.player.name !== ownerName && !a.player.hasTag(config_default.adminTag)) {
            a.cancel = true;
            system2.runTimeout(() => {
              a.player.playSound("note.bass");
              a.player.onScreenDisplay.setActionBar(`\xA7cThis area is protected by \xA7e${ownerName}`);
            }, 1);
            return;
          }
        }
      }
    }
  }
  const coords = [
    { x: location.x + 1, y: location.y, z: location.z },
    { x: location.x, y: location.y + 1, z: location.z },
    { x: location.x, y: location.y, z: location.z + 1 },
    { x: location.x - 1, y: location.y, z: location.z },
    { x: location.x, y: location.y - 1, z: location.z },
    { x: location.x, y: location.y, z: location.z - 1 }
  ];
  const dim = world3.getDimension(a.player.dimension.id);
  for (const coord of coords) {
    try {
      const adjacentBlock = dim.getBlock(coord);
      if (adjacentBlock && adjacentBlock.typeId.endsWith("sign")) {
        const signComponent = adjacentBlock.getComponent("sign");
        const text = signComponent?.getText();
        if (text && text.includes("||")) {
          const firstLine = text.split("\n")[0];
          const owner = firstLine.substring(firstLine.indexOf(`|`)).replace(/[|]/g, "").trim();
          const isShopSign = text.includes(config_default.currencySymbol) || config_default.currencyType === "item" && text.includes(iName(config_default.currency));
          if (isShopSign && owner !== a.player.name && !a.player.hasTag(config_default.adminTag)) {
            a.cancel = true;
            system2.runTimeout(() => {
              a.player.playSound("note.bass");
              a.player.onScreenDisplay.setActionBar(`\xA7cThis block is protected by \xA77${owner}`);
            }, 1);
            break;
          }
        }
      }
    } catch (e) {
    }
  }
});
world3.beforeEvents.playerInteractWithBlock.subscribe((t) => {
  if (!(t.player instanceof Player2))
    return;
  const player = t.player;
  const block = t.block;
  if (player.hasTag("binding"))
    return;
  if (block.getComponent("inventory") && protectedBlockTypes.has(block.typeId)) {
    const inventory = block.getComponent("inventory");
    if (inventory && inventory.container) {
      const container = inventory.container;
      for (let i = 0; i < container.size; i++) {
        const item = container.getItem(i);
        if (item?.typeId === "je:chest_lock_2") {
          const lore = item.getLore();
          const ownerName = lore?.[0]?.substring(2);
          if (ownerName && player.name !== ownerName && !player.hasTag(config_default.adminTag)) {
            t.cancel = true;
            system2.runTimeout(() => {
              player.playSound("note.bass");
              player.onScreenDisplay.setActionBar(`\xA7e${ownerName} \xA7clocked this chest.`);
            }, 1);
            return;
          }
        }
      }
    }
  }
});
world3.beforeEvents.itemUse.subscribe(({ source, itemStack }) => {
  if (!(source instanceof Player2) || !itemStack)
    return;
  if (itemStack.typeId !== "je:chest_lock_1" && itemStack.typeId !== "je:chest_lock_2")
    return;
  system2.runTimeout(() => {
    const playerInv = source.getComponent("inventory");
    if (!playerInv || !playerInv.container)
      return;
    let lock = void 0;
    if (itemStack.typeId === "je:chest_lock_2" && source.isSneaking) {
      lock = new ItemStack2("je:chest_lock_1", 1);
      source.onScreenDisplay.setActionBar("Lock Reset");
    } else if (itemStack.typeId === "je:chest_lock_1" && !source.isSneaking) {
      lock = new ItemStack2("je:chest_lock_2", 1);
      lock.setLore([`\xA77${source.name}`]);
      source.onScreenDisplay.setActionBar(`\xA7aLock Owner set to \xA7e${source.name}`);
    } else
      return;
    source.playSound("random.pop");
    playerInv.container.setItem(source.selectedSlotIndex, lock);
  }, 1);
});

// src/shop.ts
import { ItemStack as ItemStack3, Player as Player3, world as world4, system as system3 } from "@minecraft/server";
import { ActionFormData, MessageFormData, ModalFormData } from "@minecraft/server-ui";
var d = { 0: `minecraft:overworld`, 1: `minecraft:nether`, 2: `minecraft:the_end` };
var dyes = ["minecraft:glow_ink_sac", "minecraft:white_dye", "minecraft:black_dye", "minecraft:blue_dye", "minecraft:brown_dye", "minecraft:cyan_dye", "minecraft:gray_dye", "minecraft:green_dye", "minecraft:light_blue_dye", "minecraft:light_gray_dye", "minecraft:lime_dye", "minecraft:magenta_dye", "minecraft:orange_dye", "minecraft:pink_dye", "minecraft:purple_dye", "minecraft:red_dye", "minecraft:yellow_dye"];
var activeTransactions = /* @__PURE__ */ new Map();
var protectedBlockTypes2 = new Set(config_default.containers);
function createAndShowModalForm(player, title, textFieldPrompt, textFieldPlaceholder, defaultValue = "10") {
  const form = new ModalFormData().title(title).textField(textFieldPrompt, textFieldPlaceholder, defaultValue);
  return form.show(player);
}
function bind(hitBlock, player) {
  system3.runTimeout(() => {
    let { x, y, z } = hitBlock.location;
    let sD = hitBlock.dimension.id == "minecraft:overworld" ? 0 : hitBlock.dimension.id == "minecraft:nether" ? 1 : 2;
    setScore(player, "signX", x);
    setScore(player, "signY", y);
    setScore(player, "signZ", z);
    setScore(player, "signD", sD);
    player.addTag(`binding`);
    player.sendMessage(`\uE200 \xA7bBinding Mode: \xA7fINTERACT a chest where you want to bind this sign.\xA7r`);
    player.playSound("note.banjo");
    player.onScreenDisplay.setActionBar(`INTERACT a chest to bind with this sign.`);
  }, 1);
}
function displayItemInfoAboveChest(player, item) {
  const enchantComponent = item.getComponent("enchantable");
  const enchantments = enchantComponent?.getEnchantments() || [];
  const lore = item.getLore()?.join("\n") || "No lore available";
  const nameTag = item.nameTag || iName(item.typeId);
  let enchantmentsText = enchantments.map((e) => `${displayFormat(e.type.id)} ${romanize(e.level)}`).join(", ");
  if (!enchantmentsText)
    enchantmentsText = "No enchantments";
  let displayText = `\xA7o${nameTag}\xA7r`;
  if (enchantmentsText !== "No enchantments") {
    displayText += `
Enchants: ${enchantmentsText}`;
  }
  if (lore !== "No lore available") {
    displayText += `
Lore: ${lore}`;
  }
  player.sendMessage(displayText);
}
world4.beforeEvents.playerInteractWithBlock.subscribe((sign) => {
  try {
    const player = sign.player;
    const block = sign.block;
    if (!player || !block)
      return;
    const coordsKey = `${block.location.x},${block.location.y},${block.location.z}`;
    if (activeTransactions.get(coordsKey)) {
      sign.cancel = true;
      player.onScreenDisplay.setActionBar("\xA7cTransaction in progress... Please wait.");
      return;
    }
    if (player.hasTag("binding") && block.getComponent("inventory") && protectedBlockTypes2.has(block.typeId)) {
      sign.cancel = true;
      activeTransactions.set(coordsKey, true);
      system3.runTimeout(() => {
        try {
          const inventoryComp = block.getComponent("inventory");
          const chestInv = inventoryComp?.container;
          if (!chestInv)
            return;
          let hasLockItem = false;
          for (let li = 0; li < chestInv.size; li++) {
            if (chestInv.getItem(li)?.typeId === "je:chest_lock_2") {
              hasLockItem = true;
              break;
            }
          }
          if (!hasLockItem) {
            const lockItem = new ItemStack3("je:chest_lock_2", 1);
            lockItem.setLore([`\xA77${player.name}`]);
            chestInv.addItem(lockItem);
          }
          player.removeTag("binding");
          let signD = d[getScore(player, "signD")];
          let chestD = block.dimension.id;
          if (signD !== chestD)
            return;
          let signLoc = {
            x: parseInt(getScore(player, "signX").toString()),
            y: parseInt(getScore(player, "signY").toString()),
            z: parseInt(getScore(player, "signZ").toString())
          };
          resetScore(player, "signX");
          resetScore(player, "signY");
          resetScore(player, "signZ");
          const targetSign = block.dimension.getBlock(signLoc);
          const signComp = targetSign?.getComponent("sign");
          if (!signComp) {
            player.sendMessage("\uE201 \xA7cSign has been broken or missing. Try Again.");
            player.playSound("mob.creeper.say");
            return;
          }
          const processResult = processItems(chestInv);
          if ("error" in processResult && processResult.error) {
            player.sendMessage(`\xA7cThis shop cannot be created. Error: ${processResult.error}.`);
            player.playSound("note.bass");
            targetSign?.setType("minecraft:air");
            return;
          }
          const result = processResult;
          let { itemAmount, itemName, hasNametag, enchants, sell } = result;
          if (sell.typeId === "minecraft:potion" || sell.typeId === "minecraft:splash_potion" || sell.typeId === "minecraft:lingering_potion") {
            itemName = getPotionDisplayName(sell, true);
          }
          let exT = `${encode(`x${block.location.x}y${block.location.y}z${block.location.z}r`)}`;
          let text = signComp.getText().replace("\xA7b\xA7i\xA7n\xA7d\xA7r", exT);
          let split = text.split("\n");
          if (hasNametag) {
            itemName = "\xA7o" + itemName;
          }
          let enchantAmount = Object.keys(enchants).length;
          if (itemName == "Enchanted Book" && enchantAmount > 0) {
            let enchantName = displayFormat(Object.keys(enchants)[0]);
            let more = enchantAmount > 1 ? "+" : "";
            itemName = `\xA7o\xA75${enchantName} \xA7r\xA7o${romanize(enchants[Object.keys(enchants)[0]])} \xA7l\xA72${more}\xA7r`;
          }
          let earn = split[1].substring(0, split[1].indexOf(`\xA7r`));
          split[1] = `${earn}\xA7r${itemName}`;
          split[3] = itemAmount > 0 ? `${itemAmount}x left\xA7r` : "\xA7l\xA74OUT OF STOCK\xA7r";
          text = split.join("\n");
          signComp.setText(text);
          player.sendMessage(`\uE200 \xA7bBinding Mode: \xA7aChest & Sign Binded.\xA7r
\xA77Chest Location:\xA7r ${block.location.x} ${block.location.y} ${block.location.z}
\xA77Sign Location:\xA7r ${signLoc.x} ${signLoc.y} ${signLoc.z}`);
          player.playSound("note.hat");
        } catch (e) {
          console.warn(`[Shop Setup] Error binding shop: ${e}`);
        } finally {
          activeTransactions.delete(coordsKey);
        }
      }, 1);
      return;
    }
    if (block.typeId.endsWith("sign")) {
      const content = block.getComponent("sign");
      if (!content)
        return;
      let text = content.getText();
      if (!text)
        return;
      let split = text.split("\n");
      let data = split[0].substring(0, split[0].indexOf(`\xA7r||`)).replace(/§/g, "").toLowerCase();
      let ownerName = split[0].substring(split[0].indexOf(`|`), split[0].length - 4).replace(/[|]/g, "").trim();
      if (data && dyes.includes(sign.itemStack?.typeId || "") && player.name == ownerName) {
        sign.cancel = false;
        return;
      }
      if (data) {
        sign.cancel = true;
      }
      if (config_default.signConfig.includes(split[0].toLowerCase())) {
        sign.cancel = true;
        activeTransactions.set(coordsKey, true);
        system3.runTimeout(() => {
          let limit = getScore(player, "signL");
          let count = getScore(player, "signC");
          if (count >= limit) {
            player.sendMessage(`\uE201 \xA7cYou can only have ${limit} shops on your current rank!\xA7r`);
            player.playSound("note.bass");
            activeTransactions.delete(coordsKey);
            return;
          }
          createAndShowModalForm(player, "Input PRICE", `

Price per item`, "Type your price here", "10").then((e) => {
            try {
              if (e.canceled || !e.formValues)
                return;
              let priceStr = e.formValues[0];
              let price = Math.round(Math.abs(parseFloat(priceStr.replace(",", ""))));
              if (price > 2147483647 || isNaN(price) || price <= 0) {
                player.sendMessage("\uE201 \xA7cPrice must be a positive number greater than 0!\xA7r");
                player.playSound("note.bass");
                return;
              }
              addScore(player, "signC", 1);
              const priceDisplay = config_default.currencyType === "item" ? `${price}x ${iName(config_default.currency)}` : `${config_default.currencySymbol}${price.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
              content.setText(`${encode("bind")}\xA7r||${player.name}\xA7r||
\xA70\xA7r\xA7cNo Item Yet\xA7r
${priceDisplay}\xA7r
\xA7l\xA74OUT OF STOCK\xA7r`);
              content.setWaxed(true);
              bind(block, player);
            } finally {
              activeTransactions.delete(coordsKey);
            }
          });
        }, 1);
        return;
      }
      if (player.isSneaking && data.startsWith("x", 0) && (player.name == ownerName || player.hasTag(config_default.adminTag))) {
        sign.cancel = true;
        activeTransactions.set(coordsKey, true);
        system3.runTimeout(async () => {
          try {
            if (!data.startsWith("x", 0))
              return;
            let decode = /([xyz])(-?\d+)/g, match, vars = {};
            while ((match = decode.exec(data)) !== null) {
              vars[match[1]] = parseInt(match[2]);
            }
            let { x, y, z } = vars;
            let chest = player.dimension.getBlock({ x, y, z });
            const chestInventoryComp = chest?.getComponent("inventory");
            if (!chestInventoryComp || !chestInventoryComp.container) {
              player.sendMessage(`\uE201 \xA7cChest is missing or has been broken!\xA7r`);
              player.playSound("note.bass");
              return;
            }
            const processResult = processItems(chestInventoryComp.container);
            if ("error" in processResult && processResult.error) {
              player.sendMessage(`\xA7cThis shop has an error: ${processResult.error}.`);
              const signLines = content.getText().split("\n");
              signLines[3] = `\xA7cSHOP ERROR`;
              content.setText(signLines.join("\n"));
              return;
            }
            const result = processResult;
            let { itemAmount, itemName, enchants, sell, hasNametag } = result;
            let iname = itemName;
            let signItemName = itemName;
            if (sell.typeId === "minecraft:potion" || sell.typeId === "minecraft:splash_potion" || sell.typeId === "minecraft:lingering_potion") {
              signItemName = getPotionDisplayName(sell, true);
            } else if (itemName.replace(/§\w/g, "").length > 17) {
              if (itemName.split(" ").length > 1) {
                let words = itemName.split(" ");
                let lastW = words.pop();
                signItemName = `${words.map((w) => w.charAt(0).toUpperCase()).join(".")}. ${lastW}`;
              } else {
                signItemName = itemName.toLowerCase().split("").filter((char) => !"aeiou".includes(char)).join("");
              }
            }
            itemName = signItemName;
            if (hasNametag) {
              itemName = "\xA7o" + itemName;
            }
            if (itemName == "Enchanted Book" && Object.keys(enchants).length > 0) {
              let enchantName = displayFormat(Object.keys(enchants)[0]);
              let more = Object.keys(enchants).length > 1 ? "+" : "";
              itemName = `\xA7o\xA75${enchantName} \xA7r\xA7o${romanize(enchants[Object.keys(enchants)[0]])} \xA7l\xA72${more}\xA7r`;
            }
            let earnText = split[1].substring(0, split[1].indexOf(`\xA7r`));
            let oldText = content?.getText().split("\n");
            split[1] = `${earnText}\xA7r${itemName}`;
            split[3] = itemAmount > 0 ? `${itemAmount}x left\xA7r` : "\xA7l\xA74OUT OF STOCK\xA7r";
            content.setText(split.join("\n"));
            if (split[3] !== oldText[3] || split[1] !== oldText[1]) {
              player.onScreenDisplay.setActionBar("\xA7aSign Stock Updated");
              player.playSound("note.hat");
              return;
            }
            let earnVal = parseInt(earnText.replace(/\D/g, "")) || 0;
            let f = new ActionFormData();
            f.title(`\xA7l[ ${player.name}'s Shop ]`);
            const incomeDisplay = config_default.currencyType === "item" ? `${earnVal} ${iName(config_default.currency)}` : `${config_default.currencySymbol}${earnVal.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
            f.body(`
\xA73[ INFO ]\xA7r

Chest Location:\xA77 ${x} ${y} ${z}\xA7r

\uE102 \xA77Item Name:\xA7r ${iname}
(${sell.typeId})

\uE102 \xA77Stock Left:\xA7r ${itemAmount}x

\uE102 \xA77price each:\xA7r ${split[2]}

\xA73TOTAL INCOME SALES: \xA7e \xA7r${incomeDisplay}

`);
            f.button("Edit Price");
            const pendingSales = offlineSalesDB.get(player.name);
            let hasPendingSales = pendingSales && Object.keys(pendingSales).length > 0;
            if (hasPendingSales) {
              f.button("\xA7aRetrieve Offline Funds");
            }
            f.button("\xA74Delete Shop");
            const response = await f.show(player);
            if (response.canceled)
              return;
            if (response.selection === 0) {
              createAndShowModalForm(player, "Input PRICE", `

Price ${config_default.currencySymbol}`, "Type your price here", "10").then((e) => {
                if (e.canceled || !e.formValues)
                  return;
                let priceStr = e.formValues[0];
                let price = Math.round(Math.abs(parseFloat(priceStr.replace(",", ""))));
                if (price > 2147483647 || isNaN(price) || price <= 0) {
                  player.sendMessage("\uE201 \xA7cPrice must be a positive number greater than 0!\xA7r");
                  player.playSound("note.bass");
                  return;
                }
                const priceDisplay = config_default.currencyType === "item" ? `${price}x ${iName(config_default.currency)}` : `${config_default.currencySymbol}${price.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
                split[2] = `${priceDisplay}\xA7r`;
                content.setText(split.join("\n"));
                player.sendMessage("\uE200 \xA7aPrice successfully updated.\xA7r");
                player.playSound("note.hat");
              });
            } else if (response.selection === 1 && hasPendingSales) {
              const salesData = offlineSalesDB.get(player.name);
              if (!salesData)
                return;
              const playerInvComp = player.getComponent("inventory");
              const playerInv = playerInvComp?.container;
              if (!playerInv)
                return;
              const itemsToGive = [];
              for (const itemId in salesData) {
                if (salesData[itemId] > 0)
                  itemsToGive.push(...createItemStacks(itemId, salesData[itemId]));
              }
              let successfullyGiven = {};
              for (const itemStack of itemsToGive) {
                const leftover = playerInv.addItem(itemStack);
                const givenAmount = itemStack.amount - (leftover?.amount ?? 0);
                if (givenAmount > 0) {
                  if (!successfullyGiven[itemStack.typeId])
                    successfullyGiven[itemStack.typeId] = 0;
                  successfullyGiven[itemStack.typeId] += givenAmount;
                }
              }
              let newSalesData = { ...salesData };
              let allFundsRetrieved = true;
              for (const itemId in successfullyGiven) {
                newSalesData[itemId] -= successfullyGiven[itemId];
                if (newSalesData[itemId] <= 0)
                  delete newSalesData[itemId];
              }
              if (Object.keys(newSalesData).length === 0) {
                offlineSalesDB.delete(player.name);
              } else {
                allFundsRetrieved = false;
                offlineSalesDB.set(player.name, newSalesData);
              }
              player.sendMessage("\xA7aOffline funds retrieved!");
              player.playSound("random.orb");
              if (!allFundsRetrieved)
                player.sendMessage("\xA7cYour inventory was full. Some items could not be retrieved. Clear space and try again.");
            } else {
              let g = new MessageFormData().title("\xA7c\xA7lDelete Shop").body("\n\xA7rAre you sure you want to remove this shop?").button1("Cancel").button2("Delete");
              const g_res = await g.show(player);
              if (g_res.canceled || g_res.selection == 0)
                return;
              try {
                const currentCount = getScore(ownerName, "signC");
                if (currentCount > 0) {
                  setScore(ownerName, "signC", currentCount - 1);
                }
              } catch (e) {
                console.warn(`Failed to decrement shop count on UI deletion: ${e}`);
              }
              block.setType("minecraft:air");
              player.playSound("random.levelup", { pitch: 2 });
              player.sendMessage("\uE200 \xA7aSign successfully deleted.\xA7r");
            }
          } catch (e) {
            console.warn(`[Shop Admin] Error in sign panel: ${e}`);
          } finally {
            activeTransactions.delete(coordsKey);
          }
        }, 1);
        return;
      }
      if (data.startsWith("x", 0) || data == "bind") {
        sign.cancel = true;
        if (config_default.currencyType === "scoreboard") {
          system3.runTimeout(() => {
            addScore(player, config_default.currency, 0);
          }, 1);
        }
        if ((player.name == ownerName || player.hasTag(config_default.adminTag)) && player.isSneaking)
          return;
        activeTransactions.set(coordsKey, true);
        system3.runTimeout(async () => {
          try {
            if (data.startsWith("x", 0)) {
              let decode = /([xyz])(-?\d+)|d(\w+)/g, match, vars = { d: "minecraft:overworld" };
              while ((match = decode.exec(data)) !== null) {
                if (match[3])
                  vars["d"] = match[3];
                else
                  vars[match[1]] = parseInt(match[2]);
              }
              let { x, y, z, d: d2 } = vars;
              let chest = world4.getDimension(d2).getBlock({ x, y, z });
              const chestInventoryComp = chest?.getComponent("inventory");
              if (!chestInventoryComp || !chestInventoryComp.container) {
                player.sendMessage("\uE201 \xA7cChest is missing or has been broken!\xA7r");
                player.playSound("note.bass");
                return;
              }
              const container = chestInventoryComp.container;
              const processResult = processItems(container);
              if ("error" in processResult && processResult.error) {
                player.sendMessage(`\xA7cThis shop has an error (${processResult.error}).`);
                const signLines = content.getText().split("\n");
                signLines[3] = `\xA7cSHOP ERROR`;
                content.setText(signLines.join("\n"));
                player.playSound("note.bass");
                return;
              }
              const result = processResult;
              let { itemAmount, itemName, enchants, sell, hasNametag } = result;
              let iname = itemName;
              let signItemName = itemName;
              if (sell.typeId === "minecraft:potion" || sell.typeId === "minecraft:splash_potion" || sell.typeId === "minecraft:lingering_potion") {
                signItemName = getPotionDisplayName(sell, true);
              } else if (itemName.replace(/§\w/g, "").length > 17) {
                if (itemName.split(" ").length > 1) {
                  let words = itemName.split(" ");
                  let lastW = words.pop();
                  signItemName = `${words.map((w) => w.charAt(0).toUpperCase()).join(".")}. ${lastW}`;
                } else {
                  signItemName = itemName.toLowerCase().split("").filter((char) => !"aeiou".includes(char)).join("");
                }
              }
              itemName = signItemName;
              if (hasNametag) {
                itemName = "\xA7o" + itemName;
              }
              if (itemName == "Enchanted Book" && Object.keys(enchants).length > 0) {
                let enchantName = displayFormat(Object.keys(enchants)[0]);
                let more = Object.keys(enchants).length > 1 ? "+" : "";
                itemName = `\xA7o\xA75${enchantName} \xA7r\xA7o${romanize(enchants[Object.keys(enchants)[0]])} \xA7l\xA72${more}\xA7r`;
              }
              let earnText = split[1].substring(0, split[1].indexOf(`\xA7r`));
              let oldText = content?.getText().split("\n");
              split[1] = `${earnText}\xA7r${itemName}`;
              split[3] = itemAmount > 0 ? `${itemAmount}x left\xA7r` : "\xA7l\xA74OUT OF STOCK\xA7r";
              content.setText(split.join("\n"));
              if (split[3] !== oldText[3] || split[1] !== oldText[1]) {
                player.onScreenDisplay.setActionBar("\xA7aSign Stock Updated");
                player.playSound("note.hat");
                return;
              }
              if (split[3] == "\xA7l\xA74OUT OF STOCK\xA7r") {
                player.playSound("note.bass");
                return;
              }
              let buy = new ModalFormData().title(`\xA7l[ ${ownerName}'s Shop ]`);
              let durabilityText = "N/A";
              let durabilityComponent = sell.getComponent("durability");
              if (durabilityComponent) {
                const currentDurability = durabilityComponent.maxDurability - durabilityComponent.damage;
                const maxDurability = durabilityComponent.maxDurability;
                const percentage = currentDurability / maxDurability;
                const barWidth = 50;
                const greenBars = Math.round(percentage * barWidth);
                const greyBars = barWidth - greenBars;
                const greenBar = "\xA7a" + "|".repeat(greenBars);
                const greyBar = "\xA77" + "|".repeat(greyBars);
                const durabilityBar = greenBar + greyBar + "\xA7r";
                const percentageText = `${Math.round(percentage * 100)}%`;
                durabilityText = `${currentDurability}/${maxDurability}
${durabilityBar}
${percentageText}`;
              }
              let itemLore = sell.getLore().length > 0 ? sell.getLore().join("\n") : "N/A";
              let enchantmentsText = Object.keys(enchants).map((ench) => `\xA7d${displayFormat(ench)} \xA7e${romanize(enchants[ench])}\xA7r`).join(`
`) || "N/A";
              let formText = `

 \xA77Item Name:\xA7r ${iname}
(${sell.typeId})

`;
              if (durabilityText !== "N/A") {
                formText += ` \xA77Durability:\xA7r
${durabilityText}

`;
              }
              if (enchantmentsText !== "N/A") {
                formText += ` \xA77Enchants:\xA7r
${enchantmentsText}

`;
              }
              if (itemLore !== "N/A") {
                formText += ` \xA77Lore:\xA7r
${itemLore}

`;
              }
              formText += ` \xA77Stock Left:\xA7r ${itemAmount}x

 \xA77price each:\xA7r ${split[2]}

How many do you want to buy?`;
              buy.textField(formText, "Type amount here", "1");
              const buyResponse = await buy.show(player);
              if (buyResponse.canceled || !buyResponse.formValues)
                return;
              let amountStr = buyResponse.formValues[0];
              let amount = Math.round(Math.abs(parseFloat(amountStr.replace(",", ""))));
              if (isNaN(amount) || amount <= 0) {
                player.sendMessage("\uE201 \xA7cThe amount must be a positive number!\xA7r");
                player.playSound("note.bass");
                return;
              }
              let activeChest = world4.getDimension(d2).getBlock({ x, y, z });
              const activeChestInvComp = activeChest?.getComponent("inventory");
              if (!activeChestInvComp || !activeChestInvComp.container) {
                player.sendMessage("\uE201 \xA7cChest was broken or deleted. Transaction canceled.\xA7r");
                player.playSound("note.bass");
                return;
              }
              const activeContainer = activeChestInvComp.container;
              const activeResult = processItems(activeContainer);
              if ("error" in activeResult && activeResult.error) {
                player.sendMessage("\uE201 \xA7cShop inventory changed. Transaction canceled.\xA7r");
                player.playSound("note.bass");
                return;
              }
              const actRes = activeResult;
              if (!actRes.sell || !areItemsIdentical(sell, actRes.sell)) {
                player.sendMessage("\uE201 \xA7cShop item type changed. Transaction canceled.\xA7r");
                player.playSound("note.bass");
                return;
              }
              if (amount > actRes.itemAmount) {
                player.sendMessage(`\uE201 \xA7cSorry, the stock is insufficient.\xA7r`);
                player.playSound("note.bass");
                return;
              }
              const priceVal = parseInt(split[2].replace(/\D/g, "")) || 0;
              const total = priceVal * amount;
              const playerInvComp = player.getComponent("inventory");
              const inv = playerInvComp?.container;
              if (!inv)
                return;
              if (inv.emptySlotsCount < Math.ceil(amount / (sell?.maxAmount || 64))) {
                player.sendMessage(`\uE201 \xA7cYou don't have enough space in your inventory.\xA7r`);
                player.playSound("note.bass");
                return;
              }
              if (config_default.currencyType === "scoreboard") {
                if (getScore(player, config_default.currency) < total) {
                  player.sendMessage(`\uE201 \xA7cYou don't have enough money!\xA7r`);
                  player.playSound("note.bass");
                  return;
                }
              } else {
                let itemCount = 0;
                for (let i = 0; i < inv.size; i++) {
                  const item = inv.getItem(i);
                  if (item && item.typeId === config_default.currency)
                    itemCount += item.amount;
                }
                if (itemCount < total) {
                  player.sendMessage(`\uE201 \xA7cYou don't have enough ${iName(config_default.currency)}.\xA7r`);
                  player.playSound("note.bass");
                  return;
                }
                const owner2 = world4.getAllPlayers().find((p) => p.name == ownerName);
                if (owner2) {
                  const ownerInvComp = owner2.getComponent("inventory");
                  if (ownerInvComp && ownerInvComp.container && ownerInvComp.container.emptySlotsCount === 0) {
                    player.sendMessage("\xA7cTransaction failed. The shop owner's inventory is full.");
                    player.playSound("note.bass");
                    return;
                  }
                }
              }
              let objContainer = {};
              for (let i = 0; i < activeContainer.size; i++) {
                const item = activeContainer.getItem(i);
                if (item && areItemsIdentical(sell, item)) {
                  objContainer[i] = item.amount;
                }
              }
              const [newCont] = uContainer(objContainer, amount);
              const newStock = Object.values(newCont).reduce((a, b) => a + b, 0);
              if (config_default.currencyType === "scoreboard") {
                subtractScore(player, config_default.currency, total);
              } else {
                let amountToClear = total;
                for (let slotIndex = 0; slotIndex < inv.size; slotIndex++) {
                  const item = inv.getItem(slotIndex);
                  if (item && item.typeId === config_default.currency) {
                    if (item.amount > amountToClear) {
                      item.amount -= amountToClear;
                      inv.setItem(slotIndex, item);
                      amountToClear = 0;
                      break;
                    } else {
                      amountToClear -= item.amount;
                      inv.setItem(slotIndex, void 0);
                    }
                  }
                }
                if (amountToClear > 0) {
                  player.sendMessage(`\uE201 \xA7cTransaction failed. Inventory synchronization error.\xA7r`);
                  player.playSound("note.bass");
                  return;
                }
              }
              for (const iStr in objContainer) {
                const i = parseInt(iStr);
                if (objContainer[i] !== newCont[i]) {
                  const itemInChest = activeContainer.getItem(i);
                  if (itemInChest) {
                    const itemToGive = itemInChest.clone();
                    itemToGive.amount = objContainer[i] - newCont[i];
                    inv.addItem(itemToGive);
                    if (newCont[i] === 0) {
                      activeContainer.setItem(i, void 0);
                    } else {
                      itemInChest.amount = newCont[i];
                      activeContainer.setItem(i, itemInChest);
                    }
                  }
                }
              }
              split[3] = newStock > 0 ? `${newStock}x left\xA7r` : "\xA7l\xA74OUT OF STOCK\xA7r";
              let totalEarned = parseInt(split[1].substring(0, split[1].indexOf(`\xA7r`)).replace(/\D/g, "")) || 0;
              split[1] = `${encode(`${totalEarned + total}`)}\xA7r${itemName}`;
              content.setText(split.join("\n"));
              player.playSound("random.orb");
              let purchaseMessage = "", actionBarMessage = "";
              const owner = world4.getAllPlayers().find((p) => p.name == ownerName);
              if (config_default.currencyType === "scoreboard") {
                purchaseMessage = `\uE200 \xA77\xA7oYou bought \xA7f${amount}\xA7bx\xA7f ${iname}\xA77 for \xA7e${config_default.currencySymbol}\xA7f${total.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")}\xA7r`;
                actionBarMessage = `\xA7c-\xA7e${config_default.currencySymbol}\xA7f${total.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")}\xA7r`;
                if (owner) {
                  addScore(owner, config_default.currency, total);
                  owner.playSound("random.orb");
                  owner.sendMessage(`\uE200 \xA7o\xA7e${player.name}\xA77 bought \xA7f${amount}\xA7bx\xA7f ${iname}\xA77 from your shop.\xA7r
\uE102 \xA77You earned \xA7a+\xA7e${config_default.currencySymbol}\xA7f${total.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")}\xA7r`);
                } else {
                  addScore(ownerName, config_default.currency, total);
                }
              } else {
                const currencyItemName = iName(config_default.currency);
                purchaseMessage = `\uE200 \xA77\xA7oYou bought \xA7f${amount}\xA7bx\xA7f ${iname}\xA77 for \xA7f${total}x ${currencyItemName} \xA77from \xA73${ownerName}'s Shop\xA7r`;
                actionBarMessage = `\xA7c- \xA7f${total}x ${currencyItemName}\xA7r`;
                if (owner) {
                  const ownerInvComp = owner.getComponent("inventory");
                  if (ownerInvComp && ownerInvComp.container) {
                    const payoutStacks = createItemStacks(config_default.currency, total);
                    let totalLeftover = 0;
                    for (const stack of payoutStacks) {
                      const leftover = ownerInvComp.container.addItem(stack);
                      if (leftover && leftover.amount > 0) {
                        totalLeftover += leftover.amount;
                      }
                    }
                    if (totalLeftover > 0) {
                      let salesData = offlineSalesDB.get(ownerName) ?? {};
                      salesData[config_default.currency] = (salesData[config_default.currency] || 0) + totalLeftover;
                      offlineSalesDB.set(ownerName, salesData);
                      owner.sendMessage(`\xA7cYour inventory was full! \xA7f${totalLeftover}x ${currencyItemName} \xA7cwas sent to your offline sales bank.`);
                    }
                  }
                  owner.playSound("random.orb");
                  owner.sendMessage(`\uE200 \xA7o\xA7e${player.name}\xA77 bought \xA7f${amount}\xA7bx\xA7f ${iname}\xA77 from your shop.\xA7r
\uE102 \xA77You received \xA7a+\xA7f${total}x ${currencyItemName}\xA7r`);
                } else {
                  let salesData = offlineSalesDB.get(ownerName) ?? {};
                  salesData[config_default.currency] = (salesData[config_default.currency] || 0) + total;
                  offlineSalesDB.set(ownerName, salesData);
                }
              }
              player.sendMessage(purchaseMessage);
              player.onScreenDisplay.setActionBar(actionBarMessage);
            }
            if (data == "bind" && player.name == ownerName) {
              bind(block, player);
            }
          } catch (e) {
            console.warn(`[Shop Transaction] Error during checkout: ${e}`);
          } finally {
            activeTransactions.delete(coordsKey);
          }
        }, 1);
      }
    }
  } catch (er) {
    console.warn(`[Shop Interact] Critical error: ${er} - Stack: ${er.stack}`);
  }
});
world4.beforeEvents.playerInteractWithBlock.subscribe((t) => {
  if (!(t.player instanceof Player3))
    return;
  let player = t.player;
  system3.runTimeout(() => {
    setScore(player, "signL", 1 * getScore(player, "rank"));
    if (config_default.currencyType === "scoreboard")
      addScore(player, "signC", 0);
  }, 1);
  const block = t.block;
  if (block.getComponent("inventory") && protectedBlockTypes2.has(block.typeId)) {
    const inventoryComp = block.getComponent("inventory");
    const container = inventoryComp?.container;
    const item = container?.getItem(0);
    if (item) {
      displayItemInfoAboveChest(player, item);
    }
  }
  if (!block.typeId.endsWith("sign"))
    return;
  let signComp = block.getComponent(`sign`);
  let text = signComp?.getText();
  if (!text)
    return;
  let split = text.split("\n");
  let firstLine = split[0];
  if (!firstLine.includes("||"))
    return;
  let data = firstLine.substring(0, firstLine.indexOf(`\xA7r||`)).replace(/§/g, "").toLowerCase();
  if (data.startsWith("x", 0)) {
    let decode = /([xyz])(-?\d+)/g, match, vars = {};
    while ((match = decode.exec(data)) !== null) {
      vars[match[1]] = parseInt(match[2]);
    }
    let { x, y, z } = vars;
    let chest = player.dimension.getBlock({ x, y, z });
    const chestInventoryComp = chest?.getComponent("inventory");
    if (!chestInventoryComp || !chestInventoryComp.container)
      return;
    const processResult = processItems(chestInventoryComp.container);
    system3.runTimeout(() => {
      if ("error" in processResult && processResult.error) {
        const signLines = signComp.getText().split("\n");
        signLines[3] = `\xA7cSHOP ERROR`;
        signComp.setText(signLines.join("\n"));
        return;
      }
      const result = processResult;
      let { itemAmount, itemName, enchants, hasNametag, sell } = result;
      let signItemName = itemName;
      if (sell.typeId === "minecraft:potion" || sell.typeId === "minecraft:splash_potion" || sell.typeId === "minecraft:lingering_potion") {
        signItemName = getPotionDisplayName(sell, true);
      } else if (itemName.replace(/§\w/g, "").length > 17) {
        if (itemName.split(" ").length > 1) {
          let words = itemName.split(" ");
          let lastW = words.pop();
          signItemName = `${words.map((w) => w.charAt(0).toUpperCase()).join(".")}. ${lastW}`;
        } else {
          signItemName = itemName.toLowerCase().split("").filter((char) => !"aeiou".includes(char)).join("");
        }
      }
      itemName = signItemName;
      if (hasNametag) {
        itemName = "\xA7o" + itemName;
      }
      if (itemName == "Enchanted Book" && Object.keys(enchants).length > 0) {
        let enchantName = displayFormat(Object.keys(enchants)[0]);
        let more = Object.keys(enchants).length > 1 ? "+" : "";
        itemName = `\xA7o\xA75${enchantName} \xA7r\xA7o${romanize(enchants[Object.keys(enchants)[0]])} \xA7l\xA72${more}\xA7r`;
      }
      let oldText = signComp.getText().split("\n");
      let earn = oldText[1].substring(0, oldText[1].indexOf(`\xA7r`));
      let newText = [...oldText];
      newText[1] = `${earn}\xA7r${itemName}`;
      newText[3] = itemAmount > 0 ? `${itemAmount}x left\xA7r` : "\xA7l\xA74OUT OF STOCK\xA7r";
      signComp.setText(newText.join("\n"));
      if (newText[3] !== oldText[3] || newText[1] !== oldText[1]) {
        player.onScreenDisplay.setActionBar("\xA7aSign Stock Updated");
        player.playSound("note.hat");
      }
    }, 1);
  }
});
async function showCurrencyConfigurationForm(player) {
  const form = new ActionFormData().title("Shop Currency Configuration").body("Select the type of currency for your server's shops.").button("Scoreboard Objective").button("Item");
  const response = await form.show(player);
  if (response.canceled || response.selection === void 0) {
    return;
  }
  if (response.selection === 0) {
    const modal = new ModalFormData().title("Set Scoreboard Currency").textField("Enter the name of the scoreboard objective to use as currency.", "e.g., money");
    const modalResponse = await modal.show(player);
    if (modalResponse.canceled || !modalResponse.formValues || !modalResponse.formValues[0]) {
      player.sendMessage("\xA7cCurrency setup canceled.");
      return;
    }
    const objectiveName = modalResponse.formValues[0];
    if (!world4.scoreboard.getObjective(objectiveName)) {
      world4.scoreboard.addObjective(objectiveName, objectiveName);
      player.sendMessage(`\xA7aScoreboard objective "${objectiveName}" did not exist, so it was created.`);
    }
    config_default.currencyType = "scoreboard";
    config_default.currency = objectiveName;
    config_default.currencySymbol = "$";
    const newCurrencyConfig = {
      type: config_default.currencyType,
      id: config_default.currency,
      symbol: config_default.currencySymbol
    };
    serverDB.set("currencyConfig", newCurrencyConfig);
    player.sendMessage(`\xA7aShop currency is now the scoreboard objective: \xA7e${objectiveName}`);
    player.sendMessage("\xA7aThis setting has been saved and will persist through restarts.");
  } else if (response.selection === 1) {
    const modal = new ModalFormData().title("Set Item Currency").textField("Enter the item ID to use as currency.", "e.g., minecraft:diamond");
    const modalResponse = await modal.show(player);
    if (modalResponse.canceled || !modalResponse.formValues || !modalResponse.formValues[0]) {
      player.sendMessage("\xA7cCurrency setup canceled.");
      return;
    }
    const itemId = modalResponse.formValues[0];
    config_default.currencyType = "item";
    config_default.currency = itemId;
    config_default.currencySymbol = "";
    const newCurrencyConfig = {
      type: config_default.currencyType,
      id: config_default.currency,
      symbol: config_default.currencySymbol
    };
    serverDB.set("currencyConfig", newCurrencyConfig);
    player.sendMessage(`\xA7aShop currency is now the item: \xA7e${itemId}`);
    player.sendMessage("\xA7aThis setting has been saved and will persist through restarts.");
  }
}
world4.beforeEvents.chatSend.subscribe((event) => {
  const { sender, message } = event;
  if (!sender)
    return;
  if (message.trim().startsWith("-playershop") || message.trim().startsWith("/playershop:shopitem")) {
    event.cancel = true;
    system3.run(() => {
      if (sender.hasTag(config_default.adminTag)) {
        showCurrencyConfigurationForm(sender);
      } else {
        sender.sendMessage("\xA7cYou must be an admin to configure the shop currency.");
      }
    });
  }
});
world4.beforeEvents.itemUse.subscribe((event) => {
  const { source, itemStack } = event;
  if (!(source instanceof Player3) || !itemStack)
    return;
  if (itemStack.typeId === "minecraft:stick" && itemStack.nameTag === "Shop Configurator") {
    event.cancel = true;
    system3.run(() => {
      if (source.hasTag(config_default.adminTag)) {
        showCurrencyConfigurationForm(source);
      } else {
        source.sendMessage("\xA7cYou must be an admin to configure the shop currency.");
      }
    });
  }
});

// src/import.ts
var database2 = new Database("ShopLocations");
var offlineSalesDB = new Database("OfflineSales");
var serverDB = new Database("ServerSettings");
var savedCurrency = serverDB.get("currencyConfig");
if (savedCurrency) {
  console.warn(`[Shop] Loaded currency setting from database: ${savedCurrency.type} - ${savedCurrency.id}`);
  config_default.currency = savedCurrency.id;
  config_default.currencyType = savedCurrency.type;
  config_default.currencySymbol = savedCurrency.symbol;
}
function initializeWorld() {
  const setup = ["gamerule sendcommandfeedback false"];
  for (const command of setup) {
    try {
      world5.getDimension("overworld").runCommand(command);
    } catch (error) {
      console.warn(`[Shop Setup] Failed to run command "${command}": ${error}`);
    }
  }
  const objectives = ["rank", "signL", "signC", "signD", "signZ", "signY", "signX", config_default.currency];
  objectives.forEach((objective) => {
    if (objective && !objective.includes(":")) {
      try {
        world5.scoreboard.getObjective(objective) ?? world5.scoreboard.addObjective(objective, objective);
      } catch (error) {
        console.warn(`[Shop Setup] Failed to add objective "${objective}": ${error}`);
      }
    }
  });
  console.log("\xA7a[PlayerShop] World setup complete. Scoreboards and gamerules initialized.");
}
system4.runTimeout(() => {
  initializeWorld();
}, 10);
world5.afterEvents.playerSpawn.subscribe(({ player, initialSpawn }) => {
  if (!initialSpawn)
    return;
  system4.runTimeout(() => {
    try {
      if (!player.isValid())
        return;
      setScore(player, "rank", config_default.shopLimit);
      const fP = world5.scoreboard.getParticipants().find((p) => p.type === "FakePlayer" && p.displayName === player.name);
      if (!fP)
        return;
      if (config_default.currencyType === "scoreboard") {
        const add = getScore(fP, config_default.currency);
        if (!add)
          return;
        addScore(player, config_default.currency, add);
        resetScore(fP, config_default.currency);
        setTimeout(() => {
          if (player.isValid()) {
            player.sendMessage(`\uE200 \xA77\xA7oYou earned \xA7e${config_default.currencySymbol}\xA7f${add.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")} \xA77from your shops while you were away!\xA7r`);
            player.playSound("random.levelup", { pitch: 2 });
          }
        }, 5e3);
      }
    } catch (error) {
      console.warn(`[Shop Spawn] Error handling player spawn: ${error}`);
    }
  }, 80);
});
export {
  database2 as database,
  offlineSalesDB,
  serverDB
};
