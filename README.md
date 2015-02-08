![image_squidhome@2x.png](http://i.imgur.com/RIvu9.png)

# waterline-elasticsearch

Provides easy access to `elasticsearch` from Sails.js & Waterline.

This module is a Waterline/Sails adapter, an early implementation of a rapidly-developing, tool-agnostic data standard.  Its goal is to provide a set of declarative interfaces, conventions, and best-practices for integrating with all sorts of data sources.  Not just databases-- external APIs, proprietary web services, or even hardware.

Strict adherence to an adapter specification enables the (re)use of built-in generic test suites, standardized documentation, reasonable expectations around the API for your users, and overall, a more pleasant development experience for everyone.


### Installation

To install this adapter, run:

```sh
$ npm install waterline-elasticsearch
```


### Configuration

```js
{
	adapter: 'sails-elasticsearch',
	hosts: ['http://127.0.0.1:9200'],
	keepAlive: false,
	sniffOnStart: true,
	maxRetries: 10,
	deadTimeout: 40000,
	sniffOnConnectionFault: true,
	apiVersion: '1.3'
},
```

### Associations

This adapter supports the one-to-many, one-to-one and many-to-many 'through' associations.

## Associations Example:

```js
/**
* User.js
*
* @description :: TODO: You might write a short summary of how this model works and what it represents here.
* @docs        :: http://sailsjs.org/#!documentation/models
*/

module.exports = {

  attributes: {
    age : "int",
    name: "string",
    // Add a reference to Pet
    pets: {
      collection: 'pet',
      via: 'user',
      through: 'user2pet'
    }
  },
  elasticSearch: {
    mappings: {
      user: {
        properties: {
          name: {type:"string"},
          age: {type:"integer"}
        }
      }
    }
  }
};
```

```js
/**
* Pet.js
*
* @description :: TODO: You might write a short summary of how this model works and what it represents here.
* @docs        :: http://sailsjs.org/#!documentation/models
*/

module.exports = {
  attributes: {
    name:'STRING',
    color:'STRING',
    // Add a reference to User
    owners: {
      collection: 'user',
      via: 'pet',
      through: 'user2pet'
    }
  },
  elasticSearch: {
    mappings: {
      pet: {
        properties: {
          name: {type:"string"},
          color: {type:"string"}
        }
      }
    }
  }
};
```

```js
/**
* User2pet.js
*
* @description :: TODO: You might write a short summary of how this model works and what it represents here.
* @docs        :: http://sailsjs.org/#!documentation/models
*/

module.exports = {
  attributes: {
    user:{
      model: 'user'
    },
    pet: {
      model: 'pet'
    }
  },
  elasticSearch: {
    mappings: {
      user2pet: {
        properties: {
          user: {type:"string",index:"not_analyzed"},
          pet: {type:"string",index:"not_analyzed"}
        }
      }
    }
  }
};
```

```js
/**
 * Bootstrap
 * (sails.config.bootstrap)
 *
 * An asynchronous bootstrap function that runs before your Sails app gets lifted.
 * This gives you an opportunity to set up your data model, run jobs, or perform some special logic.
 *
 * For more information on bootstrapping your app, check out:
 * http://sailsjs.org/#/documentation/reference/sails.config/sails.config.bootstrap.html
 */




module.exports.bootstrap = function (cb) {

  // After we create our users, we will store them here to associate with our pets
  var storeUsers = [];

  var users = [{name:'Mike',age:'16'},{name:'Cody',age:'25'},{name:'Gabe',age:'107'}];
  var ponys = [{ name: 'Pinkie Pie', color: 'pink'},{ name: 'Rainbow Dash',color: 'blue'},{ name: 'Applejack', color: 'orange'}]

  // This does the actual associating.
  // It takes one Pet then iterates through the array of newly created Users, adding each one to it's join table
  var associate = function(onePony,cb){
    var thisPony = onePony;
    var callback = cb;

    storeUsers.forEach(function(thisUser,index){
      console.log('Associating ',thisPony.name,'with',thisUser.name);
      user2pet.create({user:thisUser.id, pet:thisPony.id}).exec(console.log);
      //this doesn't work: :(
      //thisUser.pets.add(thisPony.id);
      //thisUser.save(console.log);

      if (index === storeUsers.length-1)
        return callback(thisPony.name);
    })
  };


  // This callback is run after all of the Pets are created.
  // It sends each new pet to 'associate' with our Users
  var afterPony = function(err,newPonys){
    while (newPonys.length){
      var thisPony = newPonys.pop();
      var callback = function(ponyID){
        console.log('Done with pony ',ponyID)
      }
      associate(thisPony,callback)
    }
    console.log('Everyone belongs to everyone!! Exiting.');

    // This callback lets us leave bootstrap.js and continue lifting our app!
    return cb()
  };

  // This callback is run after all of our Users are created.
  // It takes the returned User and stores it in our storeUsers array for later.
  var afterUser = function(err,newUsers){
    while (newUsers.length)
      storeUsers.push(newUsers.pop())

    Pet.create(ponys).exec(afterPony)
  };


  User.create(users).exec(afterUser)
};
```

### Usage

This adapter exposes the following methods:

###### `search()`

+ **Status**
  + Done

###### `createIndex()`

+ **Status**
  + Done

###### `updateIndex()`

+ **Status**
  + Done

###### `destroyIndex()`

+ **Status**
  + Done

###### `countIndex()`

+ **Status**
  + Done

###### `bulk()`

+ **Status**
  + Done



### Interfaces

>TODO:
>Specify the interfaces this adapter will support.
>e.g. `This adapter implements the [semantic]() and [queryable]() interfaces.`
> For more information, check out this repository's [FAQ](./FAQ.md) and the [adapter interface reference](https://github.com/balderdashy/sails-docs/blob/master/adapter-specification.md) in the Sails docs.


### Development

Check out **Connections** in the Sails docs, or see the `config/connections.js` file in a new Sails project for information on setting up adapters.

## Getting started
It's usually pretty easy to add your own adapters for integrating with proprietary systems or existing open APIs.  For most things, it's as easy as `require('some-module')` and mapping the appropriate methods to match waterline semantics.  To get started:

1. Fork this repository
2. Set up your `README.md` and `package.json` file.  Sails.js adapter module names are of the form sails-*, where * is the name of the datastore or service you're integrating with.
3. Build your adapter.




### Running the tests

Configure the interfaces you plan to support (and targeted version of Sails/Waterline) in the adapter's `package.json` file:

```javascript
{
  //...
  "sails": {
  	"adapter": {
	    "sailsVersion": "~0.10.0",
	    "implements": [
	      "semantic",
	      "queryable"
	    ]
	  }
  }
}
```

In your adapter's directory, run:

```sh
$ npm test
```


## Publish your adapter

> You're welcome to write proprietary adapters and use them any way you wish--
> these instructions are for releasing an open-source adapter.

1. Create a [new public repo](https://github.com/new) and add it as a remote (`git remote add origin git@github.com:yourusername/sails-youradaptername.git)
2. Make sure you attribute yourself as the author and set the license in the package.json to "MIT".
3. Run the tests one last time.
4. Do a [pull request to sails-docs](https://github.com/balderdashy/sails-docs/compare/) adding your repo to `data/adapters.js`.  Please let us know about any special instructions for usage/testing.
5. We'll update the documentation with information about your new adapter
6. Then everyone will adore you with lavish praises.  Mike might even send you jelly beans.

7. Run `npm version patch`
8. Run `git push && git push --tags`
9. Run `npm publish`




### Questions?

See [`FAQ.md`](./FAQ.md).



### More Resources

- [Stackoverflow](http://stackoverflow.com/questions/tagged/sails.js)
- [#sailsjs on Freenode](http://webchat.freenode.net/) (IRC channel)
- [Twitter](https://twitter.com/sailsjs)
- [Professional/enterprise](https://github.com/balderdashy/sails-docs/blob/master/FAQ.md#are-there-professional-support-options)
- [Tutorials](https://github.com/balderdashy/sails-docs/blob/master/FAQ.md#where-do-i-get-help)
- <a href="http://sailsjs.org" target="_blank" title="Node.js framework for building realtime APIs."><img src="https://github-camo.global.ssl.fastly.net/9e49073459ed4e0e2687b80eaf515d87b0da4a6b/687474703a2f2f62616c64657264617368792e6769746875622e696f2f7361696c732f696d616765732f6c6f676f2e706e67" width=60 alt="Sails.js logo (small)"/></a>


### License

**[MIT](./LICENSE)**
&copy; 2014 [balderdashy](http://github.com/balderdashy) & [contributors]
[Mike McNeil](http://michaelmcneil.com), [Balderdash](http://balderdash.co) & contributors

[Sails](http://sailsjs.org) is free and open-source under the [MIT License](http://sails.mit-license.org/).


[![githalytics.com alpha](https://cruel-carlota.pagodabox.com/8acf2fc2ca0aca8a3018e355ad776ed7 "githalytics.com")](http://githalytics.com/balderdashy/waterline-elasticsearch/README.md)


