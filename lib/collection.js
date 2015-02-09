
/**
 * Module dependencies
 */

var _ = require('lodash'),
    async = require('async'),
    utils = require('./utils'),
    Document = require('./document'),
    Query = require('./query'),
    Errors = require('waterline-errors').adapter;

/**
 * Manage A Collection
 *
 * @param {Object} definition
 * @api public
 */

var Collection = module.exports = function Collection(definition, connection) {
  // Set an identity for this collection
  this.identity = '';

  // Hold Schema Information
  this.schema = null;

  // Migrate type
  this.migrate = null;

  // Primary key
  this.primaryKey = null;

  // Hold a reference to an active connection
  this.connection = connection;

  // Hold client
  this.client = connection.client;

  // Parse the definition into collection attributes
  this._parseDefinition(definition);

  // Build an indexes dictionary
  //this._buildIndexes();

  return this;
};


/////////////////////////////////////////////////////////////////////////////////
// PUBLIC METHODS
/////////////////////////////////////////////////////////////////////////////////

/**
 * Search Documents
 *
 * @param {Object} criteria
 * @param {Function} callback
 * @api public
 */

Collection.prototype.find = function find(criteria, cb) {
  var self = this,
      query;

  console.log('---COLLECTION::find -> criteria:');
  console.log(criteria);
  // Ignore `select` from waterline core
  if (typeof criteria === 'object') {
    delete criteria.select;
  }

  var whereKeys = _.keys(criteria.where);
  if (whereKeys.length === 1 && whereKeys[0] === 'id' && criteria.where.id) {
    self.connection.client.mget({
        index: self.connection.indexName,
        type: self.identity,
        body: {
          ids:(Array.isArray(criteria.where.id) ? criteria.where.id : [criteria.where.id])
        }
      }, function(err, results) {
        if(err) return cb(err);
        var docsArray = [];

        results.docs.forEach(function(it) {
          if (it.found) {
            it._source['id'] = it._id;
            docsArray.push(it._source);
          }
        });

        self._lastResults = results;
        cb(null, utils.rewriteIds(docsArray, self.schema));
      });

    return;
  }

  // Catch errors from building query and return to the callback
  try {
    query = new Query(criteria, this.schema, this.identity);
  } catch(err) {
    return cb(err);
  }

  var filter = {
    query: {
      filtered: {
        filter: (query.criteria.where || {})
      }
    },
    size: query.criteria.limit,
    from: query.criteria.skip
  };

  // Check for aggregate query
  if(query.aggregate) {
    filter.aggs = query.aggregateGroup;
  }

  if (query.facets) {
    filter.facets = query.facets;
  }

  var queryOptions = _.omit(query.criteria, 'where');

  console.log(JSON.stringify(filter));

  this.connection.client.search({
    index: this.connection.indexName,
    type: this.identity,
    body: filter
  }, function(err, results) {
    var docsArray = [];
    if(err) return cb(err);
    if (results.hits && results.hits.hits) {
      results.hits.hits.forEach(function(it) {
        it._source['id'] = it._id;
        docsArray.push(it._source);
      });
    }

    self._lastResults = results;
    if (query.aggregate || query.facets) {
      cb(null, {aggregations: results.aggregations, facets: results.facets, docs:utils.rewriteIds(docsArray, self.schema)});
    } else {
      cb(null, utils.rewriteIds(docsArray, self.schema));
    }
  });

};

/**
 * Insert A New Document
 *
 * @param {Object|Array} values
 * @param {Function} callback
 * @api public
 */

Collection.prototype.insert = function insert(values, cb) {
  var self = this;

  console.log('---COLLECTION::insert');
  console.log(JSON.stringify(values));
  // Normalize values to an array
  if(!Array.isArray(values)) values = [values];

  // Build a Document and add the values to a new array
  var docs = values.map(function(value) {
    return new Document(value, self.schema).values;
  });

  var bulk = [];
  docs.forEach(function(it) {
    bulk.push({index: {_index: self.connection.indexName, _type: self.identity}});
    bulk.push(it);
  });

  self.client.bulk({
    index: self.connection.indexName,
    type: self.identity,
    body: bulk
  }, function (err, response) {
    if(err) return cb(err);
    var ids = [];

    response.items.forEach(function(it) {
      ids.push(it.index ? it.index._id : it.create._id);
    });

    self.connection.client.mget({
        index: self.connection.indexName,
        type: self.identity,
        body: {
          ids: ids
        }
      }, function(err, results) {
        if(err) return cb(err);
        var docsArray = [];
        results.docs.forEach(function(it) {
          it._source['id'] = it._id;
          docsArray.push(it._source);
        });

        self._lastResults = results;
        cb(null, utils.rewriteIds(docsArray, self.schema));
      });
  });
};

