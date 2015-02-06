/**
 * Module dependencies
 */

var Errors = require('waterline-errors').adapter;

/**
 * Aggregate Constructor
 *
 * Generates aggregation objects for use with ElasticSearch Aggregations.
 *
 * @param {Object} options
 * @api private
 */

var Aggregate = module.exports = function Aggregate(options) {

  // Hold the criteria
  this.group = {};

  // Build the group phase for an aggregation
  this.build(options);

  return this.group;
};

/**
 * Build
 *
 * Builds up an aggregate query criteria object from a
 * Waterline criteria object.
 *
 * @param {Object} options
 * @api private
 */

Aggregate.prototype.build = function build(options) {
  var self = this;

  // Check if we have calculations to do
  if(!options.sum && !options.average && !options.min && !options.max) {
    throw Errors.InvalidGroupBy;
  }

  // Create the beginnings of the $group aggregation phase
  this.group = {};

  // Build up the group for the $group aggregation phase
  if(Array.isArray(options.sum)) {
    options.sum.forEach(function(opt) {
      self.group['sum_'+opt] = { 'sum': {'field': opt } };
    });
  }

  if(Array.isArray(options.average)) {
    options.average.forEach(function(opt) {
      self.group['avg_'+opt] = { 'avg': {'field': opt } };
    });
  }

  if(Array.isArray(options.min)) {
    options.min.forEach(function(opt) {
      self.group['min_'+opt] = { 'min': {'field': opt } };
    });
  }

  if(Array.isArray(options.max)) {
    options.max.forEach(function(opt) {
      self.group['max_'+opt] = { 'max': {'field': opt } };
    });
  }
};