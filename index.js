'use strict';

/**
 * txn
 * insert
 *   201
 *   409 → get → 500 → get
 *             → 200 (patch obj)  → goto txn
 *   500 → goto insert
 *
 */

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

function backoff() {
    return 300;
}

function transaction(couchdb, op, options) {
    options = options || {};
    options.maxRetries = options.maxRetries || 5;
    options.backoff = options.backoff || backoff;
    return function (obj, callback) {
        var retryLeft = options.maxRetries;
        var allErrors = [];
        callback = once(callback);

        function retry(fn) {
            var err;
            retryLeft--;
            if (retryLeft < 1) {
                err = new Error('too many errors');
                err.errList = allErrors;
                return callback(err);
            }
            setTimeout(function () {
                fn();
            }, options.backoff(options.maxRetries - retryLeft));
        }

        function handleSuccess(result) {
            obj._rev = result.rev;
            obj._id = result.id;
            return callback(null, obj);
        }

        function handleConflict() {
            couchdb.get(obj._id, function (err, currentObj) {
                if (err) {
                    allErrors.push(err);
                    return retry(handleConflict);
                }
                obj = currentObj;
                update();
            });
        }

        function store() {
            couchdb.insert(obj, function (err, result) {
                if (err && err.statusCode && err.statusCode === 409) {
                    handleConflict();
                }
                if (err) {
                    allErrors.push(err);
                    return retry(store);
                }
                handleSuccess(result);
            });
        }

        function update() {
            op(obj, function (err, nObj) {
                if (err) {
                    allErrors.push(err);
                    return retry(update);
                }
		obj=nObj;
                store();
            });
        };
        update();
    }
}
exports = module.exports = transaction;
