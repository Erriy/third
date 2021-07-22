const express = require('express');
const openpgp = require('openpgp');
const runtime = require('../runtime');

async function router () {
    const r = express.Router();

    r.put('', async (req, res)=>{

    });

    r.get('', async (req, res)=>{

    });

    return r;
}

module.exports = router;