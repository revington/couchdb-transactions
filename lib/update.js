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
function handleSuccess(ctx, result) {
    ctx.obj._rev = result.rev;
    ctx.obj._id = result.id;
    return ctx.callback(null, ctx.obj);
}

function handleConflict(ctx) {
    ctx.couchdb.get(ctx.obj._id, function (err, currentObj) {
        if (err) {
            ctx.allErrors.push(err);
            return ctx.retry(handleConflict);
        }
        ctx.obj = currentObj;
        update(ctx);
    });
}

function store(ctx) {
    ctx.couchdb.insert(ctx.obj, function (err, result) {
        if (err && err.statusCode && err.statusCode === 409) {
            handleConflict(ctx);
        }
        if (err) {
            ctx.allErrors.push(err);
            return ctx.retry(store);
        }
        handleSuccess(ctx, result);
    });
}

function update(ctx) {
    ctx.op(ctx.obj, function (err, nObj) {
        if (err) {
            ctx.allErrors.push(err);
            return ctx.retry(update);
        }
        ctx.obj = nObj;
        store(ctx);
    });
};
exports = module.exports = update;
