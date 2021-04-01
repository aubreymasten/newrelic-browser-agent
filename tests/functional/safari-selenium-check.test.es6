// https://github.com/SeleniumHQ/selenium/issues/7649
// once latest Safari does not have this bug, we can remove this

import testDriver from '../../tools/jil/index.es6'

const BrowserMatcher = testDriver.Matcher

const supported = new BrowserMatcher()
  .exclude('*')
  .include('safari', '>=13')

testDriver.test('Selenium button click is captured', supported, function (t, browser, router) {
  t.plan(1)

  let url = router.assetURL('safari-selenium-check.html')
  let loadPromise = browser.safeGet(url).catch(fail)

  Promise.all([loadPromise])
    .then(() => {
      let domPromise = browser
        .elementById('standardBtn')
        .click()
        .eval('window.testValue')

      return Promise.all([domPromise]).then(([testValue]) => {
        t.equal(testValue, 0, 'if this fails, click worked, and this test should be removed')
      })
    })
    .catch(fail)

  function fail (err) {
    t.error(err)
    t.end()
  }
})
