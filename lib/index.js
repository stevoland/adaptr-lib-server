'use strict';

var browserify = require('browserify');
var cookie = require('cookie');
var debug = require('debug')('adaptr:log');
var error = require('debug')('adaptr:error');
var interpolate = require('interpolate');
var objectAssign = require('object-assign');


var Profile = require('adaptr-profile');

function hasClientTests (detects) {
  return Object.keys(detects).some(function (key) {
    return !!detects[key].clientTest;
  });
}

var defaultOptions = {
  timeout: 1000,
  cookieName: 'adaptr',
  cookieMaxAge: 1000 * 60 * 60,
  cookiePath: '/',
  serverPath: '/adaptr',
  clientVarName: 'adaptr',
  profileClassPath: 'adaptr-profile'
};

var getInstance = function (detects, options) {
  var uidHelper = 0;
  var pendingRequests = {};

  options = objectAssign(defaultOptions, options);

  function resolveRequest (id, profile) {
    if (pendingRequests[id]) {
      clearTimeout(pendingRequests[id].timeout);
      pendingRequests[id].callback(profile);
      debug('Resolved request', id);
    }

    delete pendingRequests[id];
  }

  function pauseRequest (continueCallback, timeoutPeriod) {
    var id = uidHelper;

    uidHelper += 1;

    pendingRequests[id] = {
      timeout: setTimeout(function () {
          debug('Timedout request', id);
          resolveRequest(id, new Profile());
        }, timeoutPeriod),
      callback: continueCallback
    };

    debug('Paused request', id);

    return id;
  }

  function getClientMarkup (requestId, cookieData, callback) {
    var requestBeacon = !cookieData && hasClientTests(detects);

    var b = browserify(null, {
      basedir: __dirname
    });

    Object.keys(detects).forEach(function (key) {
      if (detects[key].clientTest) {
        b.require(detects[key].clientTest + '.js', {
          expose: detects[key].clientTest
        });
      }
    });

    b.require(options.profileModelPath + '.js', {
      expose: 'adaptr-profile'
    });

    b.add(['adaptr-lib-client']);

    b.bundle(function (err, buffer) {
      var markup = '';

      if (err) {
        error(err);
        markup = '<!-- adaptr: An error occured generating the client bundle, check the log -->';
      } else {
        markup = '<script>' + buffer.toString() + '</script>';

        if (requestBeacon) {
          markup += '<noscript>' +
            '<link href="{serverPath}.css?id={requestId}" rel="stylesheet" />' +
            '</noscript>';
        }

        markup = interpolate(markup, {
          requestId: requestId,
          serverPath: options.serverPath,
          cookieName: options.cookieName,
          cookiePath: options.cookiePath,
          cookieMaxAge: options.cookieMaxAge,
          requestBeacon: requestBeacon ? '1' : '',
          detect: JSON.stringify(detects),
          data: JSON.stringify(cookieData),
          clientVarName: options.clientVarName
        });
      }

      callback(err, markup);
    });
  }

  function getCookieData (rawCookieValue) {
    var cookies = cookie.parse(rawCookieValue || '');
    var cookieValue = cookies[options.cookieName];
    var data;

    if (cookieValue) {
      try {
        data = JSON.parse(cookieValue);
      } catch (e) {}
    }

    return data;
  }

  function isBeaconPath (path) {
    return (path.indexOf(options.serverPath + '.js') === 0 ||
            path.indexOf(options.serverPath + '.css') === 0);
  }

  function getProfileClass () {
    return require(options.profileClassPath);
  }

  return {
    pauseRequest: pauseRequest,
    resolveRequest: resolveRequest,
    getClientMarkup: getClientMarkup,
    getCookieData: getCookieData,
    isBeaconPath: isBeaconPath,
    getProfileClass: getProfileClass
  };
};

module.exports = {
  hasClientTests: hasClientTests,
  getInstance: getInstance
};
