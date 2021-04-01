import testDriver from '../../../tools/jil/index.es6'
import {assertErrorAttributes, verifyStackTraceOmits, getErrorsFromResponse} from './assertion-helpers.es6'

let supported = testDriver.Matcher.withFeature('reliableUnloadEvent')

testDriver.test('reporting uncaught errors from external scripts', supported, function (t, browser, router) {
  let rumPromise = router.expectRumAndErrors()
  let loadPromise = browser.get(router.assetURL('external-uncaught-error.html', {
    init: {
      page_view_timing: {
        enabled: false
      }
    }
  }))

  Promise.all([rumPromise, loadPromise]).then(([response]) => {
    assertErrorAttributes(t, response.query)
    const actualErrors = getErrorsFromResponse(response, browser)
    verifyStackTraceOmits(t, actualErrors, 'secretValue')
    verifyStackTraceOmits(t, actualErrors, 'secretFragment')

    t.end()
  }).catch(fail)

  function fail (err) {
    t.error(err)
    t.end()
  }
})
