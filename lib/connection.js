
/**
 * Module dependencies
 */

var Elasticsearch = require('elasticsearch');

/**
 * Manage a connection to a ElasticSearch Server
 *
 * @param {Object} config
 * @return {Object}
 * @api private
 */

var Connection = module.exports = function Connection(config, cb) {
  var self = this;
  // Hold the config object
  this.config = config || {};

  this.elasticSearch = this.config.elasticSearch || {};
  delete this.config.elasticSearch;

  this.indexName = this.config.indexName;
  delete this.config.indexName;


  // Build Elasticsearch connection
  this.client = new Elasticsearch.Client(this.config);

  this._hasIndex(this.indexName, function _chechkIndexExists(err, exists) {
    if (err) return cb(err);
    if (!exists) {
      self._createIndex(self.indexName, function(_err, _resp) {
        if (_err) return cb(_err);
        return cb(null, self);
      });
    } else {
      return cb(null, self);
    }
  });
};

/**
 * Create A Collection
 *
 * @param {String} name
 * @param {Object} collection
 * @param {Function} callback
 * @api public
 */

Connection.prototype.createCollection = function createCollection(name, collection, cb) {
  // Create the Collection
  collection._putMapping(cb);
};

/**
 * Drop A Collection
 *
 * @param {String} name
 * @param {Function} callback
 * @api public
 */

Connection.prototype.dropCollection = function dropCollection(name, cb) {
  this._deleteMapping(name, cb);
};

Connection.prototype._createIndex = function _createIndex(indexName, cb) {
  this.client.indices.create({
    index:indexName,
    body: this.elasticSearch
  }, cb);
};

Connection.prototype._hasIndex = function _hasIndex(indexName, cb) {
  this.client.indices.exists({
    index:indexName
  }, cb);
};

Connection.prototype._deleteIndex = function _deleteIndex(indexName, cb) {
  this.client.indices.delete({
    index: indexName
  }, cb);
};

Connection.prototype._hasType = function _hasType(typeName, cb) {
  this.client.indices.existsType({
    index: this.indexName,
    type: typeName
  }, cb);
};

Connection.prototype._deleteMapping = function _deleteMapping(typeName, cb) {
  this.client.indices.deleteMapping({
    index: this.indexName,
    type: typeName
  }, cb);
};

Connection.prototype._putMapping = function _putMapping(typeName, mapping, cb) {
  this.client.indices.putMapping({
    index: this.indexName,
    type: typeName,
    ignoreConflicts: true,
    body: mapping
  }, cb);
};

Connection.prototype._getMapping = function _getMapping(typeName, cb) {
  this.client.indices.getMapping({
    index: this.indexName,
    type: typeName
  }, cb);
};

Connection.prototype._closeIndex = function _closeIndex(cb) {
  this.client.indices.close({
    index: this.indexName
  }, function(err, response) {
    cb(null, true);
  });
};

Connection.prototype._openIndex = function _openIndex(cb) {
  this.client.indices.open({
    index: this.indexName
  }, cb);
};
