
/**
 * Module dependencies
 */

var _ = require('lodash'),
    Aggregate = require('./aggregate'),
    utils = require('../utils'),
    hop = utils.object.hasOwnProperty;

/**
 * Query Constructor
 *
 * Normalizes Waterline queries to work with ElasticSearch.
 *
 * @param {Object} options
 * @api private
 */

var Query = module.exports = function Query(options, schema, typeName) {

  // Flag as an aggregate query or not
  this.aggregate = false;

  // Cache the schema for use in parseTypes
  this.schema = schema;

  this.typeName = typeName;

  // Check for Aggregate Options
  this.checkAggregate(options);

  // Normalize Criteria
  this.criteria = this.normalizeCriteria(options);
  console.log(JSON.stringify(this));
  return this;
};

/**
 * Check For Aggregates
 *
 * Checks the options to determine if an aggregate query is needed.
 *
 * @param {Object} options
 * @api private
 */

Query.prototype.checkAggregate = function checkAggregate(options) {
  var aggregateOptions = ['sum', 'average', 'min', 'max'];
  var aggregates = _.intersection(aggregateOptions, Object.keys(options));

  if(aggregates.length === 0) return options;

  this.aggregateGroup = new Aggregate(options);
  this.aggregate = true;
};


/**
 * Normalize Criteria
 *
 * Transforms a Waterline Query into a query that can be used
 * with ElasticSearch. For example it sets '>' to a Range Filter, etc.
 *
 * @param {Object} options
 * @return {Object}
 * @api private
 */

Query.prototype.normalizeCriteria = function normalizeCriteria(options) {
  "use strict";
  var self = this;

  return _.mapValues(options, function (original, key) {
    if (key === 'where') return self.parseWhere(original);
    if (key === 'sort')  return self.parseSort(original);
    return original;
  });
};


/**
 * Parse Where
 *
 * <where> ::= <clause>
 *
 * @api private
 *
 * @param original
 * @returns {*}
 */
Query.prototype.parseWhere = function parseWhere(original) {
  "use strict";
  var self = this;

  // Fix an issue with broken queries when where is null
  if(_.isNull(original) || (original.id && !original.id)) return {};

  return self.parseClause(original);
};


/**
 * Parse Clause
 *
 * <clause> ::= { <clause-pair>, ... }
 *
 * <clause-pair> ::= <field> : <expression>
 *                 | or|$or: [<clause>, ...]
 *                 | $or   : [<clause>, ...]
 *                 | $and  : [<clause>, ...]
 *                 | $nor  : [<clause>, ...]
 *                 | like  : { <field>: <expression>, ... }
 *
 * @api private
 *
 * @param original
 * @returns {*}
 */
Query.prototype.parseClause = function parseClause(original) {
  "use strict";
  var self = this;

  return _.reduce(original, function parseClausePair(obj, val, key) {
    "use strict";

    // handle Logical Operators
    if (['or', 'and'].indexOf(key) !== -1) {
      // Value of 'or', 'and' require an array, else ignore
      if (_.isArray(val)) {
        val = _.map(val, function (clause) {
          return self.parseClause(clause);
        });

        obj = val;
      }
    }

    // handle Like Operators for WQL (Waterline Query Language)
    else if (key.toLowerCase() === 'like') {
      // transform `like` clause into multiple `like` operator expressions
      _.extend(obj, _.reduce(val, function parseLikeClauses(likes, expression, field) {
        likes[field] = self.parseExpression(field, { like: expression });
        return likes;
      }, {}));
    }

    // Default
    else {
      val = self.parseExpression(key, val);
      obj = val;
    }

    return obj;
  }, {}, original);
};


/**
 * Parse Expression
 *
 * <expression> ::= { <!|not>: <value> | [<value>, ...] }
 *                | { <$not>: <expression>, ... }
 *                | { <modifier>: <value>, ... }
 *                | [<value>, ...]
 *                | <value>

 * @api private
 *
 * @param field
 * @param expression
 * @returns {*}
 */
