/*
 * Copyright 2020 New Relic Corporation. All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
var loader = require('loader')
var config = require('config')
var xhrDisabled = config.getConfiguration('xhr.enabled') === false

// bail if not instrumented
if (xhrDisabled || !loader.features.xhr) return

var agg = require('../../../agent/aggregator')
var register = require('../../../agent/register-handler')
var harvest = require('../../../agent/harvest')
var stringify = require('../../../agent/stringify')
var ee = require('ee')
var handle = require('handle')

harvest.on('jserrors', function () {
  return { body: agg.take([ 'xhr' ]) }
})

ee.on('feat-err', function () { register('xhr', storeXhr) })

module.exports = storeXhr

function storeXhr (params, metrics, start) {
  metrics.time = start

  var type = 'xhr'
  var hash
  if (params.cat) {
    hash = stringify([params.status, params.cat])
  } else {
    hash = stringify([params.status, params.host, params.pathname])
  }

  handle('bstXhrAgg', [type, hash, params, metrics])
  agg.store(type, hash, params, metrics)
}