/**
 * Update Documents
 *
 * @param {Object} criteria
 * @param {Object} values
 * @param {Function} callback
 * @api public
 */

Collection.prototype.update = function update(criteria, values, cb) {
  var self = this,
      query;

  console.log('---COLLECTION::update');
  console.log(criteria);
  console.log(JSON.stringify(values));
  // Ignore `select` from waterline core
  if (typeof criteria === 'object') {
    delete criteria.select;
  }

  // Catch errors from building query and return to the callback
  try {
    query = new Query(criteria, this.schema, this.identity);
  } catch(err) {
    return cb(err);
  }

  var filter = {
    query: {
      filtered: {
        filter: (query.criteria.where || {})
      }
    }
  };

  values = new Document(values, this.schema).values;

  // Mongo doesn't allow ID's to be updated
  if(values.id) delete values.id;
  if(values._id) delete values._id;

  this.connection.client.search({
    index: this.connection.indexName,
    type: this.identity,
    body: filter
  }, function(err, results) {
    if(err) return cb(err);
    if(!(results.hits || {}).hits) return cb(Errors.NotFound);
    self._lastResults = results;
    // Build an array of records
    var updatedRecords = [];

    async.each(results.hits.hits, function updateRecord(item, next) {
      updatedRecords.push(item._id);
      self.connection.client.update({
        index: self.connection.indexName,
        type: self.identity,
        id: item._id,
        body: {
          doc: values
        }
      }, next);
    }, function(err) {
      if(err) return cb(err);
      //all the ecords are updated
      self.connection.client.mget({
        index: self.connection.indexName,
        type: self.identity,
        body: {
          ids: updatedRecords
        }
      }, function(err, results) {
        if(err) return cb(err);
        var docsArray = [];
        results.docs.forEach(function(it) {
          it._source['id'] = it._id;
          docsArray.push(it._source);
        });

        self._lastResults = results;
        cb(null, utils.rewriteIds(docsArray, self.schema));
      });
    });
  });
};

/**
 * Destroy Documents
 *
 * @param {Object} criteria
 * @param {Function} callback
 * @api public
 */

Collection.prototype.destroy = function destroy(criteria, cb) {
  var self = this,
      query;

  console.log('---COLLECTION::destroy');
  console.log(criteria);
  // Ignore `select` from waterline core
  if (typeof criteria === 'object') {
    delete criteria.select;
  }

  // Catch errors build query and return to the callback
  try {
    query = new Query(criteria, this.schema, this.identity);
  } catch(err) {
    return cb(err);
  }

  var filter = {
    query: {
      filtered: {
        filter: (query.criteria.where || {})
      }
    }
  };

  var whereKeys = _.keys(criteria.where);
  if (whereKeys.length === 1 && whereKeys[0] === 'id') {
    self.connection.client.mget({
        index: self.connection.indexName,
        type: self.identity,
        _source: false,
        body: {
          ids:(Array.isArray(criteria.where.id) ? criteria.where.id : [criteria.where.id])
        }
      }, function(err, results) {
        if(err) return cb(err);
        var docsArray = [];

        results.docs.forEach(function(it) {
          if (it.found) {
            docsArray.push({id:it._id});
          }
        });

        self.connection.client.deleteByQuery({
          index: self.connection.indexName,
          type: self.identity,
          body: filter
        }, function(err, response) {
          if (err) return cb(err);
          cb(null, docsArray);
        });
      });

  } else {

    self.connection.client.search({
      index: self.connection.indexName,
      type: self.identity,
      _source: false,
      body: filter
    }, function(err, results) {
      var docsArray = [];
      if(err) return cb(err);
      if (results.hits && results.hits.hits) {
        results.hits.hits.forEach(function(it) {
          docsArray.push({id:it._id});
        });
      }

      self.connection.client.deleteByQuery({
        index: self.connection.indexName,
        type: self.identity,
        body: filter
      }, function(err, response) {
        if (err) return cb(err);
        cb(null, docsArray);
      });
    });
  }
};

/**
 * Count Documents
 *
 * @param {Object} criteria
 * @param {Function} callback
 * @api public
 */

Collection.prototype.count = function count(criteria, cb) {

  var self = this;
  var query;

  // Ignore `select` from waterline core
  if (typeof criteria === 'object') {
    delete criteria.select;
  }

  // Catch errors build query and return to the callback
  try {
    query = new Query(criteria, this.schema, this.identity);
  } catch(err) {
    return cb(err);
  }

  var filter = {
    query: {
      filtered: {
        filter: (query.criteria.where || {})
      }
    }
  };

  this.connection.client.count({
    index: this.connection.indexName,
    type: this.identity,
    body: filter
  }, function(err, results) {
    if (err) return cb(err);
    cb(null, results.count);
  });
};

