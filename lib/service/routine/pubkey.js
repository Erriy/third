const runtime = require('./runtime');

function get (fingerprint = null) {
    return runtime.key.toPublic().armor();
}

module.exports = {
    get,
};