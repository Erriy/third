const {autoUpdater} = require('electron-updater');

function check () {
    autoUpdater.checkForUpdatesAndNotify();
}

module.exports = {
    check,
};