/**
 * Search Documents
 *
 * @param {Object} criteria
 * @param {Function} callback
 * @api public
 */

Collection.prototype.search = function search(criteria, cb) {
  var self = this;

  self.client.search({
    index: self.connection.indexName,
    tyoe: self.identity,
    body: criteria
  }, function (err, docs) {
    if(err) return cb(err);
    cb(null, docs);
  });
};

/**
 * Insert a new Document index
 *
 * @param {Object|Array} values
 * @param {Function} callback
 * @api public
 */

Collection.prototype._insert = function _insert(values, cb) {
  var self = this,
      id = values[self.primaryKey];

  self.client.create({
    index: self.connection.indexName,
    type: self.identity,
    id: id,
    body: values
  }, function (err, docs) {
    if(err) return cb(err);
    cb(null, docs);
  });
};

/**
 * Update index from Document
 *
 * @param {Object|Array} values
 * @param {Function} callback
 * @api public
 */

Collection.prototype._update = function _update(id, values, cb) {
  var self = this;

  self.client.update({
    index: self.connection.indexName,
    type: self.identity,
    id: id,
    body: {
      doc: values
    }
  }, function (err, docs) {
    if(err) return cb(err);
    cb(null, docs);
  });
};

/**
 * Delete document by ID
 *
 * @param {Object|Array} values
 * @param {Function} callback
 * @api public
 */

Collection.prototype._destroy = function _destroy(id, cb) {
  var self = this;

  self.client.delete({
    index: self.connection.indexName,
    type: self.identity,
    id: id
  }, function (err, docs) {
    if(err) return cb(err);
    cb(null, docs);
  });
};

/**
 * Bulk Documents
 *
 * @param {Object} criteria
 * @param {Function} callback
 * @api public
 */

Collection.prototype._bulk = function _bulk(options, cb) {
  var self = this;

  self.client.bulk({
    index: self.connection.indexName,
    type: self.identity,
    body: options
  }, function (err, docs) {
    if(err) return cb(err);
    cb(null, docs);
  });
};


///////////////////////////////////////////////////////////////////////////////////
//// PRIVATE METHODS
///////////////////////////////////////////////////////////////////////////////////

/**
 * Get name of primary key field for this collection
 *
 * @return {String}
 * @api private
 */
Collection.prototype._getPK = function _getPK () {
  var self = this;
  var pk;

  _.keys(this.schema).forEach(function(key) {
    if(self.schema[key].primaryKey) pk = key;
  });

  if(!pk) pk = 'id';
  return pk;
};

/**
 * Parse Collection Definition
 *
 * @param {Object} definition
 * @api private
 */

Collection.prototype._parseDefinition = function _parseDefinition(definition) {
  var self = this,
      collectionDef = _.cloneDeep(definition);

  // Hold the Schema
  this.schema = collectionDef.definition;

  this.migrate = collectionDef.migrate;

  this.primaryKey = collectionDef.primaryKey;

  if (_.has(this.schema, 'id') && this.schema.id.primaryKey && this.schema.id.type === 'integer') {
    this.schema.id.type = 'string';
  }

  // Remove any Auto-Increment Keys, Mongo currently doesn't handle this well without
  // creating additional collection for keeping track of the increment values
  Object.keys(this.schema).forEach(function(key) {
    if(self.schema[key].autoIncrement) delete self.schema[key].autoIncrement;
  });

  // Replace any foreign key value types with ObjectId
  Object.keys(this.schema).forEach(function(key) {
    if(self.schema[key].foreignKey) {
      self.schema[key].type = 'string';
    }
  });

  // Set the identity
  var ident = definition.tableName ? definition.tableName : definition.identity.toLowerCase();
  this.identity = _.clone(ident);

  var index = definition.elasticSearch ? definition.elasticSearch : {mappings:{}};
  if (!definition.elasticSearch) {
    index.mappings[self.identity] = {properties:{}};
    //console.log(definition.schema);
    Object.keys(self.schema).forEach(function(it) {
      if (self.schema[it].foreignKey) {
        index.mappings[self.identity].properties[it] = {type: self.schema[it].type, index:"not_analyzed"};
      }
    });
    //console.log(index);
  }
  //console.log(index);
  this.elasticSearch = _.clone(index);
};

Collection.prototype._putMapping = function _putMapping(cb) {
  console.log('put mapping: '+this.identity);
  console.log(this.elasticSearch);
  if(this.elasticSearch.mappings) {
    this.connection._putMapping(this.identity, this.elasticSearch.mappings, cb);
  } else {
    cb(null, null);
  }
};

Collection.prototype._deleteMapping = function _deleteMapping(cb) {
  this.connection._deleteMapping(this.identity, cb);
};