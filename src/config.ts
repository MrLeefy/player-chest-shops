export interface AppConfig {
    currency: string;
    currencyType: 'scoreboard' | 'item';
    currencySymbol: string;
    shopLimit: number;
    adminTag: string;
    signConfig: string[];
    containers: string[];
}

const config: AppConfig = {
    currency: "money",
    currencyType: "scoreboard", // Can be 'scoreboard' or 'item'
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

export default config;
