import fs from 'fs';
import { randomUUID } from 'crypto';

// Paths
const behPath = 'LeefyChestShop BEH/manifest.json';
const resPath = 'LeefyChestShop RES/manifest.json';
const pkgPath = 'package.json';

// Read manifests
const beh = JSON.parse(fs.readFileSync(behPath, 'utf8'));
const res = JSON.parse(fs.readFileSync(resPath, 'utf8'));

// Store old UUIDs to identify dependencies
const oldBehUuid = beh.header.uuid;
const oldResUuid = res.header.uuid;

// Generate new UUIDs
const newBehUuid = randomUUID();
const newResUuid = randomUUID();

// Bump versions
const oldVer = beh.header.version;
const newVer = [oldVer[0], oldVer[1], oldVer[2] + 1];
const newVerStr = newVer.join('.');

// Update BEH
beh.header.uuid = newBehUuid;
beh.header.version = newVer;
beh.header.name = `LeefyChestShop v${newVerStr} BEH`;
beh.header.description = `LeefyChestShop Behavior Pack v${newVerStr} - Production Release - Jun 2026 Update`;
if (beh.modules) {
    beh.modules.forEach(m => {
        m.uuid = randomUUID();
        m.version = newVer; // Keep modules version in sync
    });
}

// Update RES
res.header.uuid = newResUuid;
res.header.version = newVer;
res.header.name = `LeefyChestShop v${newVerStr} RES`;
res.header.description = `LeefyChestShop Resource Pack v${newVerStr} - Production Release - Jun 2026 Update`;
if (res.modules) {
    res.modules.forEach(m => {
        m.uuid = randomUUID();
        m.version = newVer; // Keep modules version in sync
    });
}

// Update mutual dependencies
if (beh.dependencies) {
    beh.dependencies.forEach(d => {
        if (d.uuid === oldResUuid) {
            d.uuid = newResUuid;
            d.version = newVer;
        }
    });
}
if (res.dependencies) {
    res.dependencies.forEach(d => {
        if (d.uuid === oldBehUuid) {
            d.uuid = newBehUuid;
            d.version = newVer;
        }
    });
}

// Write back (Keep tab spacing for consistency)
fs.writeFileSync(behPath, JSON.stringify(beh, null, '\t'), 'utf8');
fs.writeFileSync(resPath, JSON.stringify(res, null, '\t'), 'utf8');

// Update package.json
if (fs.existsSync(pkgPath)) {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    pkg.version = newVerStr;
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2), 'utf8');
}

console.log(`Bumped version to ${newVerStr} and generated new UUIDs with synced dependencies.`);
