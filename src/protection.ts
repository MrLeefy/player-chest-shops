import { world, system, Player, ItemStack, Vector3, Block, Dimension } from '@minecraft/server';
import config from './config';
import { iName } from './utility';

const protectedBlockTypes = new Set<string>(config.containers);

// 1. PISTON PLACEMENT PROTECTION
world.afterEvents.playerPlaceBlock.subscribe(event => {
    const player = event.player;
    const block = event.block;
    const radius = 5;

    if (block.typeId !== 'minecraft:piston' && block.typeId !== 'minecraft:sticky_piston') return;

    const checkLocations: Vector3[] = [];
    for (let x = -radius; x <= radius; x++) {
        for (let y = -radius; y <= radius; y++) {
            for (let z = -radius; z <= radius; z++) {
                checkLocations.push({ 
                    x: block.location.x + x, 
                    y: block.location.y + y, 
                    z: block.location.z + z 
                });
            }
        }
    }

    const dim = world.getDimension(player.dimension.id);
    for (const checkLocation of checkLocations) {
        if (checkLocation.y < -64 || checkLocation.y >= 320) continue; // Modern Bedrock world height limits

        try {
            const nearbyBlock = dim.getBlock(checkLocation);
            if (nearbyBlock && protectedBlockTypes.has(nearbyBlock.typeId)) {
                const inventory = nearbyBlock.getComponent('inventory') as any;
                if (inventory && inventory.container) {
                    const container = inventory.container;
                    for (let i = 0; i < container.size; i++) {
                        const item = container.getItem(i);
                        if (item?.typeId === 'je:chest_lock_2') {
                            const lore = item.getLore();
                            const ownerName = lore[0]?.substring(2);

                            if (ownerName && ownerName !== player.name && !player.hasTag(config.adminTag)) {
                                // Destroy the piston instantly
                                dim.getBlock(block.location)?.setType("minecraft:air");
                                system.runTimeout(() => {
                                    player.playSound('note.bass');
                                    player.sendMessage(`§e${ownerName} §clocked this area.`);
                                }, 1);
                                return;
                            }
                        }
                    }
                }
            }
        } catch (e) {
            // Block might be in unloaded chunk, ignore
        }
    }
});

// 2. EXPLOSION PROTECTION FOR SHOP CONTAINERS
world.beforeEvents.explosion.subscribe(e => {
    for (const blockPos of e.getImpactedBlocks()) {
        try {
            const block = e.dimension.getBlock(blockPos);
            if (block && protectedBlockTypes.has(block.typeId)) {
                // Check if this chest has a lock inside
                const inventory = block.getComponent('inventory') as any;
                if (inventory && inventory.container) {
                    for (let i = 0; i < inventory.container.size; i++) {
                        const item = inventory.container.getItem(i);
                        if (item?.typeId === 'je:chest_lock_2') {
                            e.cancel = true;
                            return;
                        }
                    }
                }
            }
        } catch (err) {
            // Ignored
        }
    }
});

// 3. PISTON ACTIVATION PROTECTION (BLOCK PISTON MOVEMENT OF LOCKED CHESTS)
// Moved to world.beforeEvents.pistonActivate for proper cancelation support.
if ('pistonActivate' in world.beforeEvents) {
    (world.beforeEvents as any).pistonActivate.subscribe((e: any) => {
        const pistonComp = e.piston.getComponent('piston') as any;
        if (!pistonComp) return;

        try {
            const attachedBlocks = pistonComp.getAttachedBlocks();
            for (const blockLoc of attachedBlocks) {
                const block = e.dimension.getBlock(blockLoc);
                if (block && protectedBlockTypes.has(block.typeId)) {
                    // Check if the block has a lock item inside
                    const inventory = block.getComponent('inventory') as any;
                    if (inventory && inventory.container) {
                        for (let i = 0; i < inventory.container.size; i++) {
                            const item = inventory.container.getItem(i);
                            if (item?.typeId === 'je:chest_lock_2') {
                                e.cancel = true;
                                return;
                            }
                        }
                    }
                }
            }
        } catch (err) {
            // Ignored
        }
    });
}

