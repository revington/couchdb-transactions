'use strict';
var update = require('./lib/update');

function backoff() {
    return 300;
}

function makeRetry(ctx) {
    return function retry(fn) {
        var err;
        ctx.retryLeft--;
        if (ctx.retryLeft < 0) {
            return;
        }
        if (!ctx.retryLeft) {
            err = new Error('too many errors');
            err.errList = ctx.allErrors;
            return ctx.callback(err);
        }
        setTimeout(function () {
            fn(ctx);
        }, ctx.options.backoff(ctx.options.maxRetries - ctx.retryLeft));
    };
}

function once(fn) {
    var called = false;
    return function () {
        if (called) {
            return;
        }
        called = true;
        return fn.apply(fn, arguments);
    };
}

function Ctx(obj, callback) {
    this.allErrors = [];
    this.retry = makeRetry(this);
    this.callback = once(callback);
    this.obj = obj;
}

function transaction(couchdb, op, options) {
    options = options || {};
    options.maxRetries = options.maxRetries || 5;
    options.backoff = options.backoff || backoff;
    return function (obj, callback) {

        var ctx = new Ctx(obj, callback);
        ctx.retryLeft = options.maxRetries;
        ctx.op = op;
        ctx.couchdb = couchdb;
        ctx.options = options;

        update(ctx);
    };
}
exports = module.exports = transaction;
