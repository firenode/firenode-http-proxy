
const ASSERT = require("assert");
const HTTP = require("http");


var Server = module.exports = function(options) {
	var self = this;

	self._options = options;

	ASSERT.equal(typeof self._options.port, "number");
	ASSERT.equal(typeof self._options.hostname, "string");
}

Server.prototype.listen = function (callback) {
	var self = this;

	self._server = HTTP.createServer(function (req, res) {
		return self.respond(req, res);
	});

	return self._server.listen(self._options.port, self._options.hostname, function (err) {
		if (err) return callback(err);
		return callback(null, self);
	});
}

Server.prototype.respond = function (req, res) {
	res.writeHead(200, {
		"Content-Length": 0,
		"Connection": "close"
	});
	return res.end("");
}

Server.prototype.shutdown = function (callback) {
	return this._server.close(callback);
}
