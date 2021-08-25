const {clipboard} = require('electron');
const os = require('os');
const engine = require('../../lib');

async function device () {
    return [{
        label  : os.hostname(),
        submenu: [
            {
                label: engine.runtime.key.getKeyID().toHex().toUpperCase(),
                click () {
                    clipboard.writeText(engine.runtime.key.getFingerprint().toUpperCase());
                }
            }
        ]
    }];
}

module.exports = device;