
// CONVENTION: Assign un-named module objects (only identified by filename) to a namespace that is exported.
//             The entire exported API namespace must be configurable from this file.


exports.Proxy = require("./lib/proxy");

// TODO: Lazy load
exports.plugins = {
    StaticCache: require("./lib/plugins/static-cache")
}

