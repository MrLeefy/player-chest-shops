import { ItemStack, Container } from '@minecraft/server';
import { iName } from './utility';

// Mapping table for tipped arrows - converts effect IDs to proper arrow names (official Minecraft Bedrock names)
const tippedArrowMapping: Record<string, string> = {
    'jump_boost': 'Arrow of Leaping',
    'jump': 'Arrow of Leaping',
    'slowness': 'Arrow of Slowness',
    'swiftness': 'Arrow of Swiftness',
    'speed': 'Arrow of Swiftness',
    'instant_health': 'Arrow of Healing',
    'healing': 'Arrow of Healing',
    'instant_damage': 'Arrow of Harming',
    'harming': 'Arrow of Harming',
    'poison': 'Arrow of Poison',
    'regeneration': 'Arrow of Regeneration',
    'strength': 'Arrow of Strength',
    'weakness': 'Arrow of Weakness',
    'turtle_master': 'Arrow of the Turtle Master',
    'water_breathing': 'Arrow of Water Breathing',
    'invisibility': 'Arrow of Invisibility',
    'night_vision': 'Arrow of Night Vision',
    'fire_resistance': 'Arrow of Fire Resistance',
    'slow_falling': 'Arrow of Slow Falling'
};

export function areItemsIdentical(item1: ItemStack | undefined, item2: ItemStack | undefined): boolean {
    if (!item1 || !item2) return false;
    if (item1.typeId !== item2.typeId) return false;
    if ((item1.nameTag ?? '') !== (item2.nameTag ?? '')) return false;
    
    // For arrows and potions, also compare localizationKey to distinguish between different types
    if (item1.typeId === 'minecraft:arrow' || 
        item1.typeId === 'minecraft:potion' || 
        item1.typeId === 'minecraft:splash_potion' || 
        item1.typeId === 'minecraft:lingering_potion') {
        const locKey1 = (item1 as any).localizationKey ?? '';
        const locKey2 = (item2 as any).localizationKey ?? '';
        if (locKey1 !== locKey2) return false;
    }
    
    const lore1 = item1.getLore()?.join('\n') ?? '';
    const lore2 = item2.getLore()?.join('\n') ?? '';
    if (lore1 !== lore2) return false;

    // Durability check (damage must match strictly)
    const dur1 = item1.getComponent('minecraft:durability') as any;
    const dur2 = item2.getComponent('minecraft:durability') as any;
    if (dur1 || dur2) {
        if (!dur1 || !dur2) return false;
        if (dur1.damage !== dur2.damage) return false;
    }

    // Dyeable check (dyed leather armor RGB color matching)
    const dye1 = item1.getComponent('minecraft:dyeable') as any;
    const dye2 = item2.getComponent('minecraft:dyeable') as any;
    if (dye1 || dye2) {
        if (!dye1 || !dye2) return false;
        const c1 = dye1.color;
        const c2 = dye2.color;
        if (!c1 || !c2) return false;
        if (c1.red !== c2.red || c1.green !== c2.green || c1.blue !== c2.blue) return false;
    }

    // Ominous bottle amplifier check
    const amp1 = item1.getComponent('minecraft:ominous_bottle_amplifier') as any;
    const amp2 = item2.getComponent('minecraft:ominous_bottle_amplifier') as any;
    if (amp1 || amp2) {
        if (!amp1 || !amp2) return false;
        if (amp1.amplifier !== amp2.amplifier) return false;
    }

    // Book content check (written books contents, page counts, author, signature)
    const book1 = item1.getComponent('minecraft:book') as any;
    const book2 = item2.getComponent('minecraft:book') as any;
    if (book1 || book2) {
        if (!book1 || !book2) return false;
        if (book1.isSigned !== book2.isSigned) return false;
        if (book1.author !== book2.author) return false;
        if (book1.pageCount !== book2.pageCount) return false;
        const contents1 = book1.contents ?? [];
        const contents2 = book2.contents ?? [];
        if (contents1.length !== contents2.length) return false;
        for (let i = 0; i < contents1.length; i++) {
            if (contents1[i] !== contents2[i]) return false;
        }
    }

    // Dynamic properties check (for custom addon metadata)
    const keys1 = item1.getDynamicPropertyIds();
    const keys2 = item2.getDynamicPropertyIds();
    if (keys1.length !== keys2.length) return false;
    for (const key of keys1) {
        if (item1.getDynamicProperty(key) !== item2.getDynamicProperty(key)) return false;
    }

    const enchantComponent1 = item1.getComponent('enchantable') as any;
    const enchantComponent2 = item2.getComponent('enchantable') as any;
    const enchants1 = enchantComponent1?.getEnchantments() ?? [];
    const enchants2 = enchantComponent2?.getEnchantments() ?? [];

    if (enchants1.length !== enchants2.length) return false;
    
    for (const e1 of enchants1) {
        if (!enchants2.some((e2: any) => e2.type.id === e1.type.id && e2.level === e1.level)) {
            return false;
        }
    }
    
    return true;
}

