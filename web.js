// LDP operations
var Solid = Solid || {}
Solid.web = (function () {
  'use strict'

  // Init some defaults
  var PROXY = 'https://databox.me/,proxy?uri={uri}'
  var TIMEOUT = 5000

  $rdf.Fetcher.crossSiteProxyTemplate = PROXY
  // common vocabs
  var LDP = $rdf.Namespace('http://www.w3.org/ns/ldp#')

  // return metadata for a given request
  function parseResponseMeta (resp) {
    var h = Solid.utils.parseLinkHeader(resp.getResponseHeader('Link'))
    var meta = {}
    meta.url = (resp.getResponseHeader('Location')) ? resp.getResponseHeader('Location') : resp.responseURL
    meta.acl = h['acl']
    meta.meta = (h['meta']) ? h['meta'] : h['describedBy']
    meta.user = (resp.getResponseHeader('User')) ? resp.getResponseHeader('User') : ''
    meta.websocket = (resp.getResponseHeader('Updates-Via')) ? resp.getResponseHeader('Updates-Via') : ''
    // writable/editable resource
    meta.editable = []
    var patch = resp.getResponseHeader('Accept-Patch')
    if (patch && patch.indexOf('application/sparql-update') >= 0) {
      meta.editable.push('patch')
    }
    var allow = resp.getResponseHeader('Allow')
    if (allow) {
      if (allow.indexOf('PUT') >= 0) {
        meta.editable.push('put')
      }
      if (allow.indexOf('POST') >= 0) {
        meta.editable.push('post')
      }
      if (allow.indexOf('DELETE') >= 0) {
        meta.editable.push('delete')
      }
    }

    meta.exists = (resp.status === 200)
    meta.xhr = resp
    return meta
  }

  // check if a resource exists and return useful Solid info (acl, meta, type, etc)
  // resolve(metaObj)
  function head (url) {
    var promise = new Promise(function (resolve) {
      var http = new XMLHttpRequest()
      http.open('HEAD', url)
      http.withCredentials = true
      http.onreadystatechange = function () {
        if (this.readyState === this.DONE) {
          resolve(parseResponseMeta(this))
        }
      }
      http.send()
    })

    return promise
  }

  // fetch an RDF resource
  // resolve(graph) | reject(this)
  function get (url) {
    var promise = new Promise(function (resolve, reject) {
      var g = $rdf.graph()
      var f = new $rdf.Fetcher(g, TIMEOUT)

      var docURI = (url.indexOf('#') >= 0) ? url.slice(0, url.indexOf('#')) : url
      f.nowOrWhenFetched(docURI, undefined, function (ok, body, xhr) {
        if (!ok) {
          reject({status: xhr.status, xhr: xhr})
        } else {
          resolve(g)
        }
      })
    })

    return promise
  }

  // create new resource
  // resolve(metaObj) | reject
  function post (url, data, slug, isContainer, mime) {
    var resType = LDP('Resource').uri
    if (isContainer) {
      resType = LDP('BasicContainer').uri
      mime = 'text/turtle' // force right mime for containers only
    }
    mime = (mime) ? mime : 'text/turtle'
    var promise = new Promise(function (resolve, reject) {
      var http = new XMLHttpRequest()
      http.open('POST', url)
      http.setRequestHeader('Content-Type', mime)
      http.setRequestHeader('Link', '<' + resType + '>; rel="type"')
      if (slug && slug.length > 0) {
        http.setRequestHeader('Slug', slug)
      }
      http.withCredentials = true
      http.onreadystatechange = function () {
        if (this.readyState === this.DONE) {
          if (this.status === 200 || this.status === 201) {
            resolve(parseResponseMeta(this))
          } else {
            reject({status: this.status, xhr: this})
          }
        }
      }
      if (data && data.length > 0) {
        http.send(data)
      } else {
        http.send()
      }
    })

    return promise
  }

  // update/create resource using HTTP PUT
  // resolve(metaObj) | reject
  function put (url, data, mime) {
    var promise = new Promise(function (resolve, reject) {
      mime = (mime) ? mime : 'text/turtle'
      var http = new XMLHttpRequest()
      http.open('PUT', url)
      http.setRequestHeader('Content-Type', mime)
      http.withCredentials = true
      http.onreadystatechange = function () {
        if (this.readyState === this.DONE) {
          if (this.status === 200 || this.status === 201) {
            return resolve(parseResponseMeta(this))
          } else {
            reject({status: this.status, xhr: this})
          }
        }
      }
      if (data) {
        http.send(data)
      } else {
        http.send()
      }
    })

    return promise
  }

  // patch a resource
  // accepts arrays of individual statements (turtle) as params
  // e.g. [ '<a> <b> <c> .', '<d> <e> <f> .']
  function patch (url, toDel, toIns) {
    var promise = new Promise(function (resolve, reject) {
      var data = ''
      var i

      if (toDel && toDel.length > 0) {
        for (i = 0; i < toDel.length; i++) {
          if (i > 0) {
            data += ' ;\n'
          }
          data += 'DELETE DATA { ' + toDel[i] + ' }'
        }
      }
      if (toIns && toIns.length > 0) {
        for (i = 0; i < toIns.length; i++) {
          if (i > 0 || (toDel && toDel.length > 0)) {
            data += ' ;\n'
          }
          data += 'INSERT DATA { ' + toIns[i] + ' }'
        }
      }

      var http = new XMLHttpRequest()
      http.open('PATCH', url)
      http.setRequestHeader('Content-Type', 'application/sparql-update')
      http.withCredentials = true
      http.onreadystatechange = function () {
        if (this.readyState === this.DONE) {
          if (this.status === 200) {
            return resolve(parseResponseMeta(this))
          } else {
            reject({status: this.status, xhr: this})
          }
        }
      }
      if (data && data.length > 0) {
        http.send(data)
      } else {
        http.send()
      }
    })

    return promise
  }

  // delete a resource
  // resolve(true) | reject
  function del (url) {
    var promise = new Promise(function (resolve, reject) {
      var http = new XMLHttpRequest()
      http.open('DELETE', url)
      http.withCredentials = true
      http.onreadystatechange = function () {
        if (this.readyState === this.DONE) {
          if (this.status === 200) {
            return resolve(true)
          } else {
            reject({status: this.status, xhr: this})
          }
        }
      }
      http.send()
    })

    return promise
  }

  // return public methods
  // aliasing post -> create, put -> replace, patch -> update
  return {
    head: head,
    get: get,
    post: post,
    create: post,
    put: put,
    replace: put,
    patch: patch,
    update: patch,
    del: del
  }
}(this))
