const {account} = require('../../lib');

module.exports = {
    lookup: account.lookup,
    login : account.login,
    device: {
        add   : account.device.add,
        remove: account.device.remove,
        list  : account.device.list,
    },
};
