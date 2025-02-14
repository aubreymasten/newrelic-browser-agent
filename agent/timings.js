/*
 * Copyright 2020 New Relic Corporation. All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

var nullable = require('./bel-serializer').nullable
var numeric = require('./bel-serializer').numeric
var getAddStringContext = require('./bel-serializer').getAddStringContext
var addCustomAttributes = require('./bel-serializer').addCustomAttributes
var now = require('now')
var mapOwn = require('map-own')

var loader = null
var harvest = require('./harvest')
var HarvestScheduler = require('./harvest-scheduler')
var register = require('./register-handler')
var subscribeToUnload = require('./unload')

var timings = []
var timingsSent = []
var lcpRecorded = false
var lcp = null
var clsSupported = false
var cls = 0
var pageHideRecorded = false

module.exports = {
  getPayload: getPayload,
  timings: timings,
  init: init,
  finalHarvest: finalHarvest
}

var harvestTimeSeconds = 30

function init(nr, options) {
  if (!isEnabled(options)) return

  loader = nr

  try {
    clsSupported = PerformanceObserver.supportedEntryTypes.includes('layout-shift') // eslint-disable-line no-undef
  } catch (e) {}

  if (!options) options = {}
  var maxLCPTimeSeconds = options.maxLCPTimeSeconds || 60
  var initialHarvestSeconds = options.initialHarvestSeconds || 10
  harvestTimeSeconds = options.harvestTimeSeconds || 30

  var scheduler = new HarvestScheduler(loader, 'events', { onFinished: onHarvestFinished, getPayload: prepareHarvest })

  register('timing', processTiming)
  register('lcp', updateLatestLcp)
  register('cls', updateClsScore)
  register('pageHide', updatePageHide)

  // final harvest is initiated from the main agent module, but since harvesting
  // here is not initiated by the harvester, we need to subscribe to the unload event
  // separately
  subscribeToUnload(finalHarvest)

  // After 1 minute has passed, record LCP value if no user interaction has occurred first
  setTimeout(function() {
    recordLcp()
    lcpRecorded = true
  }, maxLCPTimeSeconds * 1000)

  // send initial data sooner, then start regular
  scheduler.startTimer(harvestTimeSeconds, initialHarvestSeconds)
}

function recordLcp() {
  if (!lcpRecorded && lcp !== null) {
    var lcpEntry = lcp[0]
    var cls = lcp[1]

    var attrs = {
      'size': lcpEntry.size,
      'eid': lcpEntry.id
    }
    // LCP is currently implemented in all browsers which support CLS, so this case should always be true
    if (clsSupported) {
      attrs['cls'] = cls
    }

    addTiming('lcp', Math.floor(lcpEntry.startTime), attrs, false)
    lcpRecorded = true
  }
}

function updateLatestLcp(lcpEntry) {
  if (lcp) {
    var previous = lcp[0]
    if (previous.size >= lcpEntry.size) {
      return
    }
  }
  lcp = [lcpEntry, cls]
}

function updateClsScore(clsEntry) {
  if (clsSupported) {
    cls += clsEntry.value
  }
}

function updatePageHide(timestamp) {
  if (!pageHideRecorded) {
    addTiming('pageHide', timestamp, null, true)
    pageHideRecorded = true
  }
}

function recordUnload() {
  updatePageHide(now())
  addTiming('unload', now(), null, true)
}

function addTiming(name, value, attrs, addCls) {
  attrs = attrs || {}
  if (clsSupported && addCls) {
    attrs['cls'] = cls
  }

  timings.push({
    name: name,
    value: value,
    attrs: attrs
  })
}

function processTiming(name, value, attrs) {
  // Upon user interaction, the Browser stops executing LCP logic, so we can send here
  // We're using setTimeout to give the Browser time to finish collecting LCP value
  if (name === 'fi') {
    setTimeout(recordLcp, 0)
  }

  addTiming(name, value, attrs, true)
}

function onHarvestFinished(result) {
  if (result.retry && timingsSent.length > 0) {
    for (var i = 0; i < timingsSent.length; i++) {
      timings.push(timingsSent[i])
    }
    timingsSent = []
  }
}

function finalHarvest() {
  recordLcp()
  recordUnload()
  var payload = prepareHarvest({ retry: false })
  harvest.send('events', loader, payload, { unload: true })
}

function appendGlobalCustomAttributes(timing) {
  var timingAttributes = timing.attrs || {}
  var customAttributes = loader.info.jsAttributes || {}

  mapOwn(customAttributes, function (key, val) {
    if (key !== 'size' && key !== 'eid' && key !== 'cls' && key !== 'type' && key !== 'fid') {
      timingAttributes[key] = val
    }
  })
}

// serialize and return current timing data, clear and save current data for retry
function prepareHarvest(options) {
  if (timings.length === 0) return

  var payload = getPayload(timings)
  if (options.retry) {
    for (var i = 0; i < timings.length; i++) {
      timingsSent.push(timings[i])
    }
  }
  timings = []
  return { body: { e: payload } }
}

// serialize array of timing data
function getPayload(data) {
  var addString = getAddStringContext()

  var payload = 'bel.6;'

  for (var i = 0; i < data.length; i++) {
    var timing = data[i]

    payload += 'e,'
    payload += addString(timing.name) + ','
    payload += nullable(timing.value, numeric, false) + ','

    appendGlobalCustomAttributes(timing)

    var attrParts = addCustomAttributes(timing.attrs, addString)
    if (attrParts && attrParts.length > 0) {
      payload += numeric(attrParts.length) + ';' + attrParts.join(';')
    }

    if ((i + 1) < data.length) payload += ';'
  }

  return payload
}

function isEnabled(config) {
  // collect page view timings unless the feature is explicitly disabled
  if (config && config.enabled === false) {
    return false
  }
  return true
}
