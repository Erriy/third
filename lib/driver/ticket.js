const axios = require('axios').default;
const runtime = require('./runtime');

async function lookup (fingerprint) {
    try {
        const r = await axios.get(runtime.url(`local/ticket/${fingerprint}`));
        return r.data.object;
    }catch(e) {
        throw new Error ('无法解析');
    }
}

module.exports = {
    lookup
};
