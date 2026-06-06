import { ItemStack, Player, world, system, Block, Container, BlockSignComponent } from '@minecraft/server';
import { ActionFormData, MessageFormData, ModalFormData } from '@minecraft/server-ui';
import config from './config';
import { addScore, getScore, resetScore, setScore, subtractScore, iName, encode, romanize, displayFormat } from './utility';
import { database, offlineSalesDB, serverDB } from './import';
import { areItemsIdentical, processItems, uContainer, getPotionDisplayName, createItemStacks } from './item';

const d: Record<number, string> = { 0: `minecraft:overworld`, 1: `minecraft:nether`, 2: `minecraft:the_end` };
const dyes = ['minecraft:glow_ink_sac', 'minecraft:white_dye', 'minecraft:black_dye', 'minecraft:blue_dye', 'minecraft:brown_dye', 'minecraft:cyan_dye', 'minecraft:gray_dye', 'minecraft:green_dye', 'minecraft:light_blue_dye', 'minecraft:light_gray_dye', 'minecraft:lime_dye', 'minecraft:magenta_dye', 'minecraft:orange_dye', 'minecraft:pink_dye', 'minecraft:purple_dye', 'minecraft:red_dye', 'minecraft:yellow_dye'];

// TRANSACTION LOCK MAP TO PREVENT DUPES / RACE CONDITIONS
const activeTransactions = new Map<string, boolean>();
const protectedBlockTypes = new Set<string>(config.containers);

function createAndShowModalForm(player: Player, title: string, textFieldPrompt: string, textFieldPlaceholder: string, defaultValue = '10') {
    const form = new ModalFormData()
        .title(title)
        .textField(textFieldPrompt, textFieldPlaceholder, defaultValue);
    return form.show(player);
}

function bind(hitBlock: Block, player: Player) {
    system.runTimeout(() => {
        let { x, y, z } = hitBlock.location;
        let sD = (hitBlock.dimension.id == 'minecraft:overworld') ? 0 : (hitBlock.dimension.id == 'minecraft:nether') ? 1 : 2;
        setScore(player, 'signX', x);
        setScore(player, 'signY', y);
        setScore(player, 'signZ', z);
        setScore(player, 'signD', sD);
        player.addTag(`binding`);
        player.sendMessage(` §bBinding Mode: §fINTERACT a chest where you want to bind this sign.§r`);
        player.playSound('note.banjo');
        player.onScreenDisplay.setActionBar(`INTERACT a chest to bind with this sign.`);
    }, 1);
}

function displayItemInfoAboveChest(player: Player, item: ItemStack) {
    const enchantComponent = item.getComponent('enchantable') as any;
    const enchantments = enchantComponent?.getEnchantments() || [];
    const lore = item.getLore()?.join('\n') || 'No lore available';
    const nameTag = item.nameTag || iName(item.typeId);

    let enchantmentsText = enchantments.map((e: any) => `${displayFormat(e.type.id)} ${romanize(e.level)}`).join(', ');
    if (!enchantmentsText) enchantmentsText = 'No enchantments';

    let displayText = `§o${nameTag}§r`;
    if (enchantmentsText !== 'No enchantments') {
        displayText += `\nEnchants: ${enchantmentsText}`;
    }
    if (lore !== 'No lore available') {
        displayText += `\nLore: ${lore}`;
    }
    player.sendMessage(displayText);
}