// 4. BLOCK BREAK PROTECTION (PREVENT BREAKING LOCKED CHESTS OR SIGNS)
world.beforeEvents.playerBreakBlock.subscribe(a => {
    if (!(a.player instanceof Player)) return;
    const { player, block } = a;
    const location = block.location;
    
    // Check if the block being broken is a sign
    if (block.typeId?.endsWith('sign')) {
        const signComponent = block.getComponent('sign') as any;
        const text = signComponent?.getText();
        if (text) {
            const lines = text.split('\n');
            if (lines[0] && lines[0].includes('||')) {
                const ownerName = lines[0].substring(lines[0].indexOf(`|`) + 1).replace(/[|]/g, '').trim();
                const isShopSign = text.includes(config.currencySymbol) || (config.currencyType === 'item' && text.includes(iName(config.currency)));
                
                if (isShopSign && player.name !== ownerName && !player.hasTag(config.adminTag)) {
                    a.cancel = true;
                    system.runTimeout(() => {
                        player.onScreenDisplay.setActionBar('§cYou can\'t break this sign.\n§eInteract to refresh shop');
                    }, 1);
                }
            }
        }
        return;
    }

    // Check if block being broken is a container block with a lock item
    if (block.getComponent('inventory') && protectedBlockTypes.has(block.typeId)) {
        const inventory = block.getComponent('inventory') as any;
        if (inventory && inventory.container) {
            const container = inventory.container;
            for (let i = 0; i < container.size; i++) {
                const item = container.getItem(i);
                if (item?.typeId === 'je:chest_lock_2') {
                    const lore = item.getLore();
                    const ownerName = lore?.[0]?.substring(2);
                    if (ownerName && player.name !== ownerName && !player.hasTag(config.adminTag)) {
                        a.cancel = true;
                        system.runTimeout(() => {
                            player.playSound('note.bass');
                            player.onScreenDisplay.setActionBar(`§cThis chest is protected by §e${ownerName}`);
                        }, 1);
                        return;
                    }
                }
            }
        }
    }

    // Check if breaking block underneath a locked chest
    const blockAbove = world.getDimension(a.player.dimension.id).getBlock({ x: location.x, y: location.y + 1, z: location.z });
    if (blockAbove && protectedBlockTypes.has(blockAbove.typeId)) {
        const chestInventory = blockAbove.getComponent('inventory') as any;
        if (chestInventory && chestInventory.container) {
            for (let i = 0; i < chestInventory.container.size; i++) {
                const item = chestInventory.container.getItem(i);
                if (item?.typeId === 'je:chest_lock_2') {
                    const lore = item.getLore();
                    const ownerName = lore?.[0]?.substring(2);
                    if (ownerName && a.player.name !== ownerName && !a.player.hasTag(config.adminTag)) {
                        a.cancel = true;
                        system.runTimeout(() => {
                            a.player.playSound('note.bass');
                            a.player.onScreenDisplay.setActionBar(`§cThis area is protected by §e${ownerName}`);
                        }, 1);
                        return;
                    }
                }
            }
        }
    }

    // Check adjacent blocks (breaking block behind/under a sign)
    const coords: Vector3[] = [
        { x: location.x + 1, y: location.y, z: location.z }, { x: location.x, y: location.y + 1, z: location.z }, { x: location.x, y: location.y, z: location.z + 1 },
        { x: location.x - 1, y: location.y, z: location.z }, { x: location.x, y: location.y - 1, z: location.z }, { x: location.x, y: location.y, z: location.z - 1 }
    ];

    const dim = world.getDimension(a.player.dimension.id);
    for (const coord of coords) {
        try {
            const adjacentBlock = dim.getBlock(coord);
            if (adjacentBlock && adjacentBlock.typeId.endsWith('sign')) {
                const signComponent = adjacentBlock.getComponent('sign') as any;
                const text = signComponent?.getText();
                if (text && text.includes('||')) {
                    const firstLine = text.split('\n')[0];
                    const owner = firstLine.substring(firstLine.indexOf(`|`)).replace(/[|]/g, '').trim();
                    const isShopSign = text.includes(config.currencySymbol) || (config.currencyType === 'item' && text.includes(iName(config.currency)));
                    if (isShopSign && owner !== a.player.name && !a.player.hasTag(config.adminTag)) {
                        a.cancel = true;
                        system.runTimeout(() => {
                            a.player.playSound('note.bass');
                            a.player.onScreenDisplay.setActionBar(`§cThis block is protected by §7${owner}`);
                        }, 1);
                        break;
                    }
                }
            }
        } catch (e) {
            // Ignored
        }
    }
});

// 5. CHEST OPEN PROTECTION (PREVENT ACCESS TO LOCKED CHESTS)
(world.beforeEvents as any).playerInteractWithBlock.subscribe((t: any) => {
    if (!(t.player instanceof Player)) return;
    const player = t.player;
    const block = t.block;

    if (player.hasTag('binding')) return;

    if (block.getComponent('inventory') && protectedBlockTypes.has(block.typeId)) {
        const inventory = block.getComponent('inventory') as any;
        if (inventory && inventory.container) {
            const container = inventory.container;
            for (let i = 0; i < container.size; i++) {
                const item = container.getItem(i);
                if (item?.typeId === 'je:chest_lock_2') {
                    const lore = item.getLore();
                    const ownerName = lore?.[0]?.substring(2);
                    if (ownerName && player.name !== ownerName && !player.hasTag(config.adminTag)) {
                        t.cancel = true;
                        system.runTimeout(() => {
                            player.playSound('note.bass');
                            player.onScreenDisplay.setActionBar(`§e${ownerName} §clocked this chest.`);
                        }, 1);
                        return;
                    }
                }
            }
        }
    }
});

// 6. ITEM USE (LOCK AND KEY CONFIGURATION)
world.beforeEvents.itemUse.subscribe(({ source, itemStack }) => {
    if (!(source instanceof Player) || !itemStack) return;
    if (itemStack.typeId !== 'je:chest_lock_1' && itemStack.typeId !== 'je:chest_lock_2') return;

    system.runTimeout(() => {
        const playerInv = source.getComponent('inventory') as any;
        if (!playerInv || !playerInv.container) return;

        let lock: ItemStack | undefined = undefined;
        if (itemStack.typeId === 'je:chest_lock_2' && source.isSneaking) {
            lock = new ItemStack('je:chest_lock_1', 1);
            source.onScreenDisplay.setActionBar('Lock Reset');
        } else if (itemStack.typeId === 'je:chest_lock_1' && !source.isSneaking) {
            lock = new ItemStack('je:chest_lock_2', 1);
            lock.setLore([`§7${source.name}`]);
            source.onScreenDisplay.setActionBar(`§aLock Owner set to §e${source.name}`);
        } else return;
        
        source.playSound('random.pop');
        playerInv.container.setItem(source.selectedSlotIndex, lock);
    }, 1);
});
