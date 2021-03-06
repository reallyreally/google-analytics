'use strict';

var ua = require('universal-analytics');

module.exports = function reallyGoogleAnalytics(options) {
  if (typeof options === 'string' || options instanceof String) {
    var googleUA = options;
    options = {
      ua: googleUA
    }
  } else {
    options = options || {};
  }

  if (options.ua !== undefined && options.ua !== null) {
    if (options.ds === undefined || options.ds === null) {
      options.ds = 'WebApp';
    }

    var visitor = ua(options.ua, {
      https: true
    });

  }

  var clientid;
  var userid;

  return function reallyGoogleAnalytics(req, res, next) {

    if (visitor) {

      var start = new Date();

      var getIP = function() {
        var ipAddress;

        if (options.override && options.override.ip) {
          if (req.header(options.override.ip)) {
            return req.header(options.override.ip);
          }
        }

        var forwardedIpsStr = req.header('x-forwarded-for');
        if (forwardedIpsStr) {
          // 'x-forwarded-for' header may return multiple IP addresses in
          // the format: "client IP, proxy 1 IP, proxy 2 IP" so take the
          // the first one
          var forwardedIps = forwardedIpsStr.split(',');
          ipAddress = forwardedIps[0];
        }
        if (!ipAddress) {
          // Ensure getting client IP address still works in
          // development environment
          ipAddress = req.connection.remoteAddress ||
            req.socket.remoteAddress ||
            req.connection.socket.remoteAddress;
        }
        return ipAddress;
      }

      var getHostname = function() {
        if (options.override && options.override.hostname) {
          if (req.header(options.override.hostname)) {
            return req.header(options.override.hostname);
          }
        }

        return (req.headers.host.match(/:/g)) ? req.headers.host.slice(0, req.headers.host.indexOf(":")) : req.headers.host;
      }

      var getReferer = function() {
        if (options.override && options.override.referer) {
          if (req.header(options.override.referer)) {
            return req.header(options.override.referer);
          }
        }

        var referer = req.get('Referrer');
        return referer;
      }

      var getDocumentPath = function() {
        return req.originalUrl;
      }

      var getUserAgent = function() {
        if (options.override && options.override.useragent) {
          if (req.header(options.override.useragent)) {
            return req.header(options.override.useragent);
          }
        }

        return req.get('User-Agent');
      }

      var ip = getIP();
      var hostname = getHostname();
      var referer = getReferer();
      var documentPath = getDocumentPath();
      var userAgent = getUserAgent();

      var logger = req.app.get('logger');
      if(!logger){
        logger = {};
        logger.info = console.log;
      }

      var uaParamsBase = {};

      if (hostname) uaParamsBase.documentHostName = hostname;
      if (documentPath) uaParamsBase.documentPath = documentPath;
      if (ip) uaParamsBase.ipOverride = ip;
      if (referer) uaParamsBase.documentReferrer = referer;
      if (userAgent) uaParamsBase.userAgentOverride = userAgent;
      if (options.ds) uaParamsBase.dataSource = options.ds;

      if (req.analytics === undefined) req.analytics = {};

      req.analytics.sendEvent = function(eventCategory, eventAction, eventLabel, eventValue, cb) {
        if (eventCategory === undefined || eventAction === undefined) {
          var err = new Error();
          err.message = 'Must at least supply an event category and action';
          throw err;
        }

        var eventParams = JSON.parse(JSON.stringify(uaParamsBase));

        eventParams.ec = eventCategory;
        eventParams.ea = eventAction;
        if (eventLabel) eventParams.el = eventLabel;
        if (eventValue) eventParams.ev = eventValue;

        if (clientid !== undefined && clientid !== null) eventParams.cid = clientid;
        if (userid !== undefined && userid !== null) eventParams.uid = userid;

        if(options.debug && logger) logger.info(JSON.stringify({"sendEvent" : eventParams}));
        visitor.event(eventParams, function(err) {
          if (cb) return cb(err);
          if (err) {
            throw err;
          }
          return;
        })
      }

      req.analytics.setClientID = function(newClientID) {
        clientid = newClientID;
        return;
      }

      req.analytics.setUserID = function(newUserID) {
        userid = newUserID;
        return;
      }

      var sendPageView = function() {
        res.removeListener('finish', sendPageView);
        res.removeListener('close', sendPageView);

        var pageViewParams = JSON.parse(JSON.stringify(uaParamsBase));

        if (clientid !== undefined && clientid !== null) pageViewParams.cid = clientid;
        if (userid !== undefined && userid !== null) pageViewParams.uid = userid;
        pageViewParams.plt = new Date() - start;

        if(options.debug && logger) logger.info(JSON.stringify({"pageView" : pageViewParams}));
        visitor.pageview(pageViewParams, function(err) {
          if (err) {
            throw err;
          }
          return;
        })
      }

      res.on('finish', sendPageView);
      res.on('close', sendPageView);

      return next();
    } else {
      return next();
    }

  }

}
