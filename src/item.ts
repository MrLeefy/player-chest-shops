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
    
    // Handle effect potions with different names for signs vs UI
    if (locKey.includes('potion.effect.')) {
        const effectName = locKey.replace('potion.effect.', '');
        
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
        
        const effectNames = forSign ? shortEffectNames : fullEffectNames;
        const properEffect = effectNames[effectName] || effectName.charAt(0).toUpperCase() + effectName.slice(1).replace(/_/g, ' ');
        
        if (forSign) {
            if (sellItem.typeId === 'minecraft:splash_potion') {
                return `SP ${properEffect}`;
            } else if (sellItem.typeId === 'minecraft:lingering_potion') {
                return `LP ${properEffect}`;
            } else {
                return `P ${properEffect}`;
            }
        } else {
            if (sellItem.typeId === 'minecraft:splash_potion') {
                return `Splash Potion of ${properEffect}`;
            } else if (sellItem.typeId === 'minecraft:lingering_potion') {
                return `Lingering Potion of ${properEffect}`;
            } else {
                return `Potion of ${properEffect}`;
            }
        }
    }
    
    // Handle alternative localization key patterns like "%potion.regeneration.splash.name"
    if (locKey.includes('%potion.') && locKey.includes('.name')) {
        const effectMatch = locKey.match(/%potion\.([^.]+)\./);
        if (effectMatch) {
            const effectName = effectMatch[1];
            
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
            
            const effectNames = forSign ? shortEffectNames : fullEffectNames;
            const properEffect = effectNames[effectName] || effectName.charAt(0).toUpperCase() + effectName.slice(1).replace(/_/g, ' ');
            
            if (forSign) {
                if (sellItem.typeId === 'minecraft:splash_potion') {
                    return `SP ${properEffect}`;
                } else if (sellItem.typeId === 'minecraft:lingering_potion') {
                    return `LP ${properEffect}`;
                } else {
                    return `P ${properEffect}`;
                }
            } else {
                if (sellItem.typeId === 'minecraft:splash_potion') {
                    return `Splash Potion of ${properEffect}`;
                } else if (sellItem.typeId === 'minecraft:lingering_potion') {
                    return `Lingering Potion of ${properEffect}`;
                } else {
                    return `Potion of ${properEffect}`;
                }
            }
        }
    }
    
    // Handle special potion types
    if (locKey === 'potion.water') {
        if (forSign) {
            if (sellItem.typeId === 'minecraft:potion') {
                return 'Water Bottle';
            } else if (sellItem.typeId === 'minecraft:splash_potion') {
                return 'SW Water';
            } else if (sellItem.typeId === 'minecraft:lingering_potion') {
                return 'LW Water';
            }
        } else {
            if (sellItem.typeId === 'minecraft:potion') {
                return 'Water Bottle';
            } else if (sellItem.typeId === 'minecraft:splash_potion') {
                return 'Splash Water Bottle';
            } else if (sellItem.typeId === 'minecraft:lingering_potion') {
                return 'Lingering Water Bottle';
            }
        }
    }
    
    if (locKey === 'potion.awkward') {
        if (forSign) {
            if (sellItem.typeId === 'minecraft:splash_potion') {
                return 'SA Awkward';
            } else if (sellItem.typeId === 'minecraft:lingering_potion') {
                return 'LA Awkward';
            } else {
                return 'Awkward Potion';
            }
        } else {
            if (sellItem.typeId === 'minecraft:splash_potion') {
                return 'Splash Awkward Potion';
            } else if (sellItem.typeId === 'minecraft:lingering_potion') {
                return 'Lingering Awkward Potion';
            } else {
                return 'Awkward Potion';
            }
        }
    }
    
    if (locKey === 'potion.thick') {
        if (sellItem.typeId === 'minecraft:splash_potion') {
            return 'S.Thick';
        } else if (sellItem.typeId === 'minecraft:lingering_potion') {
            return 'L.Thick';
        } else {
            return 'Thick Potion';
        }
    }
    
    if (locKey === 'potion.mundane') {
        if (sellItem.typeId === 'minecraft:splash_potion') {
            return 'S.Mundane';
        } else if (sellItem.typeId === 'minecraft:lingering_potion') {
            return 'L.Mundane';
        } else {
            return 'Mundane Potion';
        }
    }
    
    if (locKey.includes('potion.')) {
        const potionType = locKey.replace('potion.', '');
        const capitalizedType = potionType.charAt(0).toUpperCase() + potionType.slice(1).replace(/_/g, ' ');
        
        if (sellItem.typeId === 'minecraft:splash_potion') {
            return `S.${capitalizedType}`;
        } else if (sellItem.typeId === 'minecraft:lingering_potion') {
            return `L.${capitalizedType}`;
        } else {
            return `P.${capitalizedType}`;
        }
    }
    
    return sellItem.nameTag || iName(sellItem.typeId);
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
        if (sellLocKey && sellLocKey.includes('tipped_arrow.effect.')) {
            const effectName = sellLocKey.replace('tipped_arrow.effect.', '');
            const mappedName = tippedArrowMapping[effectName];
            
            if (mappedName) {
                itemName = mappedName;
            } else {
                itemName = `Arrow of ${effectName.charAt(0).toUpperCase() + effectName.slice(1).replace(/_/g, ' ')}`;
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