Query.prototype.parseExpression = function parseExpression(field, expression) {
  "use strict";
  var self = this;

  // Recursively parse nested unless value is a date
  if (_.isPlainObject(expression) && !_.isDate(expression)) {
    return _.reduce(expression, function (obj, val, modifier) {

      // Handle `not` by transforming to $not, $ne or $nin
      if (modifier === '!' || modifier.toLowerCase() === 'not') {
        obj['not'] = {};
        if (_.isPlainObject(val)) {
          obj['not'] = self.parseExpression(field, val);
        } else {
          modifier = _.isArray(val) ? 'terms' : 'term';
          obj['not'][modifier] = {};
          obj['not'][modifier][field] = self.parseValue(field, modifier, val);
        }

        return obj;
      }

      // WQL Evaluation Modifiers for String
      if (_.isString(val)) {
        // Handle `contains` by building up a case insensitive regex
        if (['contains', 'like', 'startsWith', 'endsWith'].indexOf(modifier) > -1) {
          val = utils.caseInsensitive(val);
          obj['regexp'] = {};
        }

        if(modifier === 'contains') {
          val =  '.*' + val + '.*';
          obj['regexp'][field] = RegExp('^' + val + '$', 'i').toString();
          return obj;
        }

        if(modifier === 'like') {
          val = val.replace(/%/g, '.*');
          obj['regexp'][field] = RegExp('^' + val + '$', 'i').toString();
          return obj;
        }

        if(modifier === 'startsWith') {
          val =  val + '.*';
          obj['regexp'][field] = RegExp('^' + val + '$', 'i').toString();
          return obj;
        }

        if(modifier === 'endsWith') {
          val =  '.*' + val;
          obj['regexp'][field] = RegExp('^' + val + '$', 'i').toString();
          return obj;
        }
      }

      // Handle `lessThan` by transforming to $lt
      if(modifier === '<' || modifier === 'lessThan' || modifier.toLowerCase() === 'lt') {
        obj['range'] = {};
        obj['range'][field] = {};
        obj['range'][field]['lt'] = self.parseValue(field, modifier, val);
        return obj;
      }

      // Handle `lessThanOrEqual` by transforming to $lte
      if(modifier === '<=' || modifier === 'lessThanOrEqual' || modifier.toLowerCase() === 'lte') {
        obj['range'] = {};
        obj['range'][field] = {};
        obj['range'][field]['lte'] = self.parseValue(field, modifier, val);
        return obj;
      }

      // Handle `greaterThan` by transforming to $gt
      if(modifier === '>' || modifier === 'greaterThan' || modifier.toLowerCase() === 'gt') {
        obj['range'] = {};
        obj['range'][field] = {};
        obj['range'][field]['gt'] = self.parseValue(field, modifier, val);
        return obj;
      }

      // Handle `greaterThanOrEqual` by transforming to $gte
      if(modifier === '>=' || modifier === 'greaterThanOrEqual' || modifier.toLowerCase() === 'gte') {
        obj['range'] = {};
        obj['range'][field] = {};
        obj['range'][field]['gte'] = self.parseValue(field, modifier, val);
        return obj;
      }

      obj[modifier] = self.parseValue(field, modifier, val);
      return obj;
    }, {});
  }

  var ret = {};
  // <expression> ::= [value, ...], normalize array
  if (field === 'id' || field === '_id') {
    if (expression) {
      if (_.isArray(expression)) {
        ret['ids'] = {values: self.parseValue(field, '$in', expression)};
      } else {
        ret['ids'] = {values: [self.parseValue(field, undefined, expression)]};
      }
      if (self.typeName) ret['ids']['type'] = self.typeName;
    } else {
      ret['match_all'] = {};
    }
  } else {
    var __key = _.isArray(expression) ? 'terms' : 'term';
    ret[__key] = {};
    ret[__key][field] = self.parseValue(field, undefined, expression);
  }

  return ret;
};


/**
 * Parse Value
 *
 * <value> ::= RegExp | Number | String
 *           | [<value>, ...]
 *           | <plain object>
 *
 * @api private
 *
 * @param field
 * @param modifier
 * @param val
 * @returns {*}
 */
Query.prototype.parseValue = function parseValue(field, modifier, val) {
  "use strict";
  var self = this;

  if(_.isString(val)) {

    // If we can verify that the field is NOT a string type, translate
    // certain values into booleans, date or null.  Otherwise they'll be left
    // as strings.
    if (hop(self.schema, field) && self.schema[field].type != 'string') {

      if(self.schema[field].type === 'integer'){
        return parseInt(val,10);
      }

      if(self.schema[field].type === 'float'){
        return parseFloat(val);
      }

      if (val === "false") {
        return false;
      }

      if (val === "true") {
        return true;
      }

      if (val === "null") {
        return null;
      }

    }
  }

  // Array, RegExp, plain object, number
  return val;
};


/**
 * Parse Sort
 *
 * @param original
 * @returns {*}
 */
Query.prototype.parseSort = function parseSort(original) {
  "use strict";
  return _.reduce(original, function (sort, order, field) {
    // Normalize id, if used, into _id
    if (field === 'id') field = '_id';

    // Handle Sorting Order with binary or -1/1 values
    sort[field] = ([0, -1].indexOf(order) > -1) ? -1 : 1;

    return sort;
  }, {});
};
