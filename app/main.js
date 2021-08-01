const {app, BrowserWindow} = require('electron');

app.on('ready', function () {
    const win = new BrowserWindow({
        width                 : 300,
        height                : 500,
        frame                 : false,
        resizable             : false,
        fullscreenable        : false,
        transparent           : true,
        visibleOnAllWorkspaces: true,
        hasShadow             : false
    });
    app.dock.hide();
    win.setIgnoreMouseEvents(true);
    win.setAlwaysOnTop(true, 'floating');

    // Or load a local HTML file
    win.loadURL(`file://${__dirname}/view/index.html`);
});