export function getPotionDisplayName(sellItem: ItemStack, forSign = false): string {
    const locKey = (sellItem as any).localizationKey;
    if (!locKey) {
        return sellItem.nameTag || iName(sellItem.typeId);
    }
    
    const isStrong = locKey.includes('.strong');
    const isLong = locKey.includes('.long');
    
    // Normalize effect key name
    const cleanKey = locKey.replace(/^%?potion\./, '')
                           .replace(/^effect\./, '')
                           .replace(/\.name$/, '')
                           .replace(/\.strong$/, '')
                           .replace(/\.long$/, '')
                           .replace(/\.splash$/, '')
                           .replace(/\.lingering$/, '');
                           
    const shortEffectNames: Record<string, string> = {
        'jump_boost': 'Leaping',
        'slowness': 'Slow',
        'swiftness': 'Swift',
        'speed': 'Swift',
        'instant_health': 'Heal',
        'healing': 'Heal',
        'instant_damage': 'Harm',
        'harming': 'Harm',
        'poison': 'Poison',
        'regeneration': 'Regen',
        'strength': 'Strength',
        'weakness': 'Weak',
        'turtle_master': 'Turtle',
        'water_breathing': 'W.Breath',
        'invisibility': 'Invis',
        'night_vision': 'N.Vision',
        'fire_resistance': 'F.Resist',
        'slow_falling': 'S.Fall'
    };
    
    const fullEffectNames: Record<string, string> = {
        'jump_boost': 'Leaping',
        'slowness': 'Slowness',
        'swiftness': 'Swiftness',
        'speed': 'Swiftness',
        'instant_health': 'Healing',
        'healing': 'Healing',
        'instant_damage': 'Harming',
        'harming': 'Harming',
        'poison': 'Poison',
        'regeneration': 'Regeneration',
        'strength': 'Strength',
        'weakness': 'Weakness',
        'turtle_master': 'Turtle Master',
        'water_breathing': 'Water Breathing',
        'invisibility': 'Invisibility',
        'night_vision': 'Night Vision',
        'fire_resistance': 'Fire Resistance',
        'slow_falling': 'Slow Falling'
    };
    
    // 1. Handle special base potions (water, awkward, thick, mundane)
    if (cleanKey === 'water') {
        if (forSign) {
            return sellItem.typeId === 'minecraft:potion' ? 'Water Bottle' : 
                   sellItem.typeId === 'minecraft:splash_potion' ? 'SW Water' : 'LW Water';
        } else {
            return sellItem.typeId === 'minecraft:potion' ? 'Water Bottle' : 
                   sellItem.typeId === 'minecraft:splash_potion' ? 'Splash Water Bottle' : 'Lingering Water Bottle';
        }
    }
    
    if (cleanKey === 'awkward') {
        if (forSign) {
            return sellItem.typeId === 'minecraft:potion' ? 'Awkward Potion' : 
                   sellItem.typeId === 'minecraft:splash_potion' ? 'SA Awkward' : 'LA Awkward';
        } else {
            return sellItem.typeId === 'minecraft:potion' ? 'Awkward Potion' : 
                   sellItem.typeId === 'minecraft:splash_potion' ? 'Splash Awkward Potion' : 'Lingering Awkward Potion';
        }
    }
    
    if (cleanKey === 'thick') {
        return forSign ? (sellItem.typeId === 'minecraft:potion' ? 'Thick Potion' : 
                         sellItem.typeId === 'minecraft:splash_potion' ? 'S.Thick' : 'L.Thick') : 'Thick Potion';
    }
    
    if (cleanKey === 'mundane') {
        return forSign ? (sellItem.typeId === 'minecraft:potion' ? 'Mundane Potion' : 
                         sellItem.typeId === 'minecraft:splash_potion' ? 'S.Mundane' : 'L.Mundane') : 'Mundane Potion';
    }
    
    // 2. Handle standard effect potions
    const effectNames = forSign ? shortEffectNames : fullEffectNames;
    const baseEffect = effectNames[cleanKey] || cleanKey.charAt(0).toUpperCase() + cleanKey.slice(1).replace(/_/g, ' ');
    
    let displayName = "";
    if (forSign) {
        const prefix = sellItem.typeId === 'minecraft:splash_potion' ? 'SP' : 
                       sellItem.typeId === 'minecraft:lingering_potion' ? 'LP' : 'P';
        displayName = `${prefix} ${baseEffect}`;
        if (isStrong) displayName += ' II';
        if (isLong) displayName += '+';
    } else {
        const containerName = sellItem.typeId === 'minecraft:splash_potion' ? 'Splash Potion of' : 
                              sellItem.typeId === 'minecraft:lingering_potion' ? 'Lingering Potion of' : 'Potion of';
        displayName = `${containerName} ${baseEffect}`;
        if (isStrong) displayName += ' II';
        if (isLong) displayName += ' (Long)';
    }
    
    return displayName;
}

