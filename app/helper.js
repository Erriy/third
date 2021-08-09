const {app} = require('electron');
const path = require('path');
const fse = require('fs-extra');

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

module.exports = {
    vue_route,
    get root () {
        return root();
    },
};