const mongoose = require("mongoose")
const redis = require("redis")
const util = require("util")
const { redisUrl } = require("../config/keys")

const client = redis.createClient(redisUrl)
const exec = mongoose.Query.prototype.exec

client.hget = util.promisify(client.hget)

mongoose.Query.prototype.cache = function(options = {}) {
  this.useCache = true
  this.hashKey = JSON.stringify(options.key || "")

  return this
}

mongoose.Query.prototype.exec = async function() {
  if (!this.useCache) {
    return exec.apply(this, arguments)
  }

  const key = JSON.stringify({
    ...this.getQuery(),
    collection: this.mongooseCollection.name
  })

  // check value for "key" in redis, if so return that
  const cacheValue = await client.hget(this.hashKey, key)

  if (cacheValue) {
    const doc = JSON.parse(cacheValue)

    return Array.isArray(doc)
      ? doc.map(d => new this.model(d))
      : new this.model(doc)
  }

  // otherwise, issue the qurey & save the data in redis
  const result = await exec.apply(this, arguments)
  client.hmset(this.hashKey, key, JSON.stringify(result), "EX", 30)

  return result
}

module.exports = {
  clearHash(hashKey) {
    client.del(JSON.stringify(hashKey))
  }
}
