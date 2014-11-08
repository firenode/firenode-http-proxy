
const ASSERT = require("assert");
const WAITFOR = require("waitfor");
const EVENTS = require("events");
const HTTP = require("http");
const HTTP_PROXY = require("http-proxy");


var Proxy = module.exports = function (options) {
	var self = this;

	self._options = options;

	ASSERT.equal(typeof self._options.port, "number");
	ASSERT.equal(typeof self._options.hostname, "string");
	ASSERT.equal(typeof self._options.backend, "object");
	ASSERT.equal(typeof self._options.backend.port, "number");
	ASSERT.equal(typeof self._options.backend.hostname, "string");
	ASSERT.equal(Array.isArray(self._options.plugins), true);
}

Proxy.prototype.listen = function (callback) {
	var self = this;

    var proxy = HTTP_PROXY.createProxyServer({});
    self._server = HTTP.createServer(function(req, res) {

        function respond500 (err) {
            console.error("error request", req.url);
            console.error(err.stack);
            res.writeHead(500);
            return res.end("Internal server error!");
        }

        var host = (req.headers.host && req.headers.host.split(":").shift()) || null;
        if (!host) {
            res.writeHead(404);
            console.error("Virtual host not set!", req.url, req.headers);
            return res.end("Virtual host not set!");
        }


        try {
            // @see http://stackoverflow.com/a/19524949/330439
            var ip =
                req.headers['x-forwarded-for'] || 
                req.connection.remoteAddress || 
                req.socket.remoteAddress ||
                req.connection.socket.remoteAddress;

            req.headers['x-forwarded-for'] = ip + (
                req.headers['x-forwarded-for'] ?
                    ", " + req.headers['x-forwarded-for'] :
                    ""
            );

        	var pluginApi = new EVENTS.EventEmitter();
        	pluginApi.responded = false;
            pluginApi.getBackendUrl = function (path) {
                return "http://" + self._options.backend.hostname + ":" + self._options.backend.port + (path || "")
            }
            pluginApi.returnStream = function (stream, callback) {

                if (pluginApi.responded) {
                    return callback(new Error("Already responded!"));
                }
                pluginApi.responded = true;

                if (self._options.debug) {
                    console.log("Sending back stream");
                }

                res.once('error', function (err) {
                    stream.end();
                });
                stream.pipe(res);
                return stream.once("close", function () {
                    return callback();
                });
            }
        	pluginApi.proxyBackend = function (callback) {
    			if (!callback) {
    				callback = function (err) {
    					if (err) return respond500(err);
    					return;
    				}
    			}
    			if (pluginApi.responded) {
    				return callback(new Error("Already responded!"));
    			}
                pluginApi.responded = true;

			    if (self._options.debug) {
		            console.log("Proxy request", req.url, req.headers);
		        }

	            return proxy.web(req, res, {
	                target: pluginApi.getBackendUrl()
	            }, function(err) {
	                if (err.code === "ECONNREFUSED") {
	                    res.writeHead(502);
	                    res.end("Bad Gateway");
	                    return callback();
	                }
	                return callback(err);
	            });
        	};

            var waitfor = WAITFOR.serial(function (err) {
            	if (err) return respond500(err);

            	if (pluginApi.responded) return;

        		return pluginApi.proxyBackend();
            });

            self._options.plugins.forEach(function (plugin) {
            	if (typeof plugin.processRequest !== "function") return;

            	return waitfor(function (done) {
                    plugin._proxy = self;
            		return plugin.processRequest(pluginApi, req, res, done);
            	});
            });

            return waitfor();

        } catch(err) {
            return respond500(err);
        }
    });

    var httpServer = self._server.listen(self._options.port, self._options.hostname);

    if (self._options.debug) {
	    console.log("[http-response-cache] Proxy listening on: http://" + self._options.hostname + ":" + self._options.port);
    }

    return callback(null, self);
}

Proxy.prototype.shutdown = function (callback) {
	return this._server.close(callback);
}

