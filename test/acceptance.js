'use strict';
const nano = require('nano');
const couchdbTxn = require('..');
const TEST_COUCH_DB = 'http://localhost:5984';
const assert = require('assert');
const pkg = require('../package.json');

function initSandbox(done) {
    var self = this;
    self.testDB = pkg.name + '-test-' + Date.now().toString(36);
    let myDB = nano(TEST_COUCH_DB);
    myDB.db.create(self.testDB, function (err) {
        if (err) {
            return done(err);
        }
        self.db = myDB.use(self.testDB);
        return done();
    });
}

function destroySandbox(done) {
    var self = this;
    let myDB = nano(TEST_COUCH_DB);
    myDB.db.destroy(self.testDB, function (err) {
        if (err) {
            console.trace(err.stack);
            return done(err);
        }
        return done();
    });
}
describe('couchdb-transactions', function () {
    var doc;
    var id = 'doc1';
    var _done = 0;
    var insertFails = false;
    var getFails = false;
    var results = [];
    before(initSandbox);
    after(destroySandbox);
    before(function (done) {
        var db = this.db;

        function sumTransaction(doc) {
            doc.sum = 1 + (doc.sum || 0);
        }
        let txn = couchdbTxn(db, sumTransaction);
        let oldInsert = db.insert;
        let oldGet = db.get;
        db.insert = function (doc, cb) {
            db.insert = oldInsert;
            insertFails = true;
            return cb(new Error('insert error'));
        };
        db.get = function (doc, cb) {
            db.get = oldGet;
            getFails = true;
            return cb(new Error('get error'));
        };

        function cb(err, couchResponse, errorCount) {
            results.push([err, couchResponse, errorCount]);
            _done++;
            if (err) {
                return done(err);
            }
            if (_done === 5) {
                db.get(id, function (err, _doc) {
                    doc = _doc;
                    return done();
                });
            }
        }
        for (let i = 0; i < 5; i++) {
            txn(id, cb);
        }
    });
    describe('When there are conflicts', function () {
        it('should retry', function () {
            assert.deepEqual(doc.sum, 5, JSON.stringify(doc));
        });
    });
    describe('When insert fails', function () {
        it('should retry', function () {
            assert(insertFails);
        });
    });
    describe('When get fails', function () {
        it('should retry', function () {
            assert(getFails);
        });
    });
    describe('#get(options, doc, count, callback)', function () {
        describe('on error', function () {
            var get = couchdbTxn.get;
            var lastErr;
            var count = 0;
            before(function (done) {
                var options = {};
                options.nano = {
                    get: function (id, cb) {
                        return cb(new Error('err' + (++count)));
                    },
                };
                options.backoff = function () {
                    return 1;
                };
                options.limit = 3;
                get(options, {}, 0, function (err, result, count) {
                    lastErr = err;
                    return done();
                });
            });
            it('should return invoke callback with last error', function () {
                assert.deepEqual(lastErr.message, 'err3');
            });
            it('should retry "options.limit" times', function () {
                assert(count === 3);
            });
        });
    });
    describe('#update(options, doc, count, callback)', function () {
        describe('on error', function () {
            var update = couchdbTxn.update;
            var lastErr;
            var count = 0;
            before(function (done) {
                var options = {};
                options.nano = {
                    insert: function (id, cb) {
                        return cb(new Error('err' + (++count)));
                    },
                };
                options.backoff = function () {
                    return 1;
                };
                options.limit = 3;
                update(options, {}, 0, function (err, result, count) {
                    lastErr = err;
                    return done();
                });
            });
            it('should return invoke callback with last error', function () {
                assert.deepEqual(lastErr.message, 'err3');
            });
            it('should retry "options.limit" times', function () {
                assert(count === 3);
            });
        });
        describe('on document conflict (409)', function () {
            var update = couchdbTxn.update;
            var lastErr;
            var count = 0;
            var getArgs;
            before(function (done) {
                var options = {};
                options.nano = {
                    insert: function (id, cb) {
                        var err = new Error('document update conflict');
                        err.statusCode = 409;
                        return cb(err);
                    },
                    get: function (id, callback) {
                        assert(id);
                        assert(callback);
                        getArgs = [id, callback];
                        return done();
                    }
                };
                options.limit = 3;
                update(options, {
                    _id: 'some'
                }, 0, function () {
                    return done(new Error('unexpected branch'));
                });
            });
            it('should reload document (call #get)', function () {
                assert.deepEqual(getArgs[0], 'some');
            });
        });
    });
    describe('#asyncModify(options, doc, count, callback)', function () {
        describe('on transaction error', function () {
            var fn = couchdbTxn.asyncModify;
            var lastErr;
            var count = 0;
            before(function (done) {
                fn({
                    limit: 3,
                    backoff: function () {
                        return 1;
                    },
                    transaction: function (doc, cb) {
                        count++;
                        return cb(new Error('err' + count));
                    }
                }, {}, 0, function (err) {
                    lastErr = err;
                    return done();
                });
            });
            it('should retry', function () {
                assert(count === 3);
            });
            it('should give up after too many errors', function () {
                assert.deepEqual(lastErr.message, 'err3');
            });
        });
    });
    describe('#syncModify(options, doc, count, callback)', function () {
        var fn = couchdbTxn.syncModify;
        var lastErr;
        var count = 0;
        before(function (done) {
            fn({
                limit: 3,
                backoff: function () {
                    return 1;
                },
                transaction: function () {
                    count++;
                    throw new Error('err' + count);
                }
            }, {}, 0, function (err) {
                lastErr = err;
                return done();
            });
        });
        it('should retry', function () {
            assert(count === 3);
        });
        it('should give up after too many errors', function () {
            assert.deepEqual(lastErr.message, 'err3');
        });
    });
});
