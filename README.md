[![Build Status](https://travis-ci.org/revington/couchdb-transactions.svg?branch=master)](https://travis-ci.org/revington/couchdb-transactions)
[![Known Vulnerabilities](https://snyk.io/test/github/revington/couchdb-transactions/badge.svg?targetFile=package.json)](https://snyk.io/test/github/revington/couchdb-transactions?targetFile=package.json)
[![Coverage Status](https://coveralls.io/repos/github/revington/couchdb-transactions/badge.svg?branch=master)](https://coveralls.io/github/revington/couchdb-transactions?branch=master)
# Couchdb transactions

Inspired by [txn](https://github.com/jhs/txn) this library loads, modifies and commits documents to couchdb. It also will retry failed requests.
The libray has zero dependencies but requires an instance of [nano](https://github.com/dscape/nano).


## Usage 

```
const couchdbTxn = require('couchdb-transactions');
const db = require('nano')('http:....');

function sumTransaction(doc) {
    doc.sum = 1 + (doc.sum || 0);
}

let txn = couchdbTxn(db, sumTransaction);

let doc = {_id:'xyz'};

txn(doc, function (err, response){
    console.log('response', response);
);
```

