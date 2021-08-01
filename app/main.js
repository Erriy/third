const {app, BrowserWindow} = require('electron');

app.on('ready', function () {
    const win = new BrowserWindow({
        width    : 300,
        height   : 18,
        frame    : false,
        resizable: false,
    });
    app.dock.hide();
    // Or load a local HTML file
    win.loadURL(`file://${__dirname}/view/index.html`);
});