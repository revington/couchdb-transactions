'use strict';
const retryLimit = 5;
const assert = require('assert');

function tooManyErrors(options, count) {
    return (count + 1) >= options.limit;
}

function exponentialBackoff(attempt) {
    return Math.pow(2, attempt) * 100;
}

function backOff(fn, time) {
    setTimeout(fn, time);
}

function deepCopy(obj) {
    assert(obj);
    return JSON.parse(JSON.stringify(obj));
}

function retry(fn, options, doc, count, callback) {
    return backOff(function () {
        return fn(options, doc, count + 1, callback);
    }, options.backoff(count));
}

function get(options, doc, count, callback) {
    options.nano.get(doc._id, function (err, res) {
        if (err && tooManyErrors(options, count)) {
            return callback(err);
        }
        if (err) {
            return retry(get, options, doc, count, callback);
        }
        return options.modify(options, res, count, callback);
    });
}

function update(options, doc, count, callback) {
    options.nano.insert(doc, function (err, res) {
        if (err && tooManyErrors(options, count)) {
            return callback(err);
        }
        if (err && err.statusCode === 409) {
            return get(options, doc, count + 1, callback);
        }
        if (err) {
            return retry(update, options, doc, count, callback);
        }
        return callback(null, res, count);
    });
}

function syncModify(options, doc, count, callback) {
    let pristineDoc = deepCopy(doc);
    try {
        options.transaction(doc);
    } catch (e) {
        if (tooManyErrors(options, count)) {
            return callback(e);
        } else {
            return retry(syncModify, options, pristineDoc, count, callback);
        }
    }
    return update(options, doc, count, callback);
}

function asyncModify(options, doc, count, callback) {
    let pristineDoc = deepCopy(doc);
    return options.transaction(doc, function (err, result) {
        if (err && tooManyErrors(options, count)) {
            return callback(err);
        }
        if (err) {
            return retry(asyncModify, options, pristineDoc, count, callback);
        }
        return update(options, result, count, callback);
    });
}

function isAsyncTransaction(transaction) {
    return transaction.length === 2;
}

exports = module.exports = function couchDBTransactions(nano, transaction, options) {
    var myOptions = Object.assign({
            nano,
            transaction,
        }, options),
        count = 0;
    myOptions.limit = myOptions.limit || retryLimit;
    myOptions.modify = isAsyncTransaction(transaction) ? asyncModify : syncModify;
    myOptions.backoff = myOptions.backoff || exponentialBackoff;
    return function (idOrDocument, callback) {
        switch (typeof idOrDocument) {
        case 'string':
            {
                idOrDocument = {
                    _id: idOrDocument
                };
            }
        case 'object':
            {
                let pristineDoc = deepCopy(idOrDocument);
                return myOptions.modify.call(null, myOptions, pristineDoc, count, callback);
            }
        default:
            {
                return callback(new Error('idOrDocument should be a string or an object'));
            }
        }
    };
};
exports.asyncModify = asyncModify;
exports.exponentialBackoff = exponentialBackoff;
exports.get = get;
exports.isAsyncTransaction = isAsyncTransaction;
exports.retry = retry;
exports.syncModify = syncModify;
exports.update = update;
