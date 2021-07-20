const {app} = require('electron');
const path = require('path');
const fse = require('fs-extra');
const electron_store = require('electron-store');

const obj = {
    config: new electron_store()
};

function vue_route (r) {
    if(!app.isPackaged) {
        return `http://127.0.0.1:8080/#${r}`;
    }
    return `file://${__dirname}/../dist/index.html#${r}`;
}

function root () {
    if(!app.isPackaged) {
        const root = path.join(__dirname, '../data');
        fse.ensureDirSync(root);
        return root;
    }
    return app.getPath('userData');
}

function get_config () {
    if(!obj.config.has('bootstrap')) {
        obj.config.set('bootstrap', ['http://third.on1y.net:5353']);
    }
    if(!obj.config.has('relay')) {
        obj.config.set('relay', 'http://third.on1y.net:5353');
    }
    if(!obj.config.has('port')) {
        obj.config.set('port', 34105);
    }
    return obj.config;
}

module.exports = {
    vue_route,
    get root () {
        return root();
    },
    get config () {
        return get_config();
    }
};