export interface ProcessedItemResult {
    itemAmount: number;
    itemName: string;
    enchants: Record<string, number>;
    sell: ItemStack;
    hasNametag: boolean;
    error: string | null;
}

export function processItems(container: Container): ProcessedItemResult | { error: string } {
    let sellItem: ItemStack | undefined = undefined;
    let totalAmount = 0;
    
    for (let i = 0; i < container.size; i++) {
        const item = container.getItem(i);
        if (item && item.typeId !== 'je:chest_lock_2') {
            sellItem = item;
            break;
        }
    }

    if (!sellItem) {
        return { error: "SHOP EMPTY" };
    }

    if (sellItem.typeId.includes('shulker_box')) {
        return { error: "SHULKER BOXES CANNOT BE SOLD" };
    }

    if (sellItem.typeId === 'minecraft:filled_map') {
        return { error: "FILLED MAPS CANNOT BE SOLD" };
    }

    for (let i = 0; i < container.size; i++) {
        const item = container.getItem(i);
        if (areItemsIdentical(sellItem, item) && item) {
            totalAmount += item.amount;
        }
    }
    
    const enchantComponent = sellItem.getComponent('enchantable') as any;
    const enchants: Record<string, number> = {};
    const enchantments = enchantComponent?.getEnchantments() ?? [];
    for (const ench of enchantments) {
        enchants[ench.type.id] = ench.level;
    }
    
    let itemName = "";
    const sellLocKey = (sellItem as any).localizationKey;
    if (sellItem.typeId === 'minecraft:arrow') {
        if (sellLocKey && (sellLocKey.includes('tipped_arrow') || sellLocKey.includes('effect'))) {
            const isStrong = sellLocKey.includes('.strong');
            const isLong = sellLocKey.includes('.long');
            const cleanEffect = sellLocKey.replace(/^%?item\.tipped_arrow\.effect\./, '')
                                          .replace(/^%?tipped_arrow\.effect\./, '')
                                          .replace(/\.name$/, '')
                                          .replace(/\.strong$/, '')
                                          .replace(/\.long$/, '');
            const mappedName = tippedArrowMapping[cleanEffect];
            const baseName = mappedName || `Arrow of ${cleanEffect.charAt(0).toUpperCase() + cleanEffect.slice(1).replace(/_/g, ' ')}`;
            
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
    } else if (sellItem.typeId === 'minecraft:potion' || 
               sellItem.typeId === 'minecraft:splash_potion' || 
               sellItem.typeId === 'minecraft:lingering_potion') {
        itemName = getPotionDisplayName(sellItem, false);
    } else {
        itemName = sellItem.nameTag || iName(sellItem.typeId);
    }

    return {
        itemAmount: totalAmount,
        itemName: itemName,
        enchants,
        sell: sellItem,
        hasNametag: !!sellItem.nameTag,
        error: null
    };
}

export function uContainer(objContainer: Record<number, number>, amount: number): [Record<number, number>, number] {
    const newCont = { ...objContainer };
    let remaining = amount;
    
    for (const slotStr in newCont) {
        const slot = parseInt(slotStr);
        if (remaining <= 0) break;
        
        const available = newCont[slot];
        const toTake = Math.min(available, remaining);
        
        newCont[slot] -= toTake;
        remaining -= toTake;
    }
    
    return [newCont, remaining];
}

export function createItemStacks(typeId: string, amount: number): ItemStack[] {
    const stacks: ItemStack[] = [];
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
