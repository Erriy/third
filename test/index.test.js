const chai = require('chai');
chai.use(require('chai-as-promised'));
const { expect } = chai;
const index = require('../lib/index');

describe('index', ()=>{
    it('test', ()=>{
        expect(index()).to.be.true;
    });
});
