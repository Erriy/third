const runtime = require('./runtime');
const key = require('./key');

async function init () {
    await runtime.init();
}

module.exports = {
    init,
    key,
};