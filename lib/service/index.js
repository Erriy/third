const runtime = require('./runtime');
const server = require('./server');

async function start () {
    await runtime.init();
    await server.start();
}

module.exports = {
    start,
};
