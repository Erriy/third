const {routine} = require('../../lib');
const account = routine.account;

async function lookup (keyid) {
    return await account.lookup(keyid);
}

async function add_device (fpr) {
    return await account.device.add(fpr);
}

async function remove_device (fpr) {
    return await account.device.remove(fpr);
}

function list_device () {
    return account.device.list();
}

function info () {
    return {
        fingerprint: account.fingerprint,
        object     : account.object,
    };
}

async function login (fpr) {
    return await account.login(fpr);
}

module.exports = {
    lookup,
    info,
    login,
    device: {
        add   : add_device,
        remove: remove_device,
        list  : list_device
    }
};