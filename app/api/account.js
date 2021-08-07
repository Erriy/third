const {service} = require('../../lib');
const account = service.routine.account;

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

async function info () {
    return await account.object;
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