// 1. INTERACT WITH SIGN OR CHEST (MAIN EVENT LISTENER)
(world.beforeEvents as any).playerInteractWithBlock.subscribe((sign: any) => {
    try {
        const player = sign.player;
        const block = sign.block;

        if (!player || !block) return;
        const coordsKey = `${block.location.x},${block.location.y},${block.location.z}`;

        // Stop if this block is currently undergoing a transaction lock
        if (activeTransactions.get(coordsKey)) {
            sign.cancel = true;
            player.onScreenDisplay.setActionBar("§cTransaction in progress... Please wait.");
            return;
        }

        // BINDING CHEST SETUP
        if (player.hasTag('binding') && block.getComponent('inventory') && protectedBlockTypes.has(block.typeId)) {
            sign.cancel = true;
            activeTransactions.set(coordsKey, true);

            system.runTimeout(() => {
                try {
                    const inventoryComp = block.getComponent('inventory') as any;
                    const chestInv = inventoryComp?.container as Container;
                    if (!chestInv) return;

                    let hasLockItem = false;
                    for (let li = 0; li < chestInv.size; li++) {
                        if (chestInv.getItem(li)?.typeId === 'je:chest_lock_2') {
                            hasLockItem = true;
                            break;
                        }
                    }

                    if (!hasLockItem) {
                        const lockItem = new ItemStack('je:chest_lock_2', 1);
                        lockItem.setLore([`§7${player.name}`]);
                        chestInv.addItem(lockItem);
                    }

                    player.removeTag('binding');
                    let signD = d[getScore(player, 'signD')];
                    let chestD = block.dimension.id;
                    if (signD !== chestD) return;

                    let signLoc = { 
                        x: parseInt(getScore(player, 'signX').toString()), 
                        y: parseInt(getScore(player, 'signY').toString()), 
                        z: parseInt(getScore(player, 'signZ').toString()) 
                    };

                    resetScore(player, 'signX');
                    resetScore(player, 'signY');
                    resetScore(player, 'signZ');

                    const targetSign = block.dimension.getBlock(signLoc);
                    const signComp = targetSign?.getComponent('sign') as any;
                    if (!signComp) {
                        player.sendMessage(' §cSign has been broken or missing. Try Again.');
                        player.playSound('mob.creeper.say');
                        return;
                    }
                    
                    const processResult = processItems(chestInv);
                    let itemAmount = 0, itemName = "§cNo Item Yet§r", hasNametag = false, enchants = {}, sell: any = null;
                    if ('error' in processResult && processResult.error) {
                        if (processResult.error === "SHOP EMPTY") {
                            // Empty chest is allowed at creation - defaults to "No Item Yet"
                        } else {
                            player.sendMessage(`§cThis shop cannot be created. Error: ${processResult.error}.`);
                            player.playSound('note.bass');
                            targetSign?.setType('minecraft:air');
                            return;
                        }
                    } else {
                        const result = processResult as any;
                        itemAmount = result.itemAmount;
                        itemName = result.itemName;
                        hasNametag = result.hasNametag;
                        enchants = result.enchants;
                        sell = result.sell;
                    }

                    if (sell && (sell.typeId === 'minecraft:potion' || 
                        sell.typeId === 'minecraft:splash_potion' || 
                        sell.typeId === 'minecraft:lingering_potion')) {
                        itemName = getPotionDisplayName(sell, true);
                    }

                    let exT = `${encode(`x${block.location.x}y${block.location.y}z${block.location.z}r`)}`;
                    let text = signComp.getText().replace('§b§i§n§d§r', exT);
                    let split = text.split('\n');
                    if (hasNametag) { itemName = '§o' + itemName; }
                    let enchantAmount = Object.keys(enchants).length;
                    if (itemName == 'Enchanted Book' && enchantAmount > 0) {
                        let enchantName = displayFormat(Object.keys(enchants)[0]);
                        let more = (enchantAmount > 1) ? '+' : '';
                        itemName = `§o§5${enchantName} §r§o${romanize(enchants[Object.keys(enchants)[0]])} §l§2${more}§r`;
                    }
                    let earn = split[1].substring(0, split[1].indexOf(`§r`));
                    split[1] = `${earn}§r${itemName}`;
                    split[3] = (itemAmount > 0) ? `${itemAmount}x left§r` : '§l§4OUT OF STOCK§r';
                    text = split.join('\n');
                    signComp.setText(text);
                    player.sendMessage(` §bBinding Mode: §aChest & Sign Binded.§r\n§7Chest Location:§r ${block.location.x} ${block.location.y} ${block.location.z}\n§7Sign Location:§r ${signLoc.x} ${signLoc.y} ${signLoc.z}`);
                    player.playSound('note.hat');
                } catch (e) {
                    console.warn(`[Shop Setup] Error binding shop: ${e}`);
                } finally {
                    activeTransactions.delete(coordsKey);
                }
            }, 1);
            return;
        }

        // SIGN ACTIONS
        if (block.typeId.endsWith('sign')) {
            const content = block.getComponent('sign') as any;
            if (!content) return;
            let text = content.getText();
            if (!text) return;
            let split = text.split('\n');
            let data = split[0].substring(0, split[0].indexOf(`§r||`)).replace(/§/g, '').toLowerCase();
            let ownerName = split[0].substring(split[0].indexOf(`|`), split[0].length - 4).replace(/[|]/g, '').trim();

            if (data && (dyes.includes(sign.itemStack?.typeId || '')) && player.name == ownerName) {
                sign.cancel = false;
                return;
            }
            if (data) { sign.cancel = true; }

            // CREATING A NEW SHOP SIGN
            if (config.signConfig.includes(split[0].toLowerCase())) {
                sign.cancel = true;
                activeTransactions.set(coordsKey, true);

                system.runTimeout(() => {
                    let limit = getScore(player, 'signL');
                    let count = getScore(player, 'signC');
                    if (count >= limit) {
                        player.sendMessage(` §cYou can only have ${limit} shops on your current rank!§r`);
                        player.playSound('note.bass');
                        activeTransactions.delete(coordsKey);
                        return;
                    }

                    createAndShowModalForm(player, 'Input PRICE', `\n\nPrice per item`, 'Type your price here', '10').then(e => {
                        try {
                            if (e.canceled || !e.formValues) return;
                            let priceStr = e.formValues[0] as string;
                            let price = Math.round(Math.abs(parseFloat(priceStr.replace(',', ''))));
                            if (price > 2147483647 || isNaN(price) || price <= 0) {
                                player.sendMessage(' §cPrice must be a positive number greater than 0!§r');
                                player.playSound('note.bass');
                                return;
                            }
                            addScore(player, 'signC', 1);
                            const priceDisplay = config.currencyType === 'item' ? `${price}x ${iName(config.currency)}` : `${config.currencySymbol}${price.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
                            content.setText(`${encode('bind')}§r||${player.name}§r||\n§0§r§cNo Item Yet§r\n${priceDisplay}§r\n§l§4OUT OF STOCK§r`);
                            content.setWaxed(true);
                            bind(block, player);
                        } finally {
                            activeTransactions.delete(coordsKey);
                        }
                    });
                }, 1);
                return;
            }

            // ADMIN OR OWNER SIGN INTERACTION (EDITING DETAILS)
            const isStick = sign.itemStack && sign.itemStack.typeId === 'minecraft:stick';
            if ((player.isSneaking || isStick) && data.startsWith('x', 0) && (player.name == ownerName || player.hasTag(config.adminTag))) {
                sign.cancel = true;
                activeTransactions.set(coordsKey, true);

                system.runTimeout(async () => {
                    try {
                        if (!(data.startsWith('x', 0))) return;
                        let decode = /([xyz])(-?\d+)/g, match, vars: any = {};
                        while ((match = decode.exec(data)) !== null) { vars[match[1]] = parseInt(match[2]); }
                        let { x, y, z } = vars;
                        let chest = player.dimension.getBlock({ x: x, y: y, z: z });
                        const chestInventoryComp = chest?.getComponent('inventory') as any;
                        if (!chestInventoryComp || !chestInventoryComp.container) {
                            player.sendMessage(` §cChest is missing or has been broken!§r`);
                            player.playSound('note.bass');
                            return;
                        }
                        
                        const processResult = processItems(chestInventoryComp.container);
                        let itemAmount = 0, itemName = "", enchants = {}, sell: any = null, hasNametag = false;
                        const signLines = content.getText().split('\n');
                        const existingItemName = signLines[1].substring(signLines[1].indexOf('§r') + 2);

                        if ('error' in processResult && processResult.error) {
                            if (processResult.error === "SHOP EMPTY") {
                                itemAmount = 0;
                                itemName = existingItemName || "§cNo Item Yet§r";
                            } else {
                                player.sendMessage(`§cThis shop has an error: ${processResult.error}.`);
                                signLines[3] = `§cSHOP ERROR`;
                                content.setText(signLines.join('\n'));
                                return;
                            }
                        } else {
                            const result = processResult as any;
                            itemAmount = result.itemAmount;
                            itemName = result.itemName;
                            enchants = result.enchants;
                            sell = result.sell;
                            hasNametag = result.hasNametag;
                        }
                        let iname = itemName;
                        
                        let signItemName = itemName;
                        if (sell && (sell.typeId === 'minecraft:potion' || 
                            sell.typeId === 'minecraft:splash_potion' || 
                            sell.typeId === 'minecraft:lingering_potion')) {
                            signItemName = getPotionDisplayName(sell, true);
                        } else if (itemName.replace(/§\w/g, '').length > 17) {
                            if (itemName.split(' ').length > 1) {
                                let words = itemName.split(' '); let lastW = words.pop() as string;
                                signItemName = `${words.map((w: string)=>w.charAt(0).toUpperCase()).join('.')}. ${lastW}`;
                            } else {
                                signItemName = itemName.toLowerCase().split('').filter((char: string) => !'aeiou'.includes(char)).join('');
                            }
                        }
                        
                        itemName = signItemName;
                        if (hasNametag) { itemName = '§o' + itemName; }
                        if (itemName == 'Enchanted Book' && Object.keys(enchants).length > 0) {
                            let enchantName = displayFormat(Object.keys(enchants)[0]);
                            let more = (Object.keys(enchants).length > 1) ? '+' : '';
                            itemName = `§o§5${enchantName} §r§o${romanize(enchants[Object.keys(enchants)[0]])} §l§2${more}§r`;
                        }
                        let earnText = split[1].substring(0, split[1].indexOf(`§r`));
                        let oldText = content?.getText().split('\n');
                        split[1] = `${earnText}§r${itemName}`;
                        split[3] = (itemAmount > 0) ? `${itemAmount}x left§r` : '§l§4OUT OF STOCK§r';
                        content.setText(split.join('\n'));
                        if ((split[3] !== oldText[3]) || (split[1] !== oldText[1])) {
                            player.onScreenDisplay.setActionBar('§aSign Stock Updated');
                            player.playSound('note.hat');
                            return;
                        }
                        let earnVal = parseInt(earnText.replace(/\D/g, '')) || 0;

                        let f = new ActionFormData();
                        f.title(`§l[ ${player.name}'s Shop ]`);
                        const incomeDisplay = config.currencyType === 'item' ? `${earnVal} ${iName(config.currency)}` : `${config.currencySymbol}${earnVal.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
                        f.body(`\n§3[ INFO ]§r\n\nChest Location:§7 ${x} ${y} ${z}§r\n\n §7Item Name:§r ${iname}\n(${sell.typeId})\n\n §7Stock Left:§r ${itemAmount}x\n\n §7price each:§r ${split[2]}\n\n§3TOTAL INCOME SALES: §e §r${incomeDisplay}\n\n`);
                        f.button('Edit Price');
                        
                        const pendingSales = offlineSalesDB.get(player.name);
                        let hasPendingSales = pendingSales && Object.keys(pendingSales).length > 0;

                        if (hasPendingSales) {
                            f.button('§aRetrieve Offline Funds');
                        }
                        f.button('§4Delete Shop');
                        
                        const response = await f.show(player);
                        if (response.canceled) return;
                                                    
                        if (response.selection === 0) {
                            createAndShowModalForm(player, 'Input PRICE', `\n\nPrice ${config.currencySymbol}`, 'Type your price here', '10').then(e => {
                                if (e.canceled || !e.formValues) return; 
                                let priceStr = e.formValues[0] as string; 
                                let price = Math.round(Math.abs(parseFloat(priceStr.replace(',', ''))));
                                if (price > 2147483647 || isNaN(price) || price <= 0) {
                                    player.sendMessage(' §cPrice must be a positive number greater than 0!§r');
                                    player.playSound('note.bass');
                                    return;
                                }
                                const priceDisplay = config.currencyType === 'item' ? `${price}x ${iName(config.currency)}` : `${config.currencySymbol}${price.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
                                split[2] = `${priceDisplay}§r`;
                                content.setText(split.join('\n'));
                                player.sendMessage(' §aPrice successfully updated.§r'); 
                                player.playSound('note.hat');
                            });
                        } else if (response.selection === 1 && hasPendingSales) {
                            const salesData = offlineSalesDB.get(player.name); 
                            if (!salesData) return;
                            
                            const playerInvComp = player.getComponent('inventory') as any;
                            const playerInv = playerInvComp?.container as Container;
                            if (!playerInv) return;

                            const itemsToGive: ItemStack[] = [];
                            for (const itemId in salesData) { 
                                if (salesData[itemId] > 0) itemsToGive.push(...createItemStacks(itemId, salesData[itemId])); 
                            }
                            
                            let successfullyGiven: Record<string, number> = {};
                            for (const itemStack of itemsToGive) {
                                const leftover = playerInv.addItem(itemStack);
                                const givenAmount = itemStack.amount - (leftover?.amount ?? 0);
                                if (givenAmount > 0) {
                                    if (!successfullyGiven[itemStack.typeId]) successfullyGiven[itemStack.typeId] = 0;
                                    successfullyGiven[itemStack.typeId] += givenAmount;
                                }
                            }
                            
                            let newSalesData = { ...salesData }; 
                            let allFundsRetrieved = true;
                            for (const itemId in successfullyGiven) {
                                newSalesData[itemId] -= successfullyGiven[itemId];
                                if (newSalesData[itemId] <= 0) delete newSalesData[itemId];
                            }
                            if (Object.keys(newSalesData).length === 0) {
                                offlineSalesDB.delete(player.name);
                            } else {
                                allFundsRetrieved = false;
                                offlineSalesDB.set(player.name, newSalesData);
                            }
                            player.sendMessage("§aOffline funds retrieved!"); 
                            player.playSound("random.orb");
                            if (!allFundsRetrieved) player.sendMessage("§cYour inventory was full. Some items could not be retrieved. Clear space and try again.");
                        } else { 
                            let g = new MessageFormData().title('§c§lDelete Shop').body('\n§rAre you sure you want to remove this shop?').button1('Cancel').button2('Delete');
                            const g_res = await g.show(player);
                            if (g_res.canceled || g_res.selection == 0) return;
                            
                            try {
                                const currentCount = getScore(ownerName, 'signC');
                                if (currentCount > 0) {
                                    setScore(ownerName, 'signC', currentCount - 1);
                                }
                            } catch (e) {
                                console.warn(`Failed to decrement shop count on UI deletion: ${e}`);
                            }

                            block.setType('minecraft:air');
                            player.playSound('random.levelup', { pitch: 2 });
                            player.sendMessage(' §aSign successfully deleted.§r');
                        }
                    } catch (e) {
                        console.warn(`[Shop Admin] Error in sign panel: ${e}`);
                    } finally {
                        activeTransactions.delete(coordsKey);
                    }
                }, 1);
                return;
            }

            // CUSTOMER INTERACTION (BUYING ITEMS) - STAGE 1
            if (data.startsWith('x', 0) || data == 'bind') {
                sign.cancel = true;
                if (config.currencyType === 'scoreboard') {
                    system.runTimeout(() => { addScore(player, config.currency, 0); }, 1);
                }
                if ((player.name == ownerName || player.hasTag(config.adminTag)) && (player.isSneaking)) return;
                
                activeTransactions.set(coordsKey, true);

                system.runTimeout(async () => {
                    try {
                        if (data.startsWith('x', 0)) {
                            let decode = /([xyz])(-?\d+)|d(\w+)/g, match, vars: any = {d: 'minecraft:overworld'};
                            while ((match = decode.exec(data)) !== null) { if(match[3]) vars['d'] = match[3]; else vars[match[1]] = parseInt(match[2]); }
                            let { x, y, z, d } = vars;
                            let chest = world.getDimension(d).getBlock({ x: x, y: y, z: z });
                            const chestInventoryComp = chest?.getComponent('inventory') as any;
                            if (!chestInventoryComp || !chestInventoryComp.container) {
                                player.sendMessage(' §cChest is missing or has been broken!§r');
                                player.playSound('note.bass');
                                return;
                            }

                            const container = chestInventoryComp.container as Container;
                            const processResult = processItems(container);
                            let itemAmount = 0, itemName = "", enchants = {}, sell: any = null, hasNametag = false;
                            const signLines = content.getText().split('\n');

                            if ('error' in processResult && processResult.error) {
                                if (processResult.error === "SHOP EMPTY") {
                                    signLines[3] = '§l§4OUT OF STOCK§r';
                                    content.setText(signLines.join('\n'));
                                    player.sendMessage(' §cThis shop is currently out of stock!§r');
                                    player.playSound('note.bass');
                                    return;
                                } else {
                                    player.sendMessage(`§cThis shop has an error (${processResult.error}).`);
                                    signLines[3] = `§cSHOP ERROR`;
                                    content.setText(signLines.join('\n'));
                                    player.playSound('note.bass');
                                    return;
                                }
                            } else {
                                const result = processResult as any;
                                itemAmount = result.itemAmount;
                                itemName = result.itemName;
                                enchants = result.enchants;
                                sell = result.sell;
                                hasNametag = result.hasNametag;
                            }
                            let iname = itemName;
                            
                            let signItemName = itemName;
                            if (sell && (sell.typeId === 'minecraft:potion' || 
                                sell.typeId === 'minecraft:splash_potion' || 
                                sell.typeId === 'minecraft:lingering_potion')) {
                                signItemName = getPotionDisplayName(sell, true);
                            } else if (itemName.replace(/§\w/g, '').length > 17) {
                                if (itemName.split(' ').length > 1) {
                                    let words = itemName.split(' '); let lastW = words.pop() as string;
                                    signItemName = `${words.map((w: string) => w.charAt(0).toUpperCase()).join('.')}. ${lastW}`;
                                } else {
                                    signItemName = itemName.toLowerCase().split('').filter((char: string) => !'aeiou'.includes(char)).join('');
                                }
                            }
                            
                            itemName = signItemName;
                            if (hasNametag) { itemName = '§o' + itemName; }
                            if (itemName == 'Enchanted Book' && Object.keys(enchants).length > 0) {
                                let enchantName = displayFormat(Object.keys(enchants)[0]);
                                let more = (Object.keys(enchants).length > 1) ? '+' : '';
                                itemName = `§o§5${enchantName} §r§o${romanize(enchants[Object.keys(enchants)[0]])} §l§2${more}§r`;
                            }
                            let earnText = split[1].substring(0, split[1].indexOf(`§r`));
                            let oldText = content?.getText().split('\n');
                            split[1] = `${earnText}§r${itemName}`;
                            split[3] = (itemAmount > 0) ? `${itemAmount}x left§r` : '§l§4OUT OF STOCK§r';
                            content.setText(split.join('\n'));
                            if ((split[3] !== oldText[3]) || (split[1] !== oldText[1])) {
                                player.onScreenDisplay.setActionBar('§aSign Stock Updated');
                                player.playSound('note.hat');
                                return;
                            }
                            if (split[3] == '§l§4OUT OF STOCK§r') {
                                player.playSound('note.bass');
                                return;
                            }

                            // SHOW BUYING QUANTITY SELECTION
                            let buy = new ModalFormData().title(`§l[ ${ownerName}'s Shop ]`);
                            let durabilityText = 'N/A';
                            let durabilityComponent = sell.getComponent('durability') as any;
                            if (durabilityComponent) {
                                const currentDurability = durabilityComponent.maxDurability - durabilityComponent.damage;
                                const maxDurability = durabilityComponent.maxDurability;
                                const percentage = currentDurability / maxDurability;
                                
                                const barWidth = 50;
                                const greenBars = Math.round(percentage * barWidth);
                                const greyBars = barWidth - greenBars;
                                
                                const greenBar = '§a' + '|'.repeat(greenBars);
                                const greyBar = '§7' + '|'.repeat(greyBars);
                                const durabilityBar = greenBar + greyBar + '§r';
                                const percentageText = `${Math.round(percentage * 100)}%`;
                                durabilityText = `${currentDurability}/${maxDurability}\n${durabilityBar}\n${percentageText}`;
                            }
                            let itemLore = sell.getLore().length > 0 ? sell.getLore().join('\n') : 'N/A';
                            let enchantmentsText = Object.keys(enchants).map(ench => `§d${displayFormat(ench)} §e${romanize(enchants[ench])}§r`).join(`\n`) || 'N/A';
                            
                            let formText = `\n\n §7Item Name:§r ${iname}\n(${sell.typeId})\n\n`;
                            if (durabilityText !== 'N/A') {
                                formText += ` §7Durability:§r\n${durabilityText}\n\n`;
                            }
                            if (enchantmentsText !== 'N/A') {
                                formText += ` §7Enchants:§r\n${enchantmentsText}\n\n`;
                            }
                            if (itemLore !== 'N/A') {
                                formText += ` §7Lore:§r\n${itemLore}\n\n`;
                            }
                            formText += ` §7Stock Left:§r ${itemAmount}x\n\n §7price each:§r ${split[2]}\n\nHow many do you want to buy?`;
                            buy.textField(formText, 'Type amount here', '1');
                            
                            const buyResponse = await buy.show(player);
                            if (buyResponse.canceled || !buyResponse.formValues) return;
                            
                            let amountStr = buyResponse.formValues[0] as string; 
                            let amount = Math.round(Math.abs(parseFloat(amountStr.replace(',', ''))));
                        
                            if (isNaN(amount) || amount <= 0) { 
                                player.sendMessage(' §cThe amount must be a positive number!§r'); 
                                player.playSound('note.bass'); 
                                return; 
                            }

                            // --- ATOMIC TRANSACTION LOCK PHASE (PREVENT RACE CONDITIONS DURING VALUE CHECKS) ---
                            // Re-verify that chest block still exists and matches
                            let activeChest = world.getDimension(d).getBlock({ x: x, y: y, z: z });
                            const activeChestInvComp = activeChest?.getComponent('inventory') as any;
                            if (!activeChestInvComp || !activeChestInvComp.container) {
                                player.sendMessage(' §cChest was broken or deleted. Transaction canceled.§r');
                                player.playSound('note.bass');
                                return;
                            }
                            const activeContainer = activeChestInvComp.container as Container;
                            const activeResult = processItems(activeContainer);
                            if ('error' in activeResult && activeResult.error) {
                                player.sendMessage(' §cShop inventory changed. Transaction canceled.§r');
                                player.playSound('note.bass');
                                return;
                            }
                            const actRes = activeResult as any;

                             if (!actRes.sell || !areItemsIdentical(sell, actRes.sell)) {
                                 player.sendMessage(' §cShop item type changed. Transaction canceled.§r');
                                 player.playSound('note.bass');
                                 return;
                             }

                            if (amount > actRes.itemAmount) { 
                                player.sendMessage(` §cSorry, the stock is insufficient.§r`); 
                                player.playSound('note.bass'); 
                                return; 
                            }
                        
                            const priceVal = parseInt(split[2].replace(/\D/g, '')) || 0;
                            const total = priceVal * amount;
                            const playerInvComp = player.getComponent('inventory') as any;
                            const inv = playerInvComp?.container as Container;
                            if (!inv) return;

                            if (inv.emptySlotsCount < Math.ceil(amount / (sell?.maxAmount || 64))) { 
                                player.sendMessage(` §cYou don't have enough space in your inventory.§r`); 
                                player.playSound('note.bass'); 
                                return; 
                            }
                        
                            // SCOREBOARD OR CURRENCY CLEAR CHECKS
                            if (config.currencyType === 'scoreboard') {
                                if (getScore(player, config.currency) < total) { 
                                    player.sendMessage(` §cYou don't have enough money!§r`); 
                                    player.playSound('note.bass'); 
                                    return; 
                                }
                            } else { 
                                let itemCount = 0;
                                for (let i = 0; i < inv.size; i++) {
                                    const item = inv.getItem(i);
                                    if (item && item.typeId === config.currency) itemCount += item.amount;
                                }
                                if (itemCount < total) { 
                                    player.sendMessage(` §cYou don't have enough ${iName(config.currency)}.§r`); 
                                    player.playSound('note.bass'); 
                                    return; 
                                }

                                const owner = world.getAllPlayers().find(p => p.name == ownerName);
                                if (owner) {
                                    const ownerInvComp = owner.getComponent('inventory') as any;
                                    if (ownerInvComp && ownerInvComp.container && ownerInvComp.container.emptySlotsCount === 0) { 
                                        player.sendMessage("§cTransaction failed. The shop owner's inventory is full."); 
                                        player.playSound('note.bass'); 
                                        return; 
                                    }
                                }
                            }
                        
                            // EXECUTE ATOMIC INVENTORY REDUCTION AND SCORE DEDUCTIONS
                            let objContainer: Record<number, number> = {};
                            for (let i = 0; i < activeContainer.size; i++) {
                                const item = activeContainer.getItem(i);
                                if (item && areItemsIdentical(sell, item)) {
                                    objContainer[i] = item.amount;
                                }
                            }
                            
                            const [newCont] = uContainer(objContainer, amount);
                            const newStock = Object.values(newCont).reduce((a, b) => a + b, 0);

                            // Charge the buyer
                             if (config.currencyType === 'scoreboard') {
                                 subtractScore(player, config.currency, total);
                             } else { 
                                 // Native inventory clear logic to prevent command-injection/escaping failures with player names
                                 let amountToClear = total;
                                 for (let slotIndex = 0; slotIndex < inv.size; slotIndex++) {
                                     const item = inv.getItem(slotIndex);
                                     if (item && item.typeId === config.currency) {
                                         if (item.amount > amountToClear) {
                                             item.amount -= amountToClear;
                                             inv.setItem(slotIndex, item);
                                             amountToClear = 0;
                                             break;
                                         } else {
                                             amountToClear -= item.amount;
                                             inv.setItem(slotIndex, undefined);
                                         }
                                     }
                                 }
                                 if (amountToClear > 0) {
                                     player.sendMessage(` §cTransaction failed. Inventory synchronization error.§r`);
                                     player.playSound('note.bass');
                                     return;
                                 }
                             }
                        
                            // Perform container transfer
                            for (const iStr in objContainer) {
                                const i = parseInt(iStr);
                                if (objContainer[i] !== newCont[i]) {
                                    const itemInChest = activeContainer.getItem(i);
                                    if (itemInChest) {
                                        const itemToGive = itemInChest.clone();
                                        itemToGive.amount = objContainer[i] - newCont[i];
                                        inv.addItem(itemToGive);
                                        
                                        if (newCont[i] === 0) {
                                            activeContainer.setItem(i, undefined);
                                        } else {
                                            itemInChest.amount = newCont[i];
                                            activeContainer.setItem(i, itemInChest);
                                        }
                                    }
                                }
                            }
                        
                            // Update sign stock
                            split[3] = newStock > 0 ? `${newStock}x left§r` : '§l§4OUT OF STOCK§r';
                            let totalEarned = parseInt(split[1].substring(0, split[1].indexOf(`§r`)).replace(/\D/g, '')) || 0;
                            split[1] = `${encode(`${totalEarned + total}`)}§r${itemName}`;
                            content.setText(split.join('\n'));
                        
                            player.playSound('random.orb');
                            let purchaseMessage = "", actionBarMessage = "";
                            const owner = world.getAllPlayers().find(p => p.name == ownerName);
                        
                            if (config.currencyType === 'scoreboard') {
                                purchaseMessage = ` §7§oYou bought §f${amount}§bx§f ${iname}§7 for §e${config.currencySymbol}§f${total.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')}§r`;
                                actionBarMessage = `§c-§e${config.currencySymbol}§f${total.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')}§r`;
                        
                                if (owner) {
                                    addScore(owner, config.currency, total); 
                                    owner.playSound('random.orb');
                                    owner.sendMessage(` §o§e${player.name}§7 bought §f${amount}§bx§f ${iname}§7 from your shop.§r\n §7You earned §a+§e${config.currencySymbol}§f${total.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')}§r`);
                                } else { 
                                    addScore(ownerName, config.currency, total); 
                                }
                            } else { 
                                const currencyItemName = iName(config.currency);
                                purchaseMessage = ` §7§oYou bought §f${amount}§bx§f ${iname}§7 for §f${total}x ${currencyItemName} §7from §3${ownerName}'s Shop§r`;
                                actionBarMessage = `§c- §f${total}x ${currencyItemName}§r`;
                                
                                if (owner) {
                                    const ownerInvComp = owner.getComponent('inventory') as any;
                                    if (ownerInvComp && ownerInvComp.container) {
                                        const payoutStacks = createItemStacks(config.currency, total);
                                        let totalLeftover = 0;
                                        for (const stack of payoutStacks) {
                                            const leftover = ownerInvComp.container.addItem(stack);
                                            if (leftover && leftover.amount > 0) {
                                                totalLeftover += leftover.amount;
                                            }
                                        }
                                        if (totalLeftover > 0) {
                                            let salesData = offlineSalesDB.get(ownerName) ?? {};
                                            salesData[config.currency] = (salesData[config.currency] || 0) + totalLeftover;
                                            offlineSalesDB.set(ownerName, salesData);
                                            owner.sendMessage(`§cYour inventory was full! §f${totalLeftover}x ${currencyItemName} §cwas sent to your offline sales bank.`);
                                        }
                                    }
                                    owner.playSound('random.orb');
                                    owner.sendMessage(` §o§e${player.name}§7 bought §f${amount}§bx§f ${iname}§7 from your shop.§r\n §7You received §a+§f${total}x ${currencyItemName}§r`);
                                } else {
                                    let salesData = offlineSalesDB.get(ownerName) ?? {};
                                    salesData[config.currency] = (salesData[config.currency] || 0) + total;
                                    offlineSalesDB.set(ownerName, salesData);
                                }
                            }
                            
                            player.sendMessage(purchaseMessage);
                            player.onScreenDisplay.setActionBar(actionBarMessage);
                        }
                        
                        if (data == 'bind' && (player.name == ownerName)) {
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
    } catch (er: any) { 
        console.warn(`[Shop Interact] Critical error: ${er} - Stack: ${er.stack}`); 
    }
});

// 2. REFRESH SIGN STATE IN REAL-TIME WHEN OPENING CHESTS OR SIGNS
(world.beforeEvents as any).playerInteractWithBlock.subscribe((t: any) => {
    if (!(t.player instanceof Player)) return;
    let player = t.player;
    system.runTimeout(() => {
        setScore(player, 'signL', (1 * getScore(player, 'rank')));
        if (config.currencyType === 'scoreboard') addScore(player, 'signC', 0);
    }, 1);
    const block = t.block;

    if (block.getComponent('inventory') && protectedBlockTypes.has(block.typeId)) {
        const inventoryComp = block.getComponent('inventory') as any;
        const container = inventoryComp?.container as Container;
        const item = container?.getItem(0);
        if (item) {
            displayItemInfoAboveChest(player, item);
        }
    }
    
    if (!(block.typeId.endsWith('sign'))) return;
    let signComp = block.getComponent(`sign`) as any;
    let text = signComp?.getText();
    if (!text) return;
    let split = text.split('\n');
    let firstLine = split[0];
    if (!firstLine.includes('||')) return;
    let data = firstLine.substring(0, firstLine.indexOf(`§r||`)).replace(/§/g, '').toLowerCase();
    
    if (data.startsWith('x', 0)) {
        let decode = /([xyz])(-?\d+)/g, match, vars: any = {};
        while ((match = decode.exec(data)) !== null) { vars[match[1]] = parseInt(match[2]); }
        let { x, y, z } = vars;
        let chest = player.dimension.getBlock({ x: x, y: y, z: z });
        const chestInventoryComp = chest?.getComponent('inventory') as any;
        if (!chestInventoryComp || !chestInventoryComp.container) return;

        const processResult = processItems(chestInventoryComp.container);
        system.runTimeout(() => {
            const signLines = signComp.getText().split('\n');
            let itemAmount = 0, itemName = "", enchants = {}, hasNametag = false, sell: any = null;
            const existingItemName = signLines[1].substring(signLines[1].indexOf('§r') + 2);

            if ('error' in processResult && processResult.error) {
                if (processResult.error === "SHOP EMPTY") {
                    signLines[3] = '§l§4OUT OF STOCK§r';
                    signComp.setText(signLines.join('\n'));
                } else {
                    signLines[3] = `§cSHOP ERROR`;
                    signComp.setText(signLines.join('\n'));
                }
                return;
            } else {
                const result = processResult as any;
                itemAmount = result.itemAmount;
                itemName = result.itemName;
                enchants = result.enchants;
                hasNametag = result.hasNametag;
                sell = result.sell;
            }
            
            let signItemName = itemName;
            if (sell && (sell.typeId === 'minecraft:potion' || 
                sell.typeId === 'minecraft:splash_potion' || 
                sell.typeId === 'minecraft:lingering_potion')) {
                signItemName = getPotionDisplayName(sell, true);
            } else if (itemName.replace(/§\w/g, '').length > 17) {
                if (itemName.split(' ').length > 1) {
                    let words = itemName.split(' '); let lastW = words.pop() as string;
                    signItemName = `${words.map((w: string) => w.charAt(0).toUpperCase()).join('.')}. ${lastW}`;
                } else {
                    signItemName = itemName.toLowerCase().split('').filter((char: string) => !'aeiou'.includes(char)).join('');
                }
            }
            
            itemName = signItemName;
            if (hasNametag) { itemName = '§o' + itemName; }
            if (itemName == 'Enchanted Book' && Object.keys(enchants).length > 0) {
                let enchantName = displayFormat(Object.keys(enchants)[0]);
                let more = (Object.keys(enchants).length > 1) ? '+' : '';
                itemName = `§o§5${enchantName} §r§o${romanize(enchants[Object.keys(enchants)[0]])} §l§2${more}§r`;
            }
            let oldText = signComp.getText().split('\n');
            let earn = oldText[1].substring(0, oldText[1].indexOf(`§r`));
            let newText = [...oldText];
            newText[1] = `${earn}§r${itemName}`;
            newText[3] = (itemAmount > 0) ? `${itemAmount}x left§r` : '§l§4OUT OF STOCK§r';
            signComp.setText(newText.join('\n'));
            if ((newText[3] !== oldText[3]) || (newText[1] !== oldText[1])) {
                player.onScreenDisplay.setActionBar('§aSign Stock Updated');
                player.playSound('note.hat');
            }
        }, 1);
    }
});

// 3. CURRENCY CONFIGURATION FORM (UI UTILITY)
export async function showCurrencyConfigurationForm(player: Player) {
    const form = new ActionFormData()
        .title("Shop Currency Configuration")
        .body("Select the type of currency for your server's shops.")
        .button("Scoreboard Objective")
        .button("Item");

    const response = await form.show(player);

    if (response.canceled || response.selection === undefined) {
        return;
    }

    if (response.selection === 0) {
        // Scoreboard configuration
        const modal = new ModalFormData()
            .title("Set Scoreboard Currency")
            .textField("Enter the name of the scoreboard objective to use as currency.", "e.g., money");
        
        const modalResponse = await modal.show(player);

        if (modalResponse.canceled || !modalResponse.formValues || !modalResponse.formValues[0]) {
            player.sendMessage("§cCurrency setup canceled.");
            return;
        }

        const objectiveName = modalResponse.formValues[0] as string;
        if (!world.scoreboard.getObjective(objectiveName)) {
            world.scoreboard.addObjective(objectiveName, objectiveName);
            player.sendMessage(`§aScoreboard objective "${objectiveName}" did not exist, so it was created.`);
        }
        
        config.currencyType = 'scoreboard';
        config.currency = objectiveName;
        config.currencySymbol = '$';
        
        const newCurrencyConfig = {
            type: config.currencyType,
            id: config.currency,
            symbol: config.currencySymbol
        };
        serverDB.set('currencyConfig', newCurrencyConfig);

        player.sendMessage(`§aShop currency is now the scoreboard objective: §e${objectiveName}`);
        player.sendMessage("§aThis setting has been saved and will persist through restarts.");

    } else if (response.selection === 1) {
        // Item configuration
        const modal = new ModalFormData()
            .title("Set Item Currency")
            .textField("Enter the item ID to use as currency.", "e.g., minecraft:diamond");

        const modalResponse = await modal.show(player);

        if (modalResponse.canceled || !modalResponse.formValues || !modalResponse.formValues[0]) {
            player.sendMessage("§cCurrency setup canceled.");
            return;
        }

        const itemId = modalResponse.formValues[0] as string;
        config.currencyType = 'item';
        config.currency = itemId;
        config.currencySymbol = '';

        const newCurrencyConfig = {
            type: config.currencyType,
            id: config.currency,
            symbol: config.currencySymbol
        };
        serverDB.set('currencyConfig', newCurrencyConfig);

        player.sendMessage(`§aShop currency is now the item: §e${itemId}`);
        player.sendMessage("§aThis setting has been saved and will persist through restarts.");
    }
}

// 4. STABLE ADMIN ITEM INTERACTION FOR CURRENCY UI
// (No commands are registered here to prevent dependency issues with beta APIs)

// 5. STABLE ADMIN ITEM INTERACTION FOR CURRENCY UI
world.beforeEvents.itemUse.subscribe(event => {
    try {
        const { source, itemStack } = event;
        if (!(source instanceof Player) || !itemStack) return;

        // Crouch + regular stick + admin tag opens global currency config
        if (itemStack.typeId === 'minecraft:stick' && source.isSneaking && source.hasTag(config.adminTag)) {
            event.cancel = true;
            system.run(() => {
                try {
                    showCurrencyConfigurationForm(source);
                } catch (err: any) {
                    console.warn(`[Shop Admin Config] Error showing form: ${err} - Stack: ${err.stack}`);
                }
            });
        }
    } catch (e: any) {
        console.warn(`[Shop itemUse] Error: ${e} - Stack: ${e.stack}`);
    }
});


