/**
 * lazyModelProxy.js
 * v9.4.2 — Lazy-bound model Proxy helper for shared/ re-export files.
 *
 * Some files in src/shared/models/ are thin re-export proxies that
 * expose a platform-plane model compiled against platformConnection.
 * Since those proxies are required at module load time (before
 * platformConnection.init() has finished), they cannot call
 * getPlatformModel() synchronously.
 *
 * makeLazyPlatformModel(def) returns a Proxy object that behaves like a
 * Mongoose Model BUT defers the getPlatformModel(def) call to the first
 * property access / instantiation. By then the platform connection is
 * initialised.
 *
 * Usage:
 *   // src/shared/models/Region.model.js
 *   const { makeLazyPlatformModel } = require("@core/db/lazyModelProxy");
 *   const RegionDef = require("../../platform/domain/models/Region.model");
 *   module.exports = makeLazyPlatformModel(RegionDef);
 */

"use strict";

const getPlatformModel = require("./getPlatformModel");
const getSharedModel = require("./getSharedModel");

function _makeProxy(def, bind) {
    let cached = null;
    const resolve = () => cached || (cached = bind(def));
    return new Proxy(function () {}, {
        get(_target, prop) {
            // Expose the underlying Def (modelName/schema) without
            // compiling — so destructuring consumers don't force a bind.
            if (prop === "__def") return def;
            if (prop === "modelName") return def.modelName;
            if (prop === "schema") return def.schema;
            const m = resolve();
            const v = m[prop];
            return typeof v === "function" ? v.bind(m) : v;
        },
        set(_target, prop, value) {
            resolve()[prop] = value;
            return true;
        },
        has(_target, prop) {
            if (prop === "__def" || prop === "modelName" || prop === "schema") return true;
            return prop in resolve();
        },
        apply(_target, thisArg, args) {
            return resolve().apply(thisArg, args);
        },
        construct(_target, args) {
            const Model = resolve();
            return new Model(...args);
        },
    });
}

function makeLazyPlatformModel(def) {
    return _makeProxy(def, getPlatformModel);
}

function makeLazySharedModel(def) {
    return _makeProxy(def, getSharedModel);
}

module.exports = { makeLazyPlatformModel, makeLazySharedModel };
