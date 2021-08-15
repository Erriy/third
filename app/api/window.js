const {BrowserWindow} = require('electron');

function close (e) {
    const win = BrowserWindow.fromWebContents(e.sender);
    win.close();
    win.destroy();
}

module.exports = {
    close,
};