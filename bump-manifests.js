import fs from 'fs';
import { randomUUID } from 'crypto';

// 1. Update BEH manifest
const behPath = 'PlayerChestsBEH/manifest.json';
const beh = JSON.parse(fs.readFileSync(behPath, 'utf8'));

// Bump version
const oldVer = beh.header.version;
beh.header.version = [oldVer[0], oldVer[1], oldVer[2] + 1];
const newVerStr = beh.header.version.join('.');
beh.header.name = `PlayerShops v${newVerStr}`;

// Generate UUIDs
beh.header.uuid = randomUUID();
if (beh.modules) {
    beh.modules.forEach(m => m.uuid = randomUUID());
}

fs.writeFileSync(behPath, JSON.stringify(beh, null, 2), 'utf8');

// 2. Update RES manifest
const resPath = 'PlayerChesRES/manifest.json';
if (fs.existsSync(resPath)) {
    const res = JSON.parse(fs.readFileSync(resPath, 'utf8'));
    const resVer = res.header.version;
    res.header.version = [resVer[0], resVer[1], resVer[2] + 1];
    res.header.name = `ChestShop RES`;
    res.header.uuid = randomUUID();
    if (res.modules) {
        res.modules.forEach(m => m.uuid = randomUUID());
    }
    fs.writeFileSync(resPath, JSON.stringify(res, null, 2), 'utf8');
}

// 3. Update package.json
const pkgPath = 'package.json';
if (fs.existsSync(pkgPath)) {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    pkg.version = newVerStr;
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2), 'utf8');
}

console.log(`Bumped version to ${newVerStr} and generated new UUIDs.`);
