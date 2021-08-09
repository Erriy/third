const {app} = require('electron');

function vue_route (r) {
    if(!app.isPackaged) {
        return `http://127.0.0.1:8080/#${r}`;
    }
    return `file://${__dirname}/../dist/index.html#${r}`;
}

module.exports = {
    vue_route
};