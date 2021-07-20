const chai = require('chai');
chai.use(require('chai-as-promised'));
const { expect } = chai;
const stream = require('stream');
const aes256 = require('../lib/aes256');

describe('aes256', ()=>{
    const text = '哈哈哈';
    it('encrypt and decrypt', ()=>{
        const a = new aes256();
        const encrypted = a.encrypt(Buffer.from(text));
        expect(a.decrypt(encrypted).toString()).eq(text);
    });

    it('stream encrypt and decrypt', (done)=>{
        const a = new aes256();
        let d = '';
        stream.Readable.from(text)
            .pipe(a.encrypt_cipher())
            .pipe(a.decrypt_cipher())
            .on('data', (data)=>{
                d += data;
            })
            .on('end', ()=>{
                expect(d).to.eq(text);
                done();
            });
    });
});
