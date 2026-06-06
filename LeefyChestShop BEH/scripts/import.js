// src/import.ts
import { world as world5, system as system5 } from "@minecraft/server";

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
import { world, ScoreboardIdentityType, system } from "@minecraft/server";
var { scoreboard } = world;
var { FakePlayer } = ScoreboardIdentityType;
var databases = /* @__PURE__ */ new Map();
var DATABASE = {
  MAX_CHANGES_BEFORE_CLEANUP: 1e3,
  BATCH_SIZE: 10,
  MAX_DATA_LENGTH: 3e4,
  SPLIT_DELIMITER: "\n_`Split`_\n",
  DEFAULT_SAVE_INTERVAL: 5
};
var split = DATABASE.SPLIT_DELIMITER;
var CHUNK_SIZE = 150;
var CHUNK_PREFIX = "__chunk__";
var isShutdownRegistered = false;
function safeSubstring(str, start, end) {
  if (start >= str.length)
    return "";
  let adjStart = start;
  if (start > 0 && isSurrogatePairAt(str, start - 1)) {
    adjStart = start - 1;
  }
  let adjEnd = end;
  if (end < str.length && isSurrogatePairAt(str, end - 1)) {
    adjEnd = end - 1;
  }
  return str.substring(adjStart, adjEnd);
}
function isSurrogatePairAt(str, idx) {
  const code = str.charCodeAt(idx);
  return code >= 55296 && code <= 56319;
}
if (!isShutdownRegistered) {
  isShutdownRegistered = true;
}
var DatabaseSavingModes = {
  ONE_TIME_SAVE: "OneTimeSave",
  END_TICK_SAVE: "EndTickSave",
  TICK_INTERVAL: "TickInterval"
};
var ChangeAction = {
  Change: 0,
  Remove: 1
};
function run(thisClass, key, value, action) {
  if (!thisClass._scoreboard_ || !thisClass._scoreboard_.isValid()) {
    console.warn(`Database objective "${thisClass._nameId_}" was lost or invalid! Rebuilding...`);
    thisClass.rebuild();
    return;
  }
  if (thisClass._source_.has(key)) {
    const oldParticipant = thisClass._source_.get(key);
    if (Array.isArray(oldParticipant)) {
      for (const p of oldParticipant) {
        try {
          thisClass._scoreboard_.removeParticipant(p);
        } catch (e) {
        }
      }
    } else if (oldParticipant) {
      try {
        thisClass._scoreboard_.removeParticipant(oldParticipant);
      } catch (e) {
      }
    }
  }
  if (action === ChangeAction.Remove) {
    thisClass._source_.delete(key);
  } else {
    if (value && value.isChunked) {
      thisClass._source_.set(key, value.parts);
      for (const part of value.parts) {
        try {
          thisClass._scoreboard_.setScore(part, 0);
        } catch (e) {
          console.error(`Failed to setScore for chunk in database "${thisClass.id}":`, e);
        }
      }
    } else if (value) {
      thisClass._source_.set(key, value.part);
      try {
        thisClass._scoreboard_.setScore(value.part, 0);
      } catch (e) {
        console.error(`Failed to setScore in database "${thisClass.id}":`, e);
      }
    }
  }
}
var SavingModes = {
  [DatabaseSavingModes.ONE_TIME_SAVE](thisClass, key, value, action) {
    run(thisClass, key, value, action);
  },
  [DatabaseSavingModes.END_TICK_SAVE](thisClass, key, value, action) {
    thisClass._changes_.set(key, { action, value });
    thisClass.hasChanges = true;
    if (!thisClass._saveScheduled_) {
      thisClass._saveScheduled_ = true;
      system.run(() => {
        thisClass._saveScheduled_ = false;
        thisClass._executeSave();
      });
    }
  },
  [DatabaseSavingModes.TICK_INTERVAL](thisClass, key, value, action) {
    thisClass._changes_.set(key, { action, value });
    thisClass.hasChanges = true;
  }
};
var ScoreboardDatabaseManager = class extends Map {
  _loaded_ = false;
  _saveMode_;
  hasChanges = false;
  _loadingPromise_ = null;
  _saveScheduled_ = false;
  _nameId_;
  interval;
  _scoreboard_;
  _source_;
  _changes_;
  _maxChanges_;
  _lastCleanup_;
  _intervalId;
  get maxLength() {
    return DATABASE.MAX_DATA_LENGTH;
  }
  get _parser_() {
    return JSON;
  }
  get savingMode() {
    return this._saveMode_;
  }
  constructor(objective, saveMode = DatabaseSavingModes.END_TICK_SAVE, interval = 5) {
    super();
    let namespacedObjective;
    if (typeof objective === "string") {
      namespacedObjective = objective.startsWith("cs_db:") ? objective : `cs_db:${objective}`;
    } else {
      namespacedObjective = objective;
    }
    this._saveMode_ = saveMode;
    this._nameId_ = typeof namespacedObjective === "string" ? namespacedObjective : namespacedObjective.id;
    this.interval = interval ?? 5;
    if (!namespacedObjective)
      throw new RangeError("First parameter is not valid: " + namespacedObjective);
    this._scoreboard_ = typeof namespacedObjective === "string" ? scoreboard.getObjective(namespacedObjective) ?? scoreboard.addObjective(namespacedObjective, namespacedObjective) : namespacedObjective;
    const existingInstance = databases.get(this.id);
    if (existingInstance)
      return existingInstance;
    this._nameId_ = this.id;
    this._source_ = /* @__PURE__ */ new Map();
    this._changes_ = /* @__PURE__ */ new Map();
    this._maxChanges_ = DATABASE.MAX_CHANGES_BEFORE_CLEANUP;
    this._lastCleanup_ = Date.now();
    if (this._saveMode_ === DatabaseSavingModes.TICK_INTERVAL) {
      this._intervalId = system.runInterval(() => {
        if (this.hasChanges && !this._saveScheduled_) {
          this._saveScheduled_ = true;
          system.run(() => {
            this._saveScheduled_ = false;
            this._executeSave();
          });
        }
      }, this.interval);
    }
    databases.set(this.id, this);
  }
  // Lightweight self-healing audit on reads
  _assertObjectiveValid() {
    if (!this._scoreboard_ || !this._scoreboard_.isValid()) {
      console.warn(`[Database] Read audit failed! Objective "${this._nameId_}" was lost. Recovering...`);
      this.rebuild();
    }
  }
  load() {
    if (this._loaded_)
      return this;
    const chunkedData = /* @__PURE__ */ new Map();
    this._source_ = /* @__PURE__ */ new Map();
    super.clear();
    this._assertObjectiveValid();
    for (const participant of this._scoreboard_.getParticipants()) {
      const { displayName, type } = participant;
      if (type !== FakePlayer)
        continue;
      if (displayName.startsWith(CHUNK_PREFIX + split)) {
        const parts = displayName.split(split);
        if (parts.length >= 5) {
          const [, key, indexStr, totalStr, ...restData] = parts;
          const index = parseInt(indexStr, 10);
          const total = parseInt(totalStr, 10);
          const data = restData.join(split);
          if (isNaN(index) || isNaN(total))
            continue;
          if (!chunkedData.has(key))
            chunkedData.set(key, []);
          chunkedData.get(key).push({ index, total, data, rawName: displayName });
        }
      } else {
        const parts = displayName.split(split);
        if (parts.length >= 2) {
          const key = parts[0];
          const data = parts.slice(1).join(split);
          this._source_.set(key, displayName);
          try {
            super.set(key, this._parser_.parse(data));
          } catch (e) {
            console.error(`Error parsing data for key "${key}":`, e);
          }
        }
      }
    }
    for (const [key, chunks] of chunkedData.entries()) {
      const uniqueChunks = /* @__PURE__ */ new Map();
      for (const c of chunks) {
        uniqueChunks.set(c.index, c);
      }
      const sortedChunks = Array.from(uniqueChunks.values()).sort((a, b) => a.index - b.index);
      this._source_.set(key, sortedChunks.map((c) => c.rawName));
      if (sortedChunks.length > 0 && sortedChunks.length === sortedChunks[0].total) {
        const mergedData = sortedChunks.map((c) => c.data).join("");
        try {
          super.set(key, this._parser_.parse(mergedData));
        } catch (e) {
          console.error(`Error parsing chunked data for key "${key}":`, e);
        }
      } else {
        console.error(`Incomplete chunked data for key "${key}": expected ${sortedChunks[0]?.total} chunks, got ${sortedChunks.length}`);
      }
    }
    this._loaded_ = true;
    return this;
  }
  loadAsync() {
    if (this._loaded_)
      return this._loadingPromise_ ?? Promise.resolve(this);
    const promise = (async () => {
      return this.load();
    })();
    this._loadingPromise_ = promise;
    return promise;
  }
  set(key, value) {
    if (!this._loaded_)
      throw new ReferenceError("Database is not loaded");
    this._assertObjectiveValid();
    const serializedValue = this._parser_.stringify(value);
    const singleParticipantString = `${key}${split}${serializedValue}`;
    let changeValue;
    if (singleParticipantString.length <= 240) {
      changeValue = { isChunked: false, part: singleParticipantString };
    } else {
      const totalChunks = Math.ceil(serializedValue.length / CHUNK_SIZE);
      if (serializedValue.length > this.maxLength) {
        throw new RangeError(`Value is too large: ${serializedValue.length} characters (max: ${this.maxLength})`);
      }
      const parts = [];
      for (let i = 0; i < totalChunks; i++) {
        const chunkData = safeSubstring(serializedValue, i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
        const partString = `${CHUNK_PREFIX}${split}${key}${split}${i}${split}${totalChunks}${split}${chunkData}`;
        if (partString.length > 256) {
          throw new RangeError(`Key name "${key}" is too long for the chunking system`);
        }
        parts.push(partString);
      }
      changeValue = { isChunked: true, parts };
    }
    super.set(key, value);
    this._onChange_(key, changeValue, ChangeAction.Change);
    return this;
  }
  delete(key) {
    if (!this._loaded_)
      throw new ReferenceError("Database is not loaded");
    this._assertObjectiveValid();
    const changeValue = null;
    super.delete(key);
    this._onChange_(key, changeValue, ChangeAction.Remove);
    return true;
  }
  clear() {
    if (!this._loaded_)
      throw new ReferenceError("Database is not loaded");
    for (const key of this.keys()) {
      this.delete(key);
    }
  }
  forEach(callback) {
    if (!this._loaded_)
      throw new ReferenceError("Database is not loaded");
    this._assertObjectiveValid();
    for (const [key, value] of this.entries()) {
      callback(value, key, this);
    }
  }
  keys() {
    if (!this._loaded_)
      throw new ReferenceError("Database is not loaded");
    this._assertObjectiveValid();
    return super.keys();
  }
  values() {
    if (!this._loaded_)
      throw new ReferenceError("Database is not loaded");
    this._assertObjectiveValid();
    return super.values();
  }
  get length() {
    this._assertObjectiveValid();
    return super.size;
  }
  _onChange_(key, value, action) {
    if (!this._loaded_)
      throw new ReferenceError("Database is not loaded");
    if (this._changes_.size > this._maxChanges_) {
      this._cleanupChanges();
    }
    SavingModes[this._saveMode_](this, key, value, action);
  }
  _cleanupChanges() {
    try {
      this._executeSave();
      this._lastCleanup_ = Date.now();
    } catch (error) {
      console.error(`Error during change cleanup: ${error}`);
    }
  }
  _executeSave() {
    if (this._changes_.size === 0)
      return;
    const pending = new Map(this._changes_);
    this._changes_.clear();
    this.hasChanges = false;
    for (const [k, { action, value }] of pending.entries()) {
      try {
        run(this, k, value, action);
      } catch (error) {
        console.error(`Error saving key "${k}" in database "${this.id}":`, error);
      }
    }
  }
  _clearInMemory() {
    super.clear();
    this._source_.clear();
    this.hasChanges = false;
  }
  get objective() {
    return this._scoreboard_;
  }
  get id() {
    return this._scoreboard_.id;
  }
  get loaded() {
    return this._loaded_;
  }
  get type() {
    return "DefaultJsonType";
  }
  get loadingAwaiter() {
    return this._loadingPromise_ ?? this.loadAsync();
  }
  cleanup() {
    if (this._loaded_) {
      this._cleanupChanges();
    }
    return this;
  }
  getStats() {
    return {
      size: this.length,
      pendingChanges: this._changes_.size,
      loaded: this._loaded_,
      saveMode: this._saveMode_,
      lastCleanup: this._lastCleanup_,
      id: this.id
    };
  }
  rebuild() {
    if (this.objective?.isValid())
      return this;
    try {
      const entries = Array.from(super.entries());
      const pendingBackup = new Map(this._changes_);
      this._clearInMemory();
      try {
        const existingObj = scoreboard.getObjective(this._nameId_);
        if (existingObj) {
          scoreboard.removeObjective(this._nameId_);
        }
      } catch (e) {
      }
      const newScores = scoreboard.addObjective(this._nameId_, this._nameId_);
      this._scoreboard_ = newScores;
      for (const [k, v] of entries) {
        try {
          const serializedValue = this._parser_.stringify(v);
          const singleStr = `${k}${split}${serializedValue}`;
          if (singleStr.length <= 240) {
            newScores.setScore(singleStr, 0);
            this._source_.set(k, singleStr);
          } else {
            const totalChunks = Math.ceil(serializedValue.length / CHUNK_SIZE);
            const parts = [];
            for (let i = 0; i < totalChunks; i++) {
              const chunkData = safeSubstring(serializedValue, i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
              const partString = `${CHUNK_PREFIX}${split}${k}${split}${i}${split}${totalChunks}${split}${chunkData}`;
              parts.push(partString);
              newScores.setScore(partString, 0);
            }
            this._source_.set(k, parts);
          }
          super.set(k, v);
        } catch (entryError) {
          console.error(`Error rebuilding entry "${k}" in database "${this._nameId_}":`, entryError);
        }
      }
      this._changes_ = pendingBackup;
      if (this._changes_.size > 0)
        this.hasChanges = true;
    } catch (error) {
      console.error(`Critical error during database rebuild: ${error}`);
    }
    return this;
  }
  async rebuildAsync() {
    return this.rebuild();
  }
};
var JsonDatabase = class extends ScoreboardDatabaseManager {
  get type() {
    return "JsonType";
  }
};
var Database = class {
  #onSetCallback = [];
  Database;
  constructor(name) {
    this.Database = new JsonDatabase(name).load();
  }
  get length() {
    return this.Database.length;
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
    return Array.from(this.Database.keys());
  }
  values() {
    return Array.from(this.Database.values());
  }
  entries() {
    return Array.from(this.Database.entries());
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
import { world as world2, system as system2, Player } from "@minecraft/server";
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
  return system2.runTimeout(callback, ticks);
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
  const isStrong = locKey.includes(".strong");
  const isLong = locKey.includes(".long");
  const cleanKey = locKey.replace(/^%?potion\./, "").replace(/^effect\./, "").replace(/\.name$/, "").replace(/\.strong$/, "").replace(/\.long$/, "").replace(/\.splash$/, "").replace(/\.lingering$/, "");
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
  if (cleanKey === "water") {
    if (forSign) {
      return sellItem.typeId === "minecraft:potion" ? "Water Bottle" : sellItem.typeId === "minecraft:splash_potion" ? "SW Water" : "LW Water";
    } else {
      return sellItem.typeId === "minecraft:potion" ? "Water Bottle" : sellItem.typeId === "minecraft:splash_potion" ? "Splash Water Bottle" : "Lingering Water Bottle";
    }
  }
  if (cleanKey === "awkward") {
    if (forSign) {
      return sellItem.typeId === "minecraft:potion" ? "Awkward Potion" : sellItem.typeId === "minecraft:splash_potion" ? "SA Awkward" : "LA Awkward";
    } else {
      return sellItem.typeId === "minecraft:potion" ? "Awkward Potion" : sellItem.typeId === "minecraft:splash_potion" ? "Splash Awkward Potion" : "Lingering Awkward Potion";
    }
  }
  if (cleanKey === "thick") {
    return forSign ? sellItem.typeId === "minecraft:potion" ? "Thick Potion" : sellItem.typeId === "minecraft:splash_potion" ? "S.Thick" : "L.Thick" : "Thick Potion";
  }
  if (cleanKey === "mundane") {
    return forSign ? sellItem.typeId === "minecraft:potion" ? "Mundane Potion" : sellItem.typeId === "minecraft:splash_potion" ? "S.Mundane" : "L.Mundane" : "Mundane Potion";
  }
  const effectNames = forSign ? shortEffectNames : fullEffectNames;
  const baseEffect = effectNames[cleanKey] || cleanKey.charAt(0).toUpperCase() + cleanKey.slice(1).replace(/_/g, " ");
  let displayName = "";
  if (forSign) {
    const prefix = sellItem.typeId === "minecraft:splash_potion" ? "SP" : sellItem.typeId === "minecraft:lingering_potion" ? "LP" : "P";
    displayName = `${prefix} ${baseEffect}`;
    if (isStrong)
      displayName += " II";
    if (isLong)
      displayName += "+";
  } else {
    const containerName = sellItem.typeId === "minecraft:splash_potion" ? "Splash Potion of" : sellItem.typeId === "minecraft:lingering_potion" ? "Lingering Potion of" : "Potion of";
    displayName = `${containerName} ${baseEffect}`;
    if (isStrong)
      displayName += " II";
    if (isLong)
      displayName += " (Long)";
  }
  return displayName;
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
    if (sellLocKey && (sellLocKey.includes("tipped_arrow") || sellLocKey.includes("effect"))) {
      const isStrong = sellLocKey.includes(".strong");
      const isLong = sellLocKey.includes(".long");
      const cleanEffect = sellLocKey.replace(/^%?item\.tipped_arrow\.effect\./, "").replace(/^%?tipped_arrow\.effect\./, "").replace(/\.name$/, "").replace(/\.strong$/, "").replace(/\.long$/, "");
      const mappedName = tippedArrowMapping[cleanEffect];
      const baseName = mappedName || `Arrow of ${cleanEffect.charAt(0).toUpperCase() + cleanEffect.slice(1).replace(/_/g, " ")}`;
      if (isStrong) {
        itemName = `${baseName} II`;
      } else if (isLong) {
        itemName = `${baseName} (Long)`;
      } else {
        itemName = baseName;
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
import { world as world3, system as system3, Player as Player2, ItemStack as ItemStack2 } from "@minecraft/server";
var protectedBlockTypes = new Set(config_default.containers);
world3.afterEvents.playerPlaceBlock.subscribe((event) => {
  try {
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
                  system3.runTimeout(() => {
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
  } catch (e) {
    console.warn(`[Protection PlaceBlock] Error: ${e} - Stack: ${e.stack}`);
  }
});
world3.beforeEvents.explosion.subscribe((e) => {
  try {
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
  } catch (err) {
    console.warn(`[Protection Explosion] Error: ${err} - Stack: ${err.stack}`);
  }
});
if ("pistonActivate" in world3.beforeEvents) {
  world3.beforeEvents.pistonActivate.subscribe((e) => {
    try {
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
    } catch (err) {
      console.warn(`[Protection Piston] Error: ${err} - Stack: ${err.stack}`);
    }
  });
}
world3.beforeEvents.playerBreakBlock.subscribe((a) => {
  try {
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
              system3.runTimeout(() => {
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
              system3.runTimeout(() => {
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
              system3.runTimeout(() => {
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
              system3.runTimeout(() => {
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
  } catch (e) {
    console.warn(`[Protection BreakBlock] Error: ${e} - Stack: ${e.stack}`);
  }
});
world3.beforeEvents.playerInteractWithBlock.subscribe((t) => {
  try {
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
              system3.runTimeout(() => {
                player.playSound("note.bass");
                player.onScreenDisplay.setActionBar(`\xA7e${ownerName} \xA7clocked this chest.`);
              }, 1);
              return;
            }
          }
        }
      }
    }
  } catch (e) {
    console.warn(`[Protection OpenChest] Error: ${e} - Stack: ${e.stack}`);
  }
});
world3.beforeEvents.itemUse.subscribe(({ source, itemStack }) => {
  try {
    if (!(source instanceof Player2) || !itemStack)
      return;
    if (itemStack.typeId !== "je:chest_lock_1" && itemStack.typeId !== "je:chest_lock_2")
      return;
    system3.runTimeout(() => {
      try {
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
      } catch (innerErr) {
        console.warn(`[Protection LockKey Timeout] Error: ${innerErr} - Stack: ${innerErr.stack}`);
      }
    }, 1);
  } catch (e) {
    console.warn(`[Protection LockKey] Error: ${e} - Stack: ${e.stack}`);
  }
});

// src/shop.ts
import { ItemStack as ItemStack3, Player as Player3, world as world4, system as system4 } from "@minecraft/server";
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
  system4.runTimeout(() => {
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
      system4.runTimeout(() => {
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
          let itemAmount = 0, itemName = "\xA7cNo Item Yet\xA7r", hasNametag = false, enchants = {}, sell = null;
          if ("error" in processResult && processResult.error) {
            if (processResult.error === "SHOP EMPTY") {
            } else {
              player.sendMessage(`\xA7cThis shop cannot be created. Error: ${processResult.error}.`);
              player.playSound("note.bass");
              targetSign?.setType("minecraft:air");
              return;
            }
          } else {
            const result = processResult;
            itemAmount = result.itemAmount;
            itemName = result.itemName;
            hasNametag = result.hasNametag;
            enchants = result.enchants;
            sell = result.sell;
          }
          if (sell && (sell.typeId === "minecraft:potion" || sell.typeId === "minecraft:splash_potion" || sell.typeId === "minecraft:lingering_potion")) {
            itemName = getPotionDisplayName(sell, true);
          }
          let exT = `${encode(`x${block.location.x}y${block.location.y}z${block.location.z}r`)}`;
          let text = signComp.getText().replace("\xA7b\xA7i\xA7n\xA7d\xA7r", exT);
          let split2 = text.split("\n");
          if (hasNametag) {
            itemName = "\xA7o" + itemName;
          }
          let enchantAmount = Object.keys(enchants).length;
          if (itemName == "Enchanted Book" && enchantAmount > 0) {
            let enchantName = displayFormat(Object.keys(enchants)[0]);
            let more = enchantAmount > 1 ? "+" : "";
            itemName = `\xA7o\xA75${enchantName} \xA7r\xA7o${romanize(enchants[Object.keys(enchants)[0]])} \xA7l\xA72${more}\xA7r`;
          }
          let earn = split2[1].substring(0, split2[1].indexOf(`\xA7r`));
          split2[1] = `${earn}\xA7r${itemName}`;
          split2[3] = itemAmount > 0 ? `${itemAmount}x left\xA7r` : "\xA7l\xA74OUT OF STOCK\xA7r";
          text = split2.join("\n");
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
      let split2 = text.split("\n");
      let data = split2[0].substring(0, split2[0].indexOf(`\xA7r||`)).replace(/§/g, "").toLowerCase();
      let ownerName = split2[0].substring(split2[0].indexOf(`|`), split2[0].length - 4).replace(/[|]/g, "").trim();
      if (data && dyes.includes(sign.itemStack?.typeId || "") && player.name == ownerName) {
        sign.cancel = false;
        return;
      }
      if (data) {
        sign.cancel = true;
      }
      if (config_default.signConfig.includes(split2[0].toLowerCase())) {
        sign.cancel = true;
        activeTransactions.set(coordsKey, true);
        system4.runTimeout(() => {
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
      const isStick = sign.itemStack && sign.itemStack.typeId === "minecraft:stick";
      if ((player.isSneaking || isStick) && data.startsWith("x", 0) && (player.name == ownerName || player.hasTag(config_default.adminTag))) {
        sign.cancel = true;
        activeTransactions.set(coordsKey, true);
        system4.runTimeout(async () => {
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
            let itemAmount = 0, itemName = "", enchants = {}, sell = null, hasNametag = false;
            const signLines = content.getText().split("\n");
            const existingItemName = signLines[1].substring(signLines[1].indexOf("\xA7r") + 2);
            if ("error" in processResult && processResult.error) {
              if (processResult.error === "SHOP EMPTY") {
                itemAmount = 0;
                itemName = existingItemName || "\xA7cNo Item Yet\xA7r";
              } else {
                player.sendMessage(`\xA7cThis shop has an error: ${processResult.error}.`);
                signLines[3] = `\xA7cSHOP ERROR`;
                content.setText(signLines.join("\n"));
                return;
              }
            } else {
              const result = processResult;
              itemAmount = result.itemAmount;
              itemName = result.itemName;
              enchants = result.enchants;
              sell = result.sell;
              hasNametag = result.hasNametag;
            }
            let iname = itemName;
            let signItemName = itemName;
            if (sell && (sell.typeId === "minecraft:potion" || sell.typeId === "minecraft:splash_potion" || sell.typeId === "minecraft:lingering_potion")) {
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
            let earnText = split2[1].substring(0, split2[1].indexOf(`\xA7r`));
            let oldText = content?.getText().split("\n");
            split2[1] = `${earnText}\xA7r${itemName}`;
            split2[3] = itemAmount > 0 ? `${itemAmount}x left\xA7r` : "\xA7l\xA74OUT OF STOCK\xA7r";
            content.setText(split2.join("\n"));
            if (split2[3] !== oldText[3] || split2[1] !== oldText[1]) {
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

\uE102 \xA77price each:\xA7r ${split2[2]}

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
                split2[2] = `${priceDisplay}\xA7r`;
                content.setText(split2.join("\n"));
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
          system4.runTimeout(() => {
            addScore(player, config_default.currency, 0);
          }, 1);
        }
        if ((player.name == ownerName || player.hasTag(config_default.adminTag)) && player.isSneaking)
          return;
        activeTransactions.set(coordsKey, true);
        system4.runTimeout(async () => {
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
              let itemAmount = 0, itemName = "", enchants = {}, sell = null, hasNametag = false;
              const signLines = content.getText().split("\n");
              if ("error" in processResult && processResult.error) {
                if (processResult.error === "SHOP EMPTY") {
                  signLines[3] = "\xA7l\xA74OUT OF STOCK\xA7r";
                  content.setText(signLines.join("\n"));
                  player.sendMessage("\uE201 \xA7cThis shop is currently out of stock!\xA7r");
                  player.playSound("note.bass");
                  return;
                } else {
                  player.sendMessage(`\xA7cThis shop has an error (${processResult.error}).`);
                  signLines[3] = `\xA7cSHOP ERROR`;
                  content.setText(signLines.join("\n"));
                  player.playSound("note.bass");
                  return;
                }
              } else {
                const result = processResult;
                itemAmount = result.itemAmount;
                itemName = result.itemName;
                enchants = result.enchants;
                sell = result.sell;
                hasNametag = result.hasNametag;
              }
              let iname = itemName;
              let signItemName = itemName;
              if (sell && (sell.typeId === "minecraft:potion" || sell.typeId === "minecraft:splash_potion" || sell.typeId === "minecraft:lingering_potion")) {
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
              let earnText = split2[1].substring(0, split2[1].indexOf(`\xA7r`));
              let oldText = content?.getText().split("\n");
              split2[1] = `${earnText}\xA7r${itemName}`;
              split2[3] = itemAmount > 0 ? `${itemAmount}x left\xA7r` : "\xA7l\xA74OUT OF STOCK\xA7r";
              content.setText(split2.join("\n"));
              if (split2[3] !== oldText[3] || split2[1] !== oldText[1]) {
                player.onScreenDisplay.setActionBar("\xA7aSign Stock Updated");
                player.playSound("note.hat");
                return;
              }
              if (split2[3] == "\xA7l\xA74OUT OF STOCK\xA7r") {
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

 \xA77price each:\xA7r ${split2[2]}

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
              const priceVal = parseInt(split2[2].replace(/\D/g, "")) || 0;
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
              split2[3] = newStock > 0 ? `${newStock}x left\xA7r` : "\xA7l\xA74OUT OF STOCK\xA7r";
              let totalEarned = parseInt(split2[1].substring(0, split2[1].indexOf(`\xA7r`)).replace(/\D/g, "")) || 0;
              split2[1] = `${encode(`${totalEarned + total}`)}\xA7r${itemName}`;
              content.setText(split2.join("\n"));
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
  system4.runTimeout(() => {
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
  let split2 = text.split("\n");
  let firstLine = split2[0];
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
    system4.runTimeout(() => {
      const signLines = signComp.getText().split("\n");
      let itemAmount = 0, itemName = "", enchants = {}, hasNametag = false, sell = null;
      const existingItemName = signLines[1].substring(signLines[1].indexOf("\xA7r") + 2);
      if ("error" in processResult && processResult.error) {
        if (processResult.error === "SHOP EMPTY") {
          signLines[3] = "\xA7l\xA74OUT OF STOCK\xA7r";
          signComp.setText(signLines.join("\n"));
        } else {
          signLines[3] = `\xA7cSHOP ERROR`;
          signComp.setText(signLines.join("\n"));
        }
        return;
      } else {
        const result = processResult;
        itemAmount = result.itemAmount;
        itemName = result.itemName;
        enchants = result.enchants;
        hasNametag = result.hasNametag;
        sell = result.sell;
      }
      let signItemName = itemName;
      if (sell && (sell.typeId === "minecraft:potion" || sell.typeId === "minecraft:splash_potion" || sell.typeId === "minecraft:lingering_potion")) {
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
world4.beforeEvents.itemUse.subscribe((event) => {
  try {
    const { source, itemStack } = event;
    if (!(source instanceof Player3) || !itemStack)
      return;
    if (itemStack.typeId === "minecraft:stick" && source.isSneaking && source.hasTag(config_default.adminTag)) {
      event.cancel = true;
      system4.run(() => {
        try {
          showCurrencyConfigurationForm(source);
        } catch (err) {
          console.warn(`[Shop Admin Config] Error showing form: ${err} - Stack: ${err.stack}`);
        }
      });
    }
  } catch (e) {
    console.warn(`[Shop itemUse] Error: ${e} - Stack: ${e.stack}`);
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
system5.runTimeout(() => {
  initializeWorld();
}, 10);
world5.afterEvents.playerSpawn.subscribe(({ player, initialSpawn }) => {
  if (!initialSpawn)
    return;
  system5.runTimeout(() => {
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
