/**
 * Module Dependencies
 */
var _ = require('lodash'),
    Connection = require('./connection'),
    Collection = require('./collection'),
    _runJoins = require('waterline-cursor'),
    Errors = require('waterline-errors').adapter;

/**
 * sails-elasticsearch
 *
 * Most of the methods below are optional.
 *
 * If you don't need / can't get to every method, just implement
 * what you have time for.  The other methods will only fail if
 * you try to call them!
 *
 * For many adapters, this file is all you need.  For very complex adapters, you may need more flexiblity.
 * In any case, it's probably a good idea to start with one file and refactor only if necessary.
 * If you do go that route, it's conventional in Node to create a `./lib` directory for your private submodules
 * and load them at the top of the file with other dependencies.  e.g. var update = `require('./lib/update')`;
 */
module.exports = (function () {

  // You'll want to maintain a reference to each connection
  // that gets registered with this adapter.
  var connections = {};

  var adapter = {

    // Which type of primary key is used by default
    pkFormat: 'string',

    // to track schema internally
    syncable: true,


    // Default configuration for connections
    defaults: {
      hosts: ['127.0.0.1:9200'],
      sniffOnStart: true,
      sniffOnConnectionFault: true,
      keepAlive: false,
      apiVersion: '1.3',
      indexName: 'sails'
    },

    /**
     *
     * This method runs when a model is initially registered
     * at server-start-time.  This is the only required method.
     *
     * @param  {[type]}   connection [description]
     * @param  {[type]}   collection [description]
     * @param  {Function} cb         [description]
     * @return {[type]}              [description]
     */
    registerConnection: function(connection, collections, cb) {
      if(!connection.identity) return cb(Errors.IdentityMissing);
      if(connections[connection.identity]) return cb(Errors.IdentityDuplicate);

      // Store the connection
      connections[connection.identity] = {
        config: connection,
        collections: {}
      };

      // Create a new active connection
      new Connection(connection, function(err, es) {
        if(err) return cb(err);
        connections[connection.identity].connection = es;

        // Build up a registry of collections
        _.keys(collections).forEach(function(key) {
          connections[connection.identity].collections[key] = new Collection(collections[key], es);
        });

        //update mappings
        es._closeIndex(function(_err, res) {
          if(_err) return cb(_err);

          async.each(_.values(connections[connection.identity].collections), function(it, next) {
            it._putMapping(next);
          }, function(__err, _res) {
            es._openIndex(cb);
          });
        });
      });
    },


    /**
     * Fired when a model is unregistered, typically when the server
     * is killed. Useful for tearing-down remaining open connections,
     * etc.
     *
     * @param  {Function} cb [description]
     * @return {[type]}      [description]
     */
    // Teardown a Connection
    teardown: function (conn, cb) {
      if (typeof conn == 'function') {
        cb = conn;
        conn = null;
      }
      if (conn === null) {
        connections = {};
        return cb();
      }
      if(!connections[conn]) return cb();
      delete connections[conn];
      cb();
    },


    // Return attributes
    describe: function (connectionName, collectionName, cb) {
      var connectionObject = connections[connectionName];
      var collection = connectionObject.collections[collectionName];
      var schema = collection.schema;

      connectionObject._hasType(collection.identity, function(err, exists) {
        if(exists) return cb(null, schema);
        cb();
      });
    },

    /**
     *
     * REQUIRED method if integrating with a schemaful
     * (SQL-ish) database.
     *
     */
    define: function (connection, collection, definition, cb) {
      console.log('define');
      // Add in logic here to create a collection (e.g. CREATE TABLE logic)
      return collection._putMapping(cb);
    },

    /**
     *
     * REQUIRED method if integrating with a schemaful
     * (SQL-ish) database.
     *
     */
    drop: function (connectionName, collectionName, relations, cb) {
      var connectionObject = connections[connectionName],
          collection = connectionObject.collections[collectionName];

      console.log('drop');

      // Drop the collection and indexes
      collection._deleteMapping(cb);
    },

    /**
     * Native
     *
     * Give access to a native mongo collection object for running custom
     * queries.
     *
     * @param {String} connectionName
     * @param {String} collectionName
     * @param {Function} callback
     */

    native: function(connectionName, collectionName, cb) {

      var connectionObject = connections[connectionName];
      cb(null, connectionObject.client);

    },

    /**
     * Create
     *
     * Insert a single document into a collection.
     *
     * @param {String} connectionName
     * @param {String} collectionName
     * @param {Object} data
     * @param {Function} callback
     */
    create: function(connectionName, collectionName, data, cb) {
      var connectionObject = connections[connectionName];
      var collection = connectionObject.collections[collectionName];
      // Insert a new document into the collection
      collection.insert(data, function(err, results) {
        if(err) return cb(err);
        cb(null, results[0]);
      });
    },

    /**
     * Create Each
     *
     * Insert an array of documents into a collection.
     *
     * @param {String} connectionName
     * @param {String} collectionName
     * @param {Object} data
     * @param {Function} callback
     */
    createEach: function(connectionName, collectionName, data, cb) {
      if (data.length === 0) {return cb(null, []);}
      var connectionObject = connections[connectionName];
      var collection = connectionObject.collections[collectionName];
      var bulk = [];
      data.forEach(function(it) {
        bulk.concat([
          {index: {_index: connectionObject.indexName, _type: collection.identity}},
          it
        ]);
      });
      // Insert a new documents into the index
      collection.insert(data, function(err, results) {
        if(err) return cb(err);
        cb(null, results);
      });
    },

    /**
     * Find
     *
     * Find all matching documents.
     *
     * @param {String} connectionName
     * @param {String} collectionName
     * @param {Object} options
     * @param {Function} callback
     */
    find: function(connectionName, collectionName, options, cb) {
      options = options || {};
      var connectionObject = connections[connectionName];
      var collection = connectionObject.collections[collectionName];

      // Find all matching documents
      collection.find(options, function(err, results) {
        if(err) return cb(err);
        cb(null, results);
      });
    },

    /**
     * Update
     *
     * Update all documents matching a criteria object in a collection.
     *
     * @param {String} connectionName
     * @param {String} collectionName
     * @param {Object} options
     * @param {Object} values
     * @param {Function} callback
     */
    update: function(connectionName, collectionName, options, values, cb) {
      options = options || {};
      var connectionObject = connections[connectionName];
      var collection = connectionObject.collections[collectionName];

      // Update matching documents
      collection.update(options, values, function(err, results) {
        if(err) return cb(err);
        cb(null, results);
      });
    },

    /**
     * Destroy
     *
     * Destroy all documents matching a criteria object in a collection.
     *
     * @param {String} connectionName
     * @param {String} collectionName
     * @param {Object} options
     * @param {Function} callback
     */
    destroy: function(connectionName, collectionName, options, cb) {
      options = options || {};
      var connectionObject = connections[connectionName];
      var collection = connectionObject.collections[collectionName];

      // Find matching documents
      collection.find(options, function(err, results) {
        if(err) return cb(err);

        // Destroy matching documents
        collection.destroy(options, function(err) {
          if(err) return cb(err);
          cb(null, results);
        });
      });
    },

    /**
     * Count
     *
     * Return a count of the number of records matching a criteria.
     *
     * @param {String} connectionName
     * @param {String} collectionName
     * @param {Object} options
     * @param {Function} callback
     */
    count: function(connectionName, collectionName, options, cb) {
      options = options || {};
      var connectionObject = connections[connectionName];
      var collection = connectionObject.collections[collectionName];

      // Find matching documents and return the count
      collection.count(options, function(err, results) {
        if(err) return cb(err);
        cb(null, results);
      });
    },

    /**
     * Join
     *
     * Peforms a join between 2-3 mongo collections when Waterline core
     * needs to satisfy a `.populate()`.
     *
     * @param  {[type]}   connectionName [description]
     * @param  {[type]}   collectionName [description]
     * @param  {[type]}   criteria       [description]
     * @param  {Function} cb             [description]
     * @return {[type]}                  [description]
     */
    join: function (connectionName, collectionName, criteria, cb) {

      // Ignore `select` from waterline core
      if (typeof criteria === 'object') {
        delete criteria.select;
      }

      var connectionObject = connections[connectionName];
      var collection = connectionObject.collections[collectionName];

      // Populate associated records for each parent result
      // (or do them all at once as an optimization, if possible)
      _runJoins({

        instructions: criteria,
        parentCollection: collectionName,

        /**
         * Find some records directly (using only this adapter)
         * from the specified collection.
         *
         * @param  {String}   collectionIdentity
         * @param  {Object}   criteria
         * @param  {Function} cb
         */
        $find: function (collectionIdentity, criteria, cb) {
          var connectionObject = connections[connectionName];
          var collection = connectionObject.collections[collectionIdentity];
          return collection.find(criteria, cb);
        },

        /**
         * Look up the name of the primary key field
         * for the collection with the specified identity.
         *
         * @param  {String}   collectionIdentity
         * @return {String}
         */
        $getPK: function (collectionIdentity) {
          if (!collectionIdentity) return;
          var connectionObject = connections[connectionName];
          var collection = connectionObject.collections[collectionIdentity];
          return collection._getPK();
        }
      }, cb);

    },


    bulk: function (connectionName, collectionName, options, cb) {
      var connectionObject = connections[connectionName],
          collection = connectionObject.collections[collectionName];


      // Bulk documents
      collection.bulk(options, function(err, results) {
        if(err) return cb(err);
        cb(null, results);
      });
    },

    identity: 'sails-elasticsearch'
  };

  // Expose adapter definition
  return adapter;
})();