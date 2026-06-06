import { world, system, Player } from "@minecraft/server";
import config from "./config";
import { Database } from "./database";
import { getScore, addScore, resetScore, setScore, setTimeout } from "./utility";

// --- DATABASE INSTANCES ---
export const database = new Database('ShopLocations');
export const offlineSalesDB = new Database('OfflineSales');
export const serverDB = new Database('ServerSettings');

// --- LOAD SAVED CURRENCY CONFIGURATION ---
const savedCurrency = serverDB.get('currencyConfig');
if (savedCurrency) {
    console.warn(`[Shop] Loaded currency setting from database: ${savedCurrency.type} - ${savedCurrency.id}`);
    config.currency = savedCurrency.id;
    config.currencyType = savedCurrency.type;
    config.currencySymbol = savedCurrency.symbol;
}

// --- IMPORT LOGICAL SCRIPTS ---
import "./item";
import "./utility";
import "./protection";
import "./shop";

// --- INITIALIZE WORLD ON START ---
function initializeWorld() {
    const setup = ['gamerule sendcommandfeedback false'];
    for (const command of setup) {
        try {
            world.getDimension('overworld').runCommand(command);
        } catch (error) {
            console.warn(`[Shop Setup] Failed to run command "${command}": ${error}`);
        }
    }

    const objectives = ['rank', 'signL', 'signC', 'signD', 'signZ', 'signY', 'signX', config.currency];
    objectives.forEach(objective => {
        if (objective && !objective.includes(':')) {
            try {
                world.scoreboard.getObjective(objective) ?? world.scoreboard.addObjective(objective, objective);
            } catch (error) {
                console.warn(`[Shop Setup] Failed to add objective "${objective}": ${error}`);
            }
        }
    });

    console.log("§a[PlayerShop] World setup complete. Scoreboards and gamerules initialized.");
}

// Run setup after world loads
// world.afterEvents.worldLoad can be replaced with a delayed timeout or run at startup
system.runTimeout(() => {
    initializeWorld();
}, 10);

// --- OFFLINE SALES AND PLAYER RANKS ---
world.afterEvents.playerSpawn.subscribe(({ player, initialSpawn }) => {
    if (!initialSpawn) return;
    
    // Delay execution by 80 ticks (4 seconds) to allow network profile/identity to resolve
    system.runTimeout(() => {
        try {
            if (!player.isValid()) return;
            
            // Set default rank shop limit if not set
            setScore(player, 'rank', config.shopLimit);
            
            const fP = world.scoreboard.getParticipants().find(p => p.type === 'FakePlayer' && p.displayName === player.name);
            if (!fP) return;
            
            if (config.currencyType === 'scoreboard') {
                const add = getScore(fP, config.currency);
                if (!add) return;
                
                addScore(player, config.currency, add);
                resetScore(fP, config.currency);
                
                setTimeout(() => {
                    if (player.isValid()) {
                        player.sendMessage(` §7§oYou earned §e${config.currencySymbol}§f${add.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')} §7from your shops while you were away!§r`);
                        player.playSound('random.levelup', { pitch: 2 });
                    }
                }, 5000);
            }
        } catch (error) {
            console.warn(`[Shop Spawn] Error handling player spawn: ${error}`);
        }
    }, 80);
});

