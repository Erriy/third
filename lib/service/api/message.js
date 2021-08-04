const express = require('express');

// const {account} = require('../routine');
function router () {
    const r = express.Router();

    r.use(express.text({type: 'text/plain'}));

    r.put('', async (req, res)=>{
        console.log(req.body);
        return res.build();
    });

    return r;
}

module.exports = router;
