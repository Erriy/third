const urljoin = require('url-join');

const obj = {
    service: null,
};

async function init ({
    service = 'http://127.0.0.1:34105'
} = {}) {
    obj.service = service;
}

function url (path) {
    return urljoin(obj.service, path);
}

module.exports = {
    init,
    url,
    get service () {
        return obj.service;
    },
};