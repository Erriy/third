const express = require('express');
const {ticket} = require('../routine');

function router () {
    const r = express.Router();

    r.get('', async (req, res)=>{
        return res.build({ticket: await ticket.ticket.valueOf()});
    });

    return r;
}

module.exports = router;