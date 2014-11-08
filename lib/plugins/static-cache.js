
const ASSERT = require("assert");
const PATH = require("path");
const FS = require("fs-extra");
const SMI_CACHE = require("smi.cache");
const SEND = require("send");


var StaticCache = module.exports = function (options) {
	var self = this;

	self._proxy = null;		// Set by proxy!
	self._options = options || {};

	ASSERT.equal(typeof self._options.cacheBasePath, "string");

	self._shouldCacheUrls = {};

	// Init cache directory
	if (!FS.existsSync(self._options.cacheBasePath)) {
		FS.mkdirsSync(self._options.cacheBasePath);
	}
	self._urlCache = new SMI_CACHE.UrlProxyCache(self._options.cacheBasePath, {
		ttl: 0    // Indefinite by default.
	});
}

StaticCache.prototype.processRequest = function (api, req, res, callback) {
	var self = this;

	var url = api.getBackendUrl(req.url);

	if (self._shouldCacheUrls[url]) {

		if (self._options.debug) {
			console.log("[http-response-cache] Respond using cached url:", url);
		}

		return self._urlCache.get(url, {
			loadBody: false,
			headers: req.headers,
			ttl: undefined,
			verbose: self._options.debug || false,
			debug: self._options.debug || false,
			useExistingOnError: true
		}, function(err, response) {
			if (err) return callback(err);

			return FS.stat(response.cachePath, function (err, stat) {
				if (err) return callback(err);

				var headers = response.headers;
				headers['content-length'] = stat.size;
				delete headers['transfer-encoding'];

	    		// TODO: Use wf namespace.
				headers['x-proxy-source'] = "cache";

				// TODO: Send status 304 if not modified.
				res.writeHead(200, headers);

				// TODO: Record cache hit.

				return api.returnStream(FS.createReadStream(response.cachePath), callback);
			});
		});
	}


	// Process response headers to see if we should cache next call.

	function parseResponseHeadersBlob(headersBlob) {
		var headers = {};
		headersBlob.split("\n").map(function (line) {
			var m = line.match(/^([^:]+):\s*(.+)\r?$/);
			if (m) {
				headers[m[1].toLowerCase()] = m[2];
			}
			return null;
		});
		return headers;
	}

	res.once("finish", function() {

		var headers = parseResponseHeadersBlob(res._header);

		var shouldCache = false;

		if (headers['etag']) {
			shouldCache = {
				basedOnTag: "etag"
			};
		} else
		if (headers['expires']) {
			shouldCache = {
				basedOnTag: "expires",
				expires: new Date(headers['expires'])
			};
		} else
		if (req.url === "/favicon.ico") {
			shouldCache = {
				basedOnUrl: "/favicon.ico"
			};
		}

		if (shouldCache) {

			if (self._options.debug) {
				console.log("[http-response-cache] Adding url to cache:", url, shouldCache);
			}

			self._shouldCacheUrls[url] = shouldCache;
		}
	});


	return api.proxyBackend(callback);
}

