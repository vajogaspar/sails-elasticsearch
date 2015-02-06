
/**
 * Module Dependencies
 */

var _ = require('lodash');

/**
 * ignore
 */

exports.object = {};

/**
 * Safer helper for hasOwnProperty checks
 *
 * @param {Object} obj
 * @param {String} prop
 * @return {Boolean}
 * @api public
 */

var hop = Object.prototype.hasOwnProperty;
exports.object.hasOwnProperty = function(obj, prop) {
  return hop.call(obj, prop);
};

/**
 * Re-Write Mongo's _id attribute to a normalized id attribute
 *
 * @param {Array} models
 * @api public
 */

exports.rewriteIds = function rewriteIds(models, schema) {
  var _models = models.map(function(model) {
    if(hop.call(model, '_id')) {
      model.id = model._id;
      delete model._id;
    }

    return model;
  });

  return _models;
};

