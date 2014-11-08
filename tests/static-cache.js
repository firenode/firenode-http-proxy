
const ASSERT = require("assert");
const PATH = require("path");
const FS = require("fs-extra");
const REQUEST = require("request");
const SERVER = require("./assets/server");
const PROXY = require("..");


describe("static-cache", function() {

	this.timeout(60 * 60 * 1000);

	var backendServer = null;
	var backendServerConfig = {
		hostname: "127.0.0.1",
		port: 8081
	};

	var proxyServer = null;
	var proxyServerConfig = {
		hostname: "127.0.0.1",
		port: 8080,
		backend: backendServerConfig,
		plugins: [
			new PROXY.plugins.StaticCache({
				debug: false,
				cacheBasePath: PATH.join(__dirname, ".cache")
			})
		]
	};


	function request(method, path, headers, callback) {
		return REQUEST({
			method: method,
		    url: "http://" + proxyServerConfig.hostname + ":" + proxyServerConfig.port + path,
		    headers: headers
		}, function(err, res, body) {
		    if (err) return callback(err);
		    return callback(null, res.statusCode, res.headers, body);
		});
	}

    it("prepare", function(done) {
    	if (FS.existsSync(PATH.join(__dirname, ".cache"))) {
    		FS.removeSync(PATH.join(__dirname, ".cache"));
    	}
    	return done();
    });

    it("start", function(done) {
    	function startBackendServer (callback) {
	    	var server = new SERVER(backendServerConfig);
	    	return server.listen(function (err, api) {
	    		if (err) return callback(err);
	    		backendServer = api;
	    		return callback(null);
	    	});
    	}
    	function startProxyServer (callback) {
			var proxy = new PROXY.Proxy(proxyServerConfig);
			return proxy.listen(function (err, api) {
				if (err) return callback(err);
				proxyServer = api;
		        return callback();
			});
		}
		return startBackendServer(function (err) {
			if (err) return done(err);
			return startProxyServer(done);
		});
    });



    it("request: default", function(done) {
    	return request("GET", "/", {}, function (err, status, headers, body) {
    		if (err) return done(err);
    		ASSERT.equal(status, 200);
    		ASSERT.equal(typeof headers['x-proxy-source'], "undefined");
    		ASSERT.equal(body, "");
			return done();
    	});
    });

    it("request: 404", function(done) {
    	backendServer.respond = function (req, res) {
			res.writeHead(404, {
				"Content-Length": 0,
				"Connection": "close"
			});
			return res.end();
		}
    	return request("GET", "/", {}, function (err, status, headers, body) {
    		if (err) return done(err);
    		ASSERT.equal(status, 404);
    		ASSERT.equal(typeof headers['x-proxy-source'], "undefined");
    		ASSERT.equal(body, "");
			return done();
    	});
    });

    it("request: Expires header only", function(done) {
    	var now = Date.now();
    	var expires = new Date(now + 1 * 1000).toUTCString();
    	backendServer.respond = function (req, res) {
			res.writeHead(200, {
				"Expires": expires,
				"Content-Length": ("" + now).length,
				"Connection": "close"
			});
			return res.end("" + now);
		}
    	return request("GET", "/", {}, function (err, status, headers, body) {
    		if (err) return done(err);
    		ASSERT.equal(status, 200);
    		ASSERT.equal(headers.expires, expires);
    		// TODO: Use wf namespace.
    		ASSERT.equal(typeof headers['x-proxy-source'], "undefined");
    		ASSERT.equal(body, now);

	    	return request("GET", "/", {}, function (err, status, headers, body) {
	    		if (err) return done(err);
	    		ASSERT.equal(status, 200);
	    		ASSERT.equal(headers.expires, expires);
	    		// TODO: Use wf namespace.
	    		ASSERT.equal(headers['x-proxy-source'], "cache");
	    		ASSERT.equal(body, now);

		    	return request("GET", "/", {}, function (err, status, headers, body) {
		    		if (err) return done(err);
		    		ASSERT.equal(status, 200);
		    		ASSERT.equal(headers.expires, expires);
		    		// TODO: Use wf namespace.
		    		ASSERT.equal(headers['x-proxy-source'], "cache");
		    		ASSERT.equal(body, now);

					return done();
		    	});
	    	});
    	});
    });

/*
    it("request: Cache-Control max-age header only", function(done) {
    	backendServer.respond = function (req, res) {

res.setHeader('Cache-Control', 'max-age=345600'); // 4 days

			res.writeHead(404, {
				"Expires": 
			});
			return res.end();
		}
    	return request("GET", "/", {}, function (err, status, headers, body) {
    		if (err) return done(err);
    		ASSERT.equal(status, 404);
    		ASSERT.equal(body, "");
			return done();
    	});
    });
*/

    it("stop", function(done) {
    	function stopBackendServer (callback) {
			return backendServer.shutdown(callback);
		}
    	function stopProxyServer (callback) {
			return proxyServer.shutdown(callback);
		}
		return stopProxyServer(function (err) {
			if (err) return done(err);
			return stopBackendServer(done);
		});
    });

});
