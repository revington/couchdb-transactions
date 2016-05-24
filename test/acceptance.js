'use strict';

var transactions = require('..'),
    http = require('http'),
    api,
    crypto = require('crypto'),
    assert = require('assert'),
    nano = require('nano');

function sign(obj) {
    var copy = JSON.parse(JSON.stringify(obj));
    delete copy._rev;
    return crypto.createHash('md5').update(JSON.stringify(copy)).digest('base64');
}

function POSTHandleCreate(req, res) {
    var obj = req.obj;
    var signature = req.objSignature;
    var db = req.db;
    obj._rev = '1-' + signature;
    db[obj._id] = obj;
    res.writeHead(201, {
        'Content-Type': 'text/plain',
        'ETag': signature
    });
    return res.end(JSON.stringify({
        ok: true,
        id: '' + obj._id,
        rev: signature
    }));
}

function POSTHandleUpdate(req, res) {
    var newRevV = +req.db[req.obj._id]._rev.split('-')[0];
    var upToDate = req.db[req.obj._id] = req.obj;
    newRevV++;
    upToDate._rev = newRevV + '-' + req.objSignature;
    res.writeHead(201, {
        'Content-Type': 'text/plain',
        'ETag': upToDate._rev
    });
    return res.end(JSON.stringify({
        ok: true,
        id: '' + upToDate._id,
        rev: upToDate._rev
    }));

}

function POSTHandleConflict(req, res) {
    res.writeHead(409);
    return res.end(JSON.stringify({
        'error': 'conflict',
        'reason': 'Document update conflict.'
    }));
}

function POST(req, res) {
    var buffer = '';
    var db = req.db;
    req.on('data', function (chunk) {
        if (chunk) {
            buffer += chunk.toString();
        }
    });
    req.on('end', function () {
        var obj = JSON.parse(buffer);
        var signature = sign(obj);
        req.obj = obj;
        req.objSignature = signature;

        if (!db[obj._id]) {
            return POSTHandleCreate(req, res);
        }
        if (obj._rev === db[obj._id]._rev) {
            return POSTHandleUpdate(req, res);
        }
        return POSTHandleConflict(req, res);
    });
}

function GET(req, res) {
    res.end(JSON.stringify(req.db['1']));
}
api = {
    POST: POST,
    GET: GET
};
describe('couchdb-transactions', function () {
    var db = {};
    var server = http.createServer((function () {
        return function (req, res) {
            req.db = db;
            api[req.method](req, res);
        };
    })());

    function op(doc, cb) {
        doc.number = doc.number || 0;
        doc.number++;
        return cb(null, doc);
    }

    before(function (done) {
        server.listen(function (err) {
            var t, _done, db = nano('http://localhost:' + this.address().port + '/test');
            if (err) {
                return done(err);
            }
            t = transactions(db, op);
            _done = (function () {
                var left = 3;
                return function () {
                    left--;
                    if (!left) {
                        return done();
                    }

                };
            })();
            t({
                _id: '1'
            }, _done);
            t({
                _id: '1'
            }, _done);
            t({
                _id: '1'
            }, _done);
        });
    });

    it('should apply all updates', function () {
        assert.deepEqual(db['1'], {
            _id: '1',
            number: 3,
            _rev: '3-/owPe7doKOg9nw08eK9eVg=='
        });
    });
});
