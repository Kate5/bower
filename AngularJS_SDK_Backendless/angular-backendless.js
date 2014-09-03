(function(){
    var BackendlessAngular = angular.module("Backendless", []);

    function isEmpty(obj){
        if (obj == null) return true;
        if (angular.isArray(obj) || angular.isString(obj)) return obj.length === 0;
        for (var key in obj) {
            if (obj.hasOwnProperty(key) && obj[key] !== undefined && obj[key] !== null) {
                return false
            }
        }
        return true;
    }

    function isLocalStorageSupported() {
        try {
            if (isBrowser() && ('localStorage' in window && window['localStorage'])) {
                localStorage.setItem('localStorageTest', true);
                localStorage.removeItem('localStorageTest');
                return true;
            } else {
                return false;
            }
        } catch (e) {
            return false;
        }
    }
    if(isLocalStorageSupported()){
        if(!localStorage["Backendless"]){
            localStorage["Backendless"] = JSON.stringify({});
        }
    }

    BackendlessAngular.config(function($httpProvider){
        delete $httpProvider.defaults.headers.common['X-Requested-With'];
        $httpProvider.defaults.transformResponse.push(function(data){
            try{
                return JSON.parse(data);
            } catch(e) {
                return data;
            }
        });
    });

    var UIState = null;

    function initXHR() {
        try {
            if (typeof XMLHttpRequest.prototype.sendAsBinary == 'undefined') {
                XMLHttpRequest.prototype.sendAsBinary = function (text) {
                    var data = new ArrayBuffer(text.length);
                    var ui8a = new Uint8Array(data, 0);
                    for (var i = 0; i < text.length; i++) ui8a[i] = (text.charCodeAt(i) & 0xff);
                    this.send(ui8a);
                }
            }
        }
        catch (e) {
        }
    }

    var getNow = function () {
        return new Date().getTime();
    };

    var getClassName = function () {
        var instStringified = (angular.isFunction(this) ? this.toString() : this.constructor.toString()),
            results = instStringified.match(/function\s+(\w+)/);
        return (results && results.length > 1) ? results[1] : '';
    };

    var encodeArrayToUriComponent = function (arr) {
        var props = [], i, len;
        for (i = 0, len = arr.length; i < len; ++i) {
            props.push(encodeURIComponent(arr[i]));
        }
        return props.join(',');
    };

    var classWrapper = function (obj) {
        var wrapper = function (obj) {
            var wrapperName = null,
                wrapperFunc = null;
            for (var property in obj) {
                if (obj.hasOwnProperty(property)) {
                    if (property === "___class") {
                        wrapperName = obj[property];
                        break;
                    }
                }
            }
            if (wrapperName) {
                try {
                    wrapperFunc = eval(wrapperName);
                    obj = deepExtend(new wrapperFunc(), obj);
                } catch (e) {
                }
            }
            return obj;
        };
        if (angular.isObject(obj) && obj != null) {
            if (angular.isArray(obj)) {
                for (var i = obj.length; i--;) {
                    obj[i] = wrapper(obj[i]);
                }
            } else {
                obj = wrapper(obj);
            }
        }
        return obj;
    };

    var deepExtend = function (destination, source) {
        for (var property in source) {
            if (source[property] !== undefined && source.hasOwnProperty(property)) {
                destination[property] = destination[property] || {};
                destination[property] = classWrapper(source[property]);
            }
        }
        return destination;
    };

    var emptyFn = (function () {
    });

    function isBrowser() {
        return typeof window !== "undefined";// && !module && !module.exports;
    }

    BackendlessAngular.value("$config", {
        serverURL: "https://api.backendless.com",
        appId: null,
        secretKey: null,
        appVersion : null,
        appPath : null
    });

    BackendlessAngular.value("currentUser", null);

    BackendlessAngular.factory("$initApp", function($config, currentUser){
        currentUser = null;
        return function(appId, secretKey, appVersion){
            this.serverURL = $config.serverURL;
            this.secretKey = $config.secretKey = secretKey;
            this.appId = $config.appId = appId;
            this.appVersion = $config.appVersion = appVersion;
            this.appPath = $config.appPath = [$config.serverURL, $config.appVersion].join("/");
        }
    });

    BackendlessAngular.factory("User", function(){
        return function BackendlessUser(username, password){
            this.___class = "Users";
            this.email = username;
            this.password = password;
        }
    });

    BackendlessAngular.factory("$UserService", function($config, $http, $q, User, currentUser){
        function UserService(){}
        UserService.prototype = {
            login: function(username, password, stayLoggedIn){
                var deffered = $q.defer(), data = {
                        login: username,
                        password: password
                    }, self = this,
                    backendlessObj = JSON.parse(localStorage["Backendless"]);
                backendlessObj['stayLoggedIn'] = false;
                if (stayLoggedIn) {
                    backendlessObj['stayLoggedIn'] = true;
                    localStorage.setItem('Backendless',JSON.stringify(backendlessObj));
                }
                var headers = {"application-id":$config.appId, "secret-key":$config.secretKey,"application-type":"JS","Content-Type":"application/json"};
                if ((currentUser != null && currentUser["user-token"])) {
                    headers["user-token"] = currentUser["user-token"];
                } else if (backendlessObj["user-token"]) {
                    headers["user-token"] = backendlessObj["user-token"];
                }
                $http.post($config.appPath + "/users/login", data, {headers:headers})
                    .success(function(data){
                        currentUser = self._getUserFromResponse(data);
                        deffered.resolve(currentUser);
                    })
                    .error(function(e){
                        deffered.resolve(e);
                    });
                return deffered.promise;
            },
            isValidLogin: function () {
                var userToken = "",
                    validUser = "",
                    self = this,
                    backendlessObj = JSON.parse(localStorage["Backendless"]);
                console.info(backendlessObj);
                if (backendlessObj["user-token"]) {
                    userToken = backendlessObj["user-token"];
                    var deffered = $q.defer();
                    $http.get($config.appPath + '/users/isvalidusertoken/' + userToken, {headers:{"application-id":$config.appId, "secret-key":$config.secretKey,"application-type":"JS","Content-Type":"application/json","user-token":userToken}})
                        .success(function(data){
                            deffered.resolve(data);
                        })
                        .error(function(e){
                            deffered.resolve(e);
                        });
                    return deffered.promise;
                } else {
                    validUser = self.getCurrentUser();
                    return (validUser) ? true : false;
                }
            },
            register: function (user) {
                var deffered = $q.defer(), self = this;
                if (!(user instanceof User)) {
                    throw new Error('Only Backendless.User accepted');
                }
                $http.post($config.appPath + "/users/register", user, {headers:{"application-id":$config.appId, "secret-key":$config.secretKey,"application-type":"JS","Content-Type":"application/json"}})
                    .success(function(data){
                        deffered.resolve(self._getUserFromResponse(data));
                    })
                    .error(function(e){
                        deffered.resolve(e);
                    });
                return deffered.promise;
            },
            getUserRoles: function(){
                var deffered = $q.defer();
                $http.get($config.appPath + "/users/userroles", {headers:{"application-id":$config.appId, "secret-key":$config.secretKey,"application-type":"JS","Content-Type":"application/json"}})
                    .success(function(data){
                        deffered.resolve(data);
                    })
                    .error(function(e){
                        deffered.resolve(e);
                    });
                return deffered.promise;
            },
            roleHelper: function (username, rolename, operation) {
                if (!username) {
                    throw new Error('Username can not be empty');
                }
                if (!rolename) {
                    throw new Error('Rolename can not be empty');
                }
                var deffered = $q.defer();
                var data = {
                    user: username,
                    roleName: rolename
                };
                $http.post($config.appPath + "/users/" + operation, data, {headers:{"application-id":$config.appId, "secret-key":$config.secretKey,"application-type":"JS","Content-Type":"application/json"}})
                    .success(function(data){
                        deffered.resolve(data);
                    })
                    .error(function(e){
                        deffered.resolve(e);
                    });
                return deffered.promise;
            },

            assignRole: function (username, rolename) {
                return this.roleHelper(username, rolename, 'assignRole');
            },

            unassignRole: function (username, rolename) {
                return this.roleHelper(username, rolename, 'unassignRole');
            },
            _getUserFromResponse: function(user){
                var newUser = new User(),
                    backendlessObj = JSON.parse(localStorage["Backendless"]);
                for (var i in user) {
                    if (user.hasOwnProperty(i)) {
                        if (i == 'user-token') {
                            if (backendlessObj["stayLoggedIn"]) {
                                backendlessObj["user-token"] = user[i];
                                localStorage.setItem('Backendless', JSON.stringify(backendlessObj));
                            }
                            continue;
                        }
                        newUser[i] = user[i];
                    }
                }
                return newUser;
            },
            getCurrentUser: function(){
                return currentUser ? this._getUserFromResponse(currentUser) : null;
            },
            update: function(user){
                var deffered = $q.defer(), self = this;
                if (!(user instanceof User)) {
                    throw new Error('Only Backendless.User accepted');
                }
                $http.put($config.appPath + "/users/" + user.objectId, user, {headers:{"application-id":$config.appId, "secret-key":$config.secretKey,"application-type":"JS","Content-Type":"application/json"}})
                    .success(function(data){
                        deffered.resolve(self._getUserFromResponse(data));
                    })
                    .error(function(e){
                        deffered.resolve(e);
                    });
                return deffered.promise;
            },
            logout: function(){
                var deffered = $q.defer();
                function logOut(){
                    currentUser = null;
                    var backendlessObj = JSON.parse(localStorage['Backendless']);
                    delete backendlessObj["user-token"];
                    delete backendlessObj["stayLoggedIn"];
                    localStorage['Backendless'] = JSON.stringify(backendlessObj);
                }
                $http.get($config.appPath + "/users/logout", {headers:{"application-id":$config.appId, "secret-key":$config.secretKey,"application-type":"JS","Content-Type":"application/json"}})
                    .success(function(){
                        logOut();
                        deffered.resolve(true);
                    })
                    .error(function(e){
                        if(typeof e == 'object' && [3064, 3091, 3090, 3023].indexOf(e.code) != -1){
                            logOut();
                            deffered.resolve(true);
                        } else {
                            deffered.resolve(e);
                        }
                    });
                return deffered.promise;
            },
            describeUserClass: function () {
                var deffered = $q.defer();
                $http.get($config.appPath + "/users/userclassprops", {headers:{"application-id":$config.appId, "secret-key":$config.secretKey,"application-type":"JS","Content-Type":"application/json"}})
                    .success(function(data){
                        deffered.resolve(data);
                    })
                    .error(function(e){
                        deffered.resolve(e);
                    });
                return deffered.promise;
            },

            restorePassword: function (emailAddress) {
                if (!emailAddress) {
                    throw 'Username can not be empty';
                }
                var deffered = $q.defer();
                $http.get($config.appPath + "/users/restorepassword/" + emailAddress, {headers:{"application-id":$config.appId, "secret-key":$config.secretKey,"application-type":"JS","Content-Type":"application/json"}})
                    .success(function(data){
                        deffered.resolve(true);
                    })
                    .error(function(e){
                        deffered.resolve(e);
                    });
                return deffered.promise;
            },
            loginWithFacebook: function (facebookFieldsMapping, permissions, callback, container) {
                this._loginSocial('Facebook', facebookFieldsMapping, permissions, callback, container);
            },
            loginWithTwitter: function (twitterFieldsMapping, callback) {
                this._loginSocial('Twitter', twitterFieldsMapping, null, callback, null);
            },
            _socialContainer: function (socialType, container) {
                var loadingMsg;

                if (container) {
                    var client;

                    container = container[0];
                    loadingMsg = document.createElement('div');
                    loadingMsg.innerHTML = "Loading...";
                    container.appendChild(loadingMsg);
                    container.style.cursor = 'wait';

                    this.closeContainer = function () {
                        container.style.cursor = 'default';
                        container.removeChild(client);
                    };

                    this.removeLoading = function () {
                        container.removeChild(loadingMsg);
                    };

                    this.doAuthorizationActivity = function (url) {
                        this.removeLoading();
                        client = document.createElement('iframe');
                        client.frameBorder = 0;
                        client.width = container.style.width;
                        client.height = container.style.height;
                        client.id = "SocialAuthFrame";
                        client.setAttribute("src", url + "&amp;output=embed");
                        container.appendChild(client);
                        client.onload = function () {
                            container.style.cursor = 'default';
                        }
                    }
                }
                else {
                    container = window.open('', socialType + ' authorization', 'height=250,width=450,scrollbars=0,toolbar=0,menubar=0,location=0,resizable=0,status=0,titlebar=0', false);
                    loadingMsg = container.document.getElementsByTagName('body')[0].innerHTML;
                    loadingMsg = "Loading...";
                    container.document.getElementsByTagName('html')[0].style.cursor = 'wait';

                    this.closeContainer = function () {
                        container.close();
                    };

                    this.removeLoading = function () {
                        loadingMsg = null;
                    };

                    this.doAuthorizationActivity = function (url) {
                        container.location.href = url;
                        container.onload = function () {
                            container.document.getElementsByTagName("html")[0].style.cursor = 'default';
                        }
                    }
                }
            },
            _loginSocial: function (socialType, fieldsMapping, permissions, callback, container) {

                var socialContainer = new this._socialContainer(socialType, container);

                var request = fieldsMapping || permissions ? {} : null;
                if (fieldsMapping)
                    request.fieldsMapping = fieldsMapping;
                if (permissions)
                    request.permissions = permissions;

                var deffered = $q.defer();
                $http.post($config.appPath + "/social/oauth/" + socialType.toLowerCase() + "/request_url", request, {headers:{"application-id":$config.appId, "secret-key":$config.secretKey,"application-type":"JS","Content-Type":"application/json"}})
                    .success(function(data){
                        currentUser = data;
                        deffered.resolve(data);
                    })
                    .error(function(e){
                        deffered.resolve(e);
                    });
                return deffered.promise;
            },
            loginWithFacebookSdk: function (fieldsMapping) {
                if (!FB)
                    throw new Error("Facebook SDK not found");

                var me = this;
                FB.getLoginStatus(function (response) {
                    if (response.status === 'connected')
                        me._sendFacebookLoginRequest(me, response, fieldsMapping);
                    else
                        FB.login(function (response) {
                            me._sendFacebookLoginRequest(me, response, fieldsMapping);
                        });
                });
            },
            _sendFacebookLoginRequest: function (context, response, fieldsMapping) {
                if (response.status === 'connected') {
                    var requestData = response.authResponse;

                    if (fieldsMapping)
                        requestData["fieldsMapping"] = fieldsMapping;

                    var deffered = $q.defer();
                    $http.post($config.appPath + "/social/facebook/login/" + $config.appId, requestData, {headers:{"application-id":$config.appId, "secret-key":$config.secretKey,"application-type":"JS","Content-Type":"application/json"}})
                        .success(function(data){
                            currentUser = data;
                            deffered.resolve(data);
                        })
                        .error(function(e){
                            deffered.resolve(e);
                        });
                    return deffered.promise;
                }
            }
        };
        return new UserService();
    });

    BackendlessAngular.factory('$Persistence', function($q, $http, $config){
        function DataStore(model) {
            this.model = model;
            this.className = getClassName.call(model);
            if ((typeof model).toLowerCase() === "string")
                this.className = model;
            if (!this.className) {
                throw 'Class name should be specified';
            }
        }

        DataStore.prototype = {
            _extendCollection: function(collection, dataMapper) {
                if (collection.nextPage && collection.nextPage.split("/")[1] == $config.appVersion) {
                    collection.nextPage = $config.serverURL + collection.nextPage
                }
                collection._nextPage = collection.nextPage;
                collection.nextPage = function () {
                    return dataMapper._load(this._nextPage);
                };
                collection.getPage = function (offset, pageSize) {
                    var nextPage = this._nextPage.replace(/offset=\d+/ig, 'offset=' + offset);
                    nextPage = nextPage.replace(/pagesize=\d+/ig, 'pageSize=' + pageSize);
                    return dataMapper._load(nextPage);
                };
                collection.dataMapper = dataMapper;
            },
            _parseResponse: function (response) {
                var i, len, _Model = this.model, item;
                if (response.data) {
                    var collection = response, arr = collection.data;
                    for (i = 0, len = arr.length; i < len; ++i) {
                        arr[i] = arr[i].fields || arr[i];
                        item = new _Model;
                        deepExtend(item, arr[i]);
                        arr[i] = item;
                    }
                    this._extendCollection(collection, this);
                    return collection;
                } else {
                    response = response.fields || response;
                    item = new _Model;
                    deepExtend(item, response);
                    return this._formCircDeps(item);
                }

            },
            _extractQueryOptions: function (options) {
                var params = [];
                if (typeof options.pageSize != 'undefined') {
                    if (options.pageSize < 1 || options.pageSize > 100) {
                        throw new Error('PageSize can not be less then 1 or greater than 100');
                    }
                    params.push('pageSize=' + encodeURIComponent(options.pageSize));
                }
                if (options.offset) {
                    if (options.offset < 0) {
                        throw new Error('Offset can not be less then 0');
                    }
                    params.push('offset=' + encodeURIComponent(options.offset));
                }
                if (options.sortBy) {
                    if (angular.isString(options.sortBy)) {
                        params.push('sortBy=' + encodeURIComponent(options.sortBy));
                    } else if (angular.isArray(options.sortBy)) {
                        params.push('sortBy=' + encodeArrayToUriComponent(options.sortBy));
                    }
                }
                if (options.relationsDepth) {
                    if (angular.isNumber(options.relationsDepth)) {
                        params.push('relationsDepth=' + encodeURIComponent(Math.floor(options.relationsDepth)));
                    }
                }
                if (options.relations) {
                    if (angular.isArray(options.relations)) {
                        params.push('loadRelations=' + (options.relations.length ? encodeArrayToUriComponent(options.relations) : "*"));
                    }
                }
                return params.join('&');
            },
            _load: function (url) {
                var deffered = $q.defer(), self = this;
                $http.get("https://api.backendless.com/v1/data/Order?pageSize=10&offset=10", {headers:{"application-id":$config.appId, "secret-key":$config.secretKey,"application-type":"JS","Content-Type":"application/json"}})
                    .success(function(data){
                        var parsedData = self._parseResponse(data);
                        deffered.resolve(parsedData);
                    })
                    .error(function(e){
                        deffered.resolve(e);
                    });
                return deffered.promise;
            },
            _replCircDeps: function (obj) {
                var objMap = [obj],
                    pos,
                    GenID = function () {
                        for (var b = '', a = b; a++ < 36; b += a * 51 && 52 ? (a ^ 15 ? 8 ^ Math.random() * (a ^ 20 ? 16 : 4) : 4).toString(16) : '-') {
                        }
                        return b;
                    },
                    _replCircDepsHelper = function (obj) {
                        for (var prop in obj) {
                            if (obj.hasOwnProperty(prop) && typeof obj[prop] == "object" && obj[prop] != null) {
                                if ((pos = objMap.indexOf(obj[prop])) != -1) {
                                    objMap[pos]["__subID"] = objMap[pos]["__subID"] || GenID();
                                    obj[prop] = {"__originSubID": objMap[pos]["__subID"]};
                                } else {
                                    objMap.push(obj[prop]);
                                    _replCircDepsHelper(obj[prop]);
                                }
                            }
                        }
                    };
                _replCircDepsHelper(obj);
            },
            _formCircDeps: function (obj) {
                var circDepsIDs = {},
                    result = new obj.constructor(),
                    _formCircDepsHelper = function (obj, result) {
                        if (obj.hasOwnProperty("__subID")) {
                            circDepsIDs[obj["__subID"]] = result;
                            delete obj["__subID"];
                        }
                        for (var prop in obj) {
                            if (obj.hasOwnProperty(prop)) {
                                if (typeof obj[prop] == "object" && obj[prop] != null) {
                                    if (obj[prop].hasOwnProperty("__originSubID")) {
                                        result[prop] = circDepsIDs[obj[prop]["__originSubID"]];
                                    } else {
                                        result[prop] = new (obj[prop].constructor)();
                                        _formCircDepsHelper(obj[prop], result[prop]);
                                    }
                                } else {
                                    result[prop] = obj[prop];
                                }
                            }
                        }
                    };
                _formCircDepsHelper(obj, result);
                return result;
            },
            save: function (obj) {
                this._replCircDeps(obj);
                var method = 'POST',
                    url = $config.appPath + '/data/' + this.className,
                    objRef = obj;
                if (obj.objectId) {
                    method = 'PUT';
                    url += '/' + obj.objectId;
                }
                var deffered = $q.defer();
                $http({method: method.toLowerCase(), url: url, data: obj, headers: {"application-id":$config.appId, "secret-key":$config.secretKey,"application-type":"JS","Content-Type":"application/json"}})
                    .success(function(data){
                        deffered.resolve(deepExtend(objRef, data));
                    })
                    .error(function(e){
                        deffered.resolve(e);
                    });
                return deffered.promise;
            },
            remove: function (objId) {
                var objId = objId.objectId || objId,
                    deffered = $q.defer(),
                    url = $config.appPath + '/data/' + this.className + '/' + objId;
                $http({method: 'delete', url: url, headers: {"application-id":$config.appId, "secret-key":$config.secretKey,"application-type":"JS","Content-Type":"application/json"}})
                    .success(function(data){
                        deffered.resolve(data);
                    })
                    .error(function(e){
                        deffered.resolve(e);
                    });
                return deffered.promise;
            },

            find: function (dataQuery) {
                dataQuery = dataQuery || {};
                var props,
                    whereClause,
                    options,
                    query = [],
                    url = $config.appPath + '/data/' + this.className,
                    self = this;
                if (dataQuery.properties) {
                    props = 'props=' + encodeArrayToUriComponent(dataQuery.properties);
                }
                if (dataQuery.condition) {
                    whereClause = 'where=' + encodeURIComponent(dataQuery.condition);
                }
                if (dataQuery.options) {
                    options = this._extractQueryOptions(dataQuery.options);
                }
                options && query.push(options);
                whereClause && query.push(whereClause);
                props && query.push(props);
                query = query.join('&');
                if (dataQuery.url) {
                    url += '/' + dataQuery.url;
                }
                if (query) {
                    url += '?' + query;
                }
                var deffered = $q.defer();
                $http({method: 'get', url: url, headers: {"application-id":$config.appId, "secret-key":$config.secretKey,"application-type":"JS","Content-Type":"application/json"}})
                    .success(function(data){
                        var parsedData = self._parseResponse(data);
                        deffered.resolve(parsedData);
                    })
                    .error(function(e){
                        deffered.resolve(e);
                    });
                return deffered.promise;
            },
            _buildArgsObject: function () {
                var args = {},
                    i = arguments.length,
                    type = "";
                for (; i--;) {
                    type = Object.prototype.toString.call(arguments[i]).toLowerCase().match(/[a-z]+/g)[1];
                    switch (type) {
                        case "number":
                            args.options = args.options || {};
                            args.options.relationsDepth = arguments[i];
                            break;
                        case "string":
                            args.url = arguments[i];
                            break;
                        case "array":
                            args.options = args.options || {};
                            args.options.relations = arguments[i];
                            break;
                        case "object":
                            if (arguments[i].hasOwnProperty('cachePolicy')) {
                                args.cachePolicy = arguments[i]['cachePolicy'];
                            }
                            break;
                        default:
                            break;
                    }
                }
                return args;
            },

            findById: function () {
                var argsObj = this._buildArgsObject.apply(this, arguments);
                if (!(argsObj.url)) {
                    throw new Error('missing argument "object ID" for method findById()');
                }
                return this.find.apply(this, [argsObj].concat(Array.prototype.slice.call(arguments)));
            },

            loadRelations: function (obj) {
                if (!(obj && obj.objectId)) {
                    throw new Error('missing object argument for method loadRelations()');
                }
                var argsObj = this._buildArgsObject.apply(this, arguments);
                argsObj.url = obj.objectId;
                deepExtend(obj, this.find.apply(this, [argsObj].concat(Array.prototype.slice.call(arguments))));
            },

            findFirst: function () {
                var argsObj = this._buildArgsObject.apply(this, arguments);
                argsObj.url = 'first';
                return this.find.apply(this, [argsObj].concat(Array.prototype.slice.call(arguments)));
            },

            findLast: function () {
                var argsObj = this._buildArgsObject.apply(this, arguments);
                argsObj.url = 'last';
                return this.find.apply(this, [argsObj].concat(Array.prototype.slice.call(arguments)));
            }
        };
        var dataStoreCache = {};
        return {
            save: function (className, obj) {
                if (angular.isString(className)) {
                    var url = $config.appPath + '/data/' + className,
                        deffered = $q.defer();
                    $http.post(url, obj, {headers:{"application-id":$config.appId, "secret-key":$config.secretKey,"application-type":"JS","Content-Type":"application/json"}})
                        .success(function(data){
                            deffered.resolve(data);
                        })
                        .error(function(e){
                            deffered.resolve(e);
                        });
                    return deffered.promise;
                }
                if (angular.isObject(className)) {
                    return new DataStore(className).save(className, obj);
                }
            },
            of: function (model) {
                var className = getClassName.call(model);
                var store = dataStoreCache[className];
                if (!store) {
                    store = new DataStore(model);
                    dataStoreCache[className] = store;
                }
                return store;
            },
            describe: function (className) {
                className = angular.isString(className) ? className : getClassName.call(className);
                var url = $config.appPath + '/data/' + className + '/properties',
                    deffered = $q.defer();
                $http.get(url, {headers:{"application-id":$config.appId, "secret-key":$config.secretKey,"application-type":"JS","Content-Type":"application/json"}})
                    .success(function(data){
                        deffered.resolve(data);
                    })
                    .error(function(e){
                        deffered.resolve(e);
                    });
                return deffered.promise;
            }
        };
    });

    BackendlessAngular.factory('$GeoQuery', function(){
        function GeoQuery() {
            this.searchRectangle = null;
            this.categories = [];
            this.includeMeta = false;

            this.pageSize = 10;
            this.latitude = 0;
            this.longitude = 0;
            this.radius = 0;
            this.units = null;
        }

        GeoQuery.prototype = {
            addCategory: function () {
                this.categories = this.categories || [];
                this.categories.push();
            }
        };
        return new GeoQuery();
    });

    BackendlessAngular.factory('$Geo', function($config, $q, $http){
        function Geo() {}
        Geo.prototype = {
            UNITS: {
                METERS: 'METERS',
                KILOMETERS: 'KILOMETERS',
                MILES: 'MILES',
                YARDS: 'YARDS',
                FEET: 'FEET'
            },
            _findHelpers: {
                'searchRectangle': function (arg) {
                    var rect = [
                            'nwlat=' + arg[0], 'nwlon=' + arg[1], 'selat=' + arg[2], 'selon=' + arg[3]
                    ];
                    return rect.join('&');
                },
                'latitude': function (arg) {
                    return 'lat=' + arg;
                },
                'longitude': function (arg) {
                    return 'lon=' + arg;
                },
                'metadata': function (arg) {
                    return 'metadata=' + JSON.stringify(arg);
                },
                'radius': function (arg) {
                    return 'r=' + arg;
                },
                'categories': function (arg) {
                    arg = angular.isString(arg) ? [arg] : arg;
                    return 'categories=' + encodeArrayToUriComponent(arg);
                },
                'includeMetadata': function (arg) {
                    return 'includemetadata=' + arg;
                },
                'pageSize': function (arg) {
                    if (arg < 1 || arg > 100) {
                        throw new Error('PageSize can not be less then 1 or greater than 100');
                    } else {
                        return 'pagesize=' + arg;
                    }
                },
                'offset': function (arg) {
                    if (arg < 0) {
                        throw new Error('Offset can not be less then 0');
                    } else {
                        return 'offset=' + arg;
                    }
                },
                'relativeFindPercentThreshold': function (arg) {
                    if (arg <= 0) {
                        throw new Error('Threshold can not be less then or equal 0');
                    } else {
                        return 'relativeFindPercentThreshold=' + arg;
                    }
                },
                'relativeFindMetadata': function (arg) {
                    return 'relativeFindMetadata=' + JSON.stringify(arg);
                },
                'condition': function (arg) {
                    return 'whereClause=' + encodeURIComponent(arg);
                }
            },

            addPoint: function (geopoint) {
                if (geopoint.latitude === undefined || geopoint.longitude === undefined) {
                    throw 'Latitude or longitude not a number';
                }
                geopoint.categories = geopoint.categories || ['Default'];
                geopoint.categories = angular.isArray(geopoint.categories) ? geopoint.categories : [geopoint.categories];
                var data = 'lat=' + geopoint.latitude;
                data += '&lon=' + geopoint.longitude;
                if (geopoint.categories) {
                    data += '&categories=' + encodeArrayToUriComponent(geopoint.categories);
                }

                if (geopoint.metadata) {
                    data += '&metadata=' + JSON.stringify(geopoint.metadata);
                }
                var url = $config.appPath + '/geo/points?' + data,
                    deffered = $q.defer();
                $http({url:url, method:'put', headers:{"application-id":$config.appId, "secret-key":$config.secretKey,"application-type":"JS","Content-Type":"application/json"}})
                    .success(function(data){
                        deffered.resolve(data);
                    })
                    .error(function(e){
                        deffered.resolve(e);
                    });
                return deffered.promise;
            },

            findUtil: function (query) {
                var url = query["url"],
                    deffered = $q.defer(),
                    searchByCat = true;
                if (query.searchRectangle && query.radius) {
                    throw new Error("Inconsistent geo query. Query should not contain both rectangle and radius search parameters.");
                }
                else if (query.radius && (query.latitude === undefined || query.longitude === undefined)) {
                    throw new Error("Latitude and longitude should be provided to search in radius");
                }
                else if ((query.relativeFindMetadata || query.relativeFindPercentThreshold) && !(query.relativeFindMetadata && query.relativeFindPercentThreshold)) {
                    throw new Error("Inconsistent geo query. Query should contain both relativeFindPercentThreshold and relativeFindMetadata or none of them");
                }
                else {
                    url += query.searchRectangle ? '/rect?' : '/points?';
                    url += 'units=' + (query.units ? query.units : this.UNITS.KILOMETERS);
                    for (var prop in query) {
                        if (query.hasOwnProperty(prop) && this._findHelpers.hasOwnProperty(prop) && query[prop] != undefined) {
                            url += '&' + this._findHelpers[prop](query[prop]);
                        }
                    }
                }
                url = url.replace(/\?&/g, '?');
                $http.get(url, {headers:{"application-id":$config.appId, "secret-key":$config.secretKey,"application-type":"JS","Content-Type":"application/json"}})
                    .success(function(data){
                        deffered.resolve(data.collection);
                    })
                    .error(function(e){
                        deffered.resolve(e);
                    });
                return deffered.promise;
            },

            find: function (query) {
                query["url"] = $config.appPath + '/geo';
                return this.findUtil(query);
            },

            relativeFind: function (query) {
                if (!(query.relativeFindMetadata && query.relativeFindPercentThreshold)) {
                    throw new Error("Inconsistent geo query. Query should contain both relativeFindPercentThreshold and relativeFindMetadata");
                } else {
                    query["url"] = $config.appPath + "/geo/relative";
                    return this.findUtil(query);
                }
            },

            addCategory: function (name) {
                if (!name) {
                    throw new Error('Category name is requred.');
                }
                var url = $config.appPath + '/geo/categories/' + name,
                    deffered = $q.defer();
                $http({url: url, method: 'put', headers:{"application-id":$config.appId, "secret-key":$config.secretKey,"application-type":"JS","Content-Type":"application/json"}})
                    .success(function(data){
                        deffered.resolve(data);
                    })
                    .error(function(e){
                        defefered.resolve(e);
                    });
                return deffered.promise;
            },
            getCategories: function () {
                var url = $config.appPath + '/geo/categories',
                    deffered = $q.defer();
                $http.get(url, {headers:{"application-id":$config.appId, "secret-key":$config.secretKey,"application-type":"JS","Content-Type":"application/json"}})
                    .success(function(data){
                        deffered.resolve(data);
                    })
                    .error(function(e){
                        deffered.resolve(e);
                    });
                return deffered.promise;
            },
            deleteCategory: function (name) {
                if (!name) {
                    throw new Error('Category name is required.');
                }
                var url = $config.appPath + '/geo/categories/' + name,
                    deffered = $q.defer();
                $http.delete(url, {headers:{"application-id":$config.appId, "secret-key":$config.secretKey,"application-type":"JS","Content-Type":"application/json"}})
                    .success(function(data){
                        deffered.resolve(data);
                    })
                    .error(function(e){
                        deffered.resolve(e);
                    });
                return deffered.promise;
            },
            deletePoint: function (point) {
                if (!point || angular.isFunction(point)) {
                    throw new Error('Point argument name is required, must be string (object Id), or point object');
                }
                var pointId = angular.isString(point) ? point : point.objectId,
                    url = $config.appPath + '/geo/points/' + pointId,
                    deffered = $q.defer();
                $http.delete(url, {headers:{"application-id":$config.appId, "secret-key":$config.secretKey,"application-type":"JS","Content-Type":"application/json"}})
                    .success(function(data){
                        deffered.resolve(data);
                    })
                    .error(function(e){
                        deffered.resolve(e);
                    });
                return deffered.promise;
            }
        };
        return new Geo();
    });

    BackendlessAngular.factory('$Messaging', function($q, $config, $http){
        var WebSocket = null;

        function Proxy() {
        }

        Proxy.prototype = {
            on: function (eventName, handler) {
                if (!eventName) {
                    throw new Error('Event name not specified');
                }
                if (!handler) {
                    throw new Error('Handler not specified');
                }
                this.eventHandlers[eventName] = this.eventHandlers[eventName] || [];
                this.eventHandlers[eventName].push(handler);
            },
            fireEvent: function (eventName, data) {
                var handlers = this.eventHandlers[eventName] || [], len, i;
                for (i = 0, len = handlers.length; i < len; ++i) {
                    handlers[i](data);
                }
            }
        };

        function PollingProxy(url) {
            this.eventHandlers = {};
            this.restUrl = url;
            this.timer = 0;
            this.timeout = 0;
            this.interval = 1000;
            this.xhr = null;
            this.needReconnect = true;
            this.responder = new Async(this.onMessage, this.onError, this);
            this.poll();
        }

        function Async(successCallback, faultCallback, context) {

            if (!(faultCallback instanceof Function)) {
                context = faultCallback;
                faultCallback = emptyFn;
            }

            this.success = function (data) {
                successCallback && successCallback.call(context, data);
            };
            this.fault = function (data) {
                faultCallback && faultCallback.call(context, data);
            }
        }

        var XHR = function(config){
            var xhr = new XMLHttpRequest(), response;
            xhr.onreadystatechange = function() {
                if (xhr.readyState == 4) {
                    if (xhr.status >= 200 && xhr.status < 300) {
                        response = parseResponse(xhr);
                        config.asyncHandler.success && config.asyncHandler.success(response);
                    } else {
                        config.asyncHandler.fault && config.asyncHandler.fault(badResponse(xhr));
                    }
                }
            };
            xhr.open('GET', config.url, true);
            xhr.setRequestHeader('Content-Type', 'application/json');
            xhr.setRequestHeader('application-id', config._config.appId);
            xhr.setRequestHeader('secret-key', config._config.secretKey);
            xhr.setRequestHeader('application-type', 'JS');
            xhr.send(null);
        };

        var parseResponse = function(xhr){
            var result = true;
            if (xhr.responseText) {
                try {
                    result = JSON.parse(xhr.responseText);
                } catch (e) {
                    result = xhr.responseText;
                }
            }
            return result;
        };

        var badResponse = function (xhr) {
            var result = {};
            try {
                result = JSON.parse(xhr.responseText);
            } catch (e) {
                result.message = xhr.responseText;
            }
            result.statusCode = xhr.status;
            result.message = result.message || 'unknown error occurred';
            return result;
        };

        PollingProxy.prototype = new Proxy();

        deepExtend(PollingProxy.prototype, {
            onMessage: function (data) {
                clearTimeout(this.timeout);
                var self = this;
                this.timer = setTimeout(function () {
                    self.poll();
                }, this.interval);
                this.fireEvent('messageReceived', data);
            },
            poll: function () {
                var self = this;
                this.timeout = setTimeout(function () {
                    self.onTimeout();
                }, 30 * 1000);
                this.xhr = XHR({
                    url: this.restUrl,
                    asyncHandler:this.responder,
                    _config:$config
                })
            },
            close: function () {
                clearTimeout(this.timer);
                clearTimeout(this.timeout);
                this.needReconnect = false;
                this.xhr && this.xhr.abort();
            },
            onTimeout: function () {
                this.xhr && this.xhr.abort();
            },
            onError: function () {
                clearTimeout(this.timer);
                clearTimeout(this.timeout);
                if (this.needReconnect) {
                    var self = this;
                    this.xhr = null;
                    this.timer = setTimeout(function () {
                        self.poll();
                    }, this.interval);
                }
            }
        });

        function Subscription(config) {
            var self = this;
            this.channelName = config.channelName;
            this.options = config.options;
            config.channelProperties.then(function(data){
                self.channelProperties = data;
            });
            this.subscriptionId = null;
            this.restUrl = config.restUrl + '/' + config.channelName;
            this.responder = config.responder || emptyFn;
            this._subscribe(config.onSubscribe);
        }

        Subscription.prototype = {
            _subscribe: function () {
                var self = this,
                    deffered = $q.defer(),
                    subscription;
                $http({url:this.restUrl + '/subscribe', method:'post', data:JSON.stringify(this.options), headers:{"application-id":$config.appId, "secret-key":$config.secretKey,"application-type":"JS","Content-Type":"application/json"}})
                    .success(function(data){
                        subscription = data;
                        self.subscriptionId = subscription.subscriptionId;
                        self._startSubscription();
                        deffered.resolve(data);
                    })
                    .error(function(e){
                        deffered.resolve(e);
                    });
            },
            _startSubscription: function () {
                var self = this;
                this._switchToPolling();
                this._startSubscription = emptyFn;
            },
            cancelSubscription: function () {
                this.proxy && this.proxy.close();
                this._startSubscription = emptyFn;
            },
            _switchToPolling: function () {
                var url = this.restUrl + '/' + this.subscriptionId;
                this.proxy = new PollingProxy(url);
                var self = this;
                this.proxy.on('messageReceived', function (data) {
                    if (data.messages.length)
                        self.responder(data);
                });
            }
        };

        function Messaging() {
            this.channelProperties = {};
        }

        Messaging.prototype = {
            _getProperties: function (channelName) {
                var self = this,
                    deffered = $q.defer(),
                    props = this.channelProperties[channelName];
                if (props) {
                    return props;
                }
                $http.get($config.appPath + '/messaging/' + channelName + '/properties', {headers:{"application-id":$config.appId, "secret-key":$config.secretKey,"application-type":"JS","Content-Type":"application/json"}})
                    .success(function(data){
                        self.channelProperties[channelName] = data;
                        deffered.resolve(data);
                    })
                    .error(function(e){
                        deffered.resolve(e);
                    });
                return deffered.promise;
            },
            subscribe: function (channelName, subscriptionCallback, subscriptionOptions) {
                var props = this._getProperties(channelName);
                return new Subscription({
                    channelName: channelName,
                    options: subscriptionOptions,
                    channelProperties: props,
                    responder: subscriptionCallback,
                    restUrl: $config.appPath + '/messaging'
                });
            },
            publish: function (channelName, message, publishOptions, deliveryTarget) {
                var data = {
                        message: message
                    },
                    self = this,
                    deffered = $q.defer();
                if (publishOptions) {
                    if (!(publishOptions instanceof PublishOptions))
                        throw "Use PublishOption as publishOptions argument";
                    deepExtend(data, publishOptions);
                }
                if (deliveryTarget) {
                    if (!(deliveryTarget instanceof DeliveryOptions))
                        throw "Use DeliveryOptions as deliveryTarget argument";
                    deepExtend(data, deliveryTarget);
                }

                $http.post($config.appPath + '/messaging/' + channelName, data, {headers:{"application-id":$config.appId, "secret-key":$config.secretKey,"application-type":"JS","Content-Type":"application/json"}})
                    .success(function(data){
                        deffered.resolve(data);
                    })
                    .error(function(e){
                        deffered.resolve(e);
                    });
                return deffered.promise;
            },
            sendEmail: function (subject, bodyParts, recipients, attachments) {
                var self = this,
                    deffered = $q.defer(),
                    data = {};
                if (subject && !isEmpty(subject) && angular.isString(subject)) {
                    data.subject = subject;
                } else {
                    throw "Subject is required parameter and must be a nonempty string";
                }
                if ((bodyParts instanceof Bodyparts) && !isEmpty(bodyParts)) {
                    data.bodyparts = bodyParts;
                } else {
                    throw "Use Bodyparts as bodyParts argument, must contain at least one property";
                }
                if (recipients && angular.isArray(recipients) && !isEmpty(recipients)) {
                    data.to = recipients;
                } else {
                    throw "Recipients is required parameter, must be a nonempty array";
                }
                if (attachments) {
                    if (angular.isArray(attachments)) {
                        if (!isEmpty(attachments)) {
                            data.attachment = attachments;
                        }
                    } else {
                        throw "Attachments must be an array of file IDs from File Service";
                    }
                }
                $http.post($config.appPath + '/messaging/email', data, {headers:{"application-id":$config.appId, "secret-key":$config.secretKey,"application-type":"JS","Content-Type":"application/json"}})
                    .success(function(data){
                        deffered.resolve(data);
                    })
                    .error(function(e){
                        deffered.resolve(e);
                    });
                return deffered.promise;
            },
            cancel: function (messageId) {
                var self = this,
                    deffered = $q.defer();
                $http.delete($config.appPath + '/messaging/' + messageId, {headers:{"application-id":$config.appId, "secret-key":$config.secretKey,"application-type":"JS","Content-Type":"application/json"}})
                    .success(function(data){
                        deffered.resolve(data);
                    })
                    .error(function(e){
                        deffered.resolve(e);
                    });
                return deffered.promise;
            }
        };

        return new Messaging();
    });

    BackendlessAngular.factory('$Files', function($q, $http, $config){

        function getBuilder(filename, filedata, boundary) {
            var dashdash = '--',
                crlf = '\r\n',
                builder = '';

            builder += dashdash;
            builder += boundary;
            builder += crlf;
            builder += 'Content-Disposition: form-data; name="file"';
            builder += '; filename="' + filename + '"';
            builder += crlf;

            builder += 'Content-Type: application/octet-stream';
            builder += crlf;
            builder += crlf;

            builder += filedata;
            builder += crlf;

            builder += dashdash;
            builder += boundary;
            builder += dashdash;
            builder += crlf;
            return builder;
        }

        function Files() {}

        Files.prototype = {
            _send: function(e){
                initXHR();
                var xhr = new XMLHttpRequest(),
                    boundary = '-backendless-multipart-form-boundary-' + getNow(),
                    builder = getBuilder(this.fileName, e.target.result, boundary),
                    badResponse = function (xhr) {
                        var result = {};
                        try {
                            result = JSON.parse(xhr.responseText);
                        } catch (e) {
                            result.message = xhr.responseText;
                        }
                        result.statusCode = xhr.status;
                        return result;
                    };

                xhr.open("POST", this.uploadPath, true);
                xhr.setRequestHeader('content-type', 'multipart/form-data; boundary=' + boundary);
                xhr.setRequestHeader('application-id', $config.appId);
                xhr.setRequestHeader("secret-key", $config.secretKey);
                xhr.setRequestHeader("application-type", "JS");
                if (UIState !== null) {
                    xhr.setRequestHeader("uiState", UIState);
                }
                var asyncHandler = this.asyncHandler;
                if (asyncHandler)
                    xhr.onreadystatechange = function () {
                        if (xhr.readyState == 4) {
                            if (xhr.status >= 200 && xhr.status < 300) {
                                asyncHandler.success(JSON.parse(xhr.responseText));
                            } else {
                                asyncHandler.fault(JSON.parse(xhr.responseText));
                            }
                        }
                    };
                xhr.sendAsBinary(builder);

                if (asyncHandler) {
                    return xhr;
                }
                if (xhr.status >= 200 && xhr.status < 300) {
                    return xhr.responseText ? JSON.parse(xhr.responseText) : true;
                } else {
                    throw badResponse(xhr);
                }
            },
            upload: function (files, path, async) {
                files = files.files || files;
                var baseUrl = $config.appPath + '/files/' + path + '/';
                if (isBrowser()) {
                    if (window.File && window.FileList) {
                        if (files instanceof File) {
                            files = [files];
                        }
                        var filesError = 0, filesDone = 0;
                        for (var i = 0, len = files.length; i < len; i++) {
                            try {
                                var reader = new FileReader();
                                reader.fileName = files[i].name;
                                reader.uploadPath = baseUrl + reader.fileName;
                                reader.onloadend = this._send;
                                reader.asyncHandler = async;
                                reader.onerror = function (evn) {
                                    async.fault(evn);
                                };
                                reader.readAsBinaryString(files[i]);

                            }
                            catch (err) {
                                filesError++;
                            }
                        }
                    }
                    else {
                        var ifrm = document.createElement('iframe');
                        ifrm.id = ifrm.name = 'ifr' + getNow();
                        ifrm.width = ifrm.height = '0';

                        document.body.appendChild(ifrm);
                        var form = document.createElement('form');
                        form.target = ifrm.name;
                        form.enctype = 'multipart/form-data';
                        form.method = 'POST';
                        document.body.appendChild(form);
                        form.appendChild(files);
                        var fileName = files.value, index = fileName.lastIndexOf('\\');

                        if (index) {
                            fileName = fileName.substring(index + 1);
                        }
                        form.action = baseUrl + fileName;
                        form.submit();
                    }
                }
                else {
                    throw "Upload File not supported with NodeJS";
                }
            },

            remove: function (fileURL) {
                var url = fileURL.indexOf("http://") == 0 || fileURL.indexOf("https://") == 0 ? fileURL : $config.appPath + '/files/' + fileURL;
                var deffered = $q.defer();
                $http({url: url, method: 'delete', headers:{"application-id":$config.appId, "secret-key":$config.secretKey,"application-type":"JS","Content-Type":"application/json"}})
                    .success(function(data){
                        deffered.resolve(data);
                    })
                    .error(function(e){
                        deffered.resolve(e);
                    });
                return deffered.promise;
            },

            removeDirectory: function (path) {
                var deffered = $q.defer();
                $http({url: $config.appPath + '/files/' + path, method: 'delete', headers:{"application-id":$config.appId, "secret-key":$config.secretKey,"application-type":"JS","Content-Type":"application/json"}})
                    .success(function(data){
                        deffered.resolve(data);
                    })
                    .error(function(e){
                        deffered.resolve(e);
                    });
                return deffered.promise;
            }
        };

        return new Files();
    });

    BackendlessAngular.factory('$Commerce', function($q, $http, $config){
        function Commerce() {}
        Commerce.prototype.validatePlayPurchase = function (packageName, productId, token) {
            if (arguments.length < 3) {
                throw new Error('Package Name, Product Id, Token must be provided and must be not an empty STRING!');
            }
            for (var i = arguments.length - 2; i >= 0; i--) {
                if (!arguments[i] || !angular.isString(arguments[i])) {
                    throw new Error('Package Name, Product Id, Token must be provided and must be not an empty STRING!');
                }
            }
            var deffered = $q.defer();
            $http({url: $config.appPath + '/commerce/googleplay/validate/' + packageName + '/inapp/' + productId + '/purchases/' + token, method: 'get', headers:{"application-id":$config.appId, "secret-key":$config.secretKey,"application-type":"JS","Content-Type":"application/json"}})
                .success(function(data){
                    deffered.resolve(data);
                })
                .error(function(e){
                    deffered.resolve(e);
                });
            return deffered.promise;
        };
        Commerce.prototype.cancelPlaySubscription = function (packageName, subscriptionId, token) {
            if (arguments.length < 3) {
                throw new Error('Package Name, Subscription Id, Token must be provided and must be not an empty STRING!');
            }
            for (var i = arguments.length - 2; i >= 0; i--) {
                if (!arguments[i] || !angular.isString(arguments[i])) {
                    throw new Error('Package Name, Subscription Id, Token must be provided and must be not an empty STRING!');
                }
            }
            var deffered = $q.defer();
            $http({url: $config.appPath + '/commerce/googleplay/' + packageName + '/subscription/' + subscriptionId + '/purchases/' + token + '/cancel', method: 'post', headers:{"application-id":$config.appId, "secret-key":$config.secretKey,"application-type":"JS","Content-Type":"application/json"}})
                .success(function(data){
                    deffered.resolve(data);
                })
                .error(function(e){
                    deffered.resolve(e);
                });
            return deffered.promise;
        };
        Commerce.prototype.getPlaySubscriptionStatus = function (packageName, subscriptionId, token) {
            if (arguments.length < 3) {
                throw new Error('Package Name, Subscription Id, Token must be provided and must be not an empty STRING!');
            }
            for (var i = arguments.length - 2; i >= 0; i--) {
                if (!arguments[i] || !angular.isString(arguments[i])) {
                    throw new Error('Package Name, Subscription Id, Token must be provided and must be not an empty STRING!');
                }
            }
            var deffered = $q.defer();
            $http({url: $config.appPath + '/commerce/googleplay/' + packageName + '/subscription/' + subscriptionId + '/purchases/' + token, method: 'post', headers:{"application-id":$config.appId, "secret-key":$config.secretKey,"application-type":"JS","Content-Type":"application/json"}})
                .success(function(data){
                    deffered.resolve(data);
                })
                .error(function(e){
                    deffered.resolve(e);
                });
            return deffered.promise;
        };

        return new Commerce();
    });

    BackendlessAngular.factory('$Events', function($q, $http, $config){
        function Events() {}
        Events.prototype.dispatch = function (eventname, eventArgs) {
            if (!eventname || !angular.isString(eventname)) {
                throw new Error('Event Name must be provided and must be not an empty STRING!');
            }
            eventArgs = angular.isObject(eventArgs) ? eventArgs : {};
            var deffered = $q.defer();
            $http({url: $config.appPath + '/servercode/events/' + eventname, method: 'post', data: eventArgs, headers:{"application-id":$config.appId, "secret-key":$config.secretKey,"application-type":"JS","Content-Type":"application/json"}})
                .success(function(data){
                    deffered.resolve(data);
                })
                .error(function(e){
                    deffered.resolve(e);
                });
            return deffered.promise;
        };

        return new Events();
    });

    BackendlessAngular.factory('$Counters', function($q, $http, $config){
        var Counters = function (){},
            AtomicInstance = function (counterName){
                this.name = counterName;
            };

        Counters.prototype = {
            of: function(counterName){
                return new AtomicInstance(counterName);
            },
            getConstructor: function(){
                return this;
            },
            counterNameValidation: function(counterName){
                if(!counterName)
                    throw new Error('You must send some value as "counterName" argument in this method. The argument must contain only string values')
                if(!angular.isString(counterName))
                    throw new Error('Invalid value for the "value" argument. The argument must contain only string values')
            },
            implementMethod: function(method, urlPart){
                var deffered = $q.defer();
                $http({url: $config.serverURL + '/' + $config.appVersion + '/counters/' + this.name + urlPart, method: method, headers:{"application-id":$config.appId, "secret-key":$config.secretKey,"application-type":"JS","Content-Type":"application/json"}})
                    .success(function(data){
                        deffered.resolve(data);
                    })
                    .error(function(e){
                        deffered.resolve(e);
                    });
                return deffered.promise;
            },
            incrementAndGet: function(counterName){
                this.counterNameValidation(counterName);
                return this.implementMethod('PUT', '/increment/get');
            },
            getAndIncrement: function(counterName){
                this.counterNameValidation(counterName);
                return this.implementMethod('PUT', '/get/increment');
            },
            decrementAndGet: function(counterName){
                this.counterNameValidation(counterName);
                return this.implementMethod('PUT', '/decrement/get');
            },
            getAndDecrement: function(counterName){
                this.counterNameValidation(counterName);
                return this.implementMethod('PUT', '/get/decrement');
            },
            reset: function(counterName){
                this.counterNameValidation(counterName);
                return this.implementMethod('PUT', '/reset');
            },
            get: function(counterName){
                this.counterNameValidation(counterName);
                var deffered = $q.defer();
                $http({url: $config.serverURL + '/' + $config.appVersion + '/counters/' + this.name, method: 'get', headers:{"application-id":$config.appId, "secret-key":$config.secretKey,"application-type":"JS","Content-Type":"application/json"}})
                    .success(function(data){
                        deffered.resolve(data);
                    })
                    .error(function(e){
                        deffered.resolve(e);
                    });
                return deffered.promise;
            },
            addAndGet: function(counterName, value){
                this.counterNameValidation(counterName);
                if(!value)
                    throw new Error('You must send some value as "value" argument in this method. The argument must contain only numeric values');
                if(!angular.isNumber(value))
                    throw new Error('Invalid value for the "value" argument. The argument must contain only numeric values');
                var deffered = $q.defer();
                $http({url: $config.serverURL + '/' + $config.appVersion + '/counters/' + this.name + '/incrementby/get?value=' + ((value) ? value : ''), method: 'put', headers:{"application-id":$config.appId, "secret-key":$config.secretKey,"application-type":"JS","Content-Type":"application/json"}})
                    .success(function(data){
                        deffered.resolve(data);
                    })
                    .error(function(e){
                        deffered.resolve(e);
                    });
                return deffered.promise;
            },
            getAndAdd: function(counterName, value){
                this.counterNameValidation(counterName);
                if(!value)
                    throw new Error('You must send some value as "value" argument in this method. The argument must contain only numeric values');
                if(!angular.isNumber(value))
                    throw new Error('Invalid value for the "value" argument. The argument must contain only numeric values');
                var deffered = $q.defer();
                $http({url: $config.serverURL + '/' + $config.appVersion + '/counters/' + this.name + '/get/incrementby?value=' + ((value) ? value : ''), method: 'put', headers:{"application-id":$config.appId, "secret-key":$config.secretKey,"application-type":"JS","Content-Type":"application/json"}})
                    .success(function(data){
                        deffered.resolve(data);
                    })
                    .error(function(e){
                        deffered.resolve(e);
                    });
                return deffered.promise;
            },
            compareAndSet: function(counterName, expected, updated){
                this.counterNameValidation(counterName);
                if(!expected || !updated)
                    throw new Error('You must send some values as "expected" and "updated" arguments in this method. The arguments must contain only numeric values');
                if(!angular.isNumber(expected) || !angular.isNumber(updated))
                    throw new Error('Invalid value for the "expected" or "updated" argument. The argument must contain only numeric values');
                var deffered = $q.defer();
                $http({url: $config.serverURL + '/' + $config.appVersion + '/counters/' + this.name + '/get/compareandset?expected=' + ((expected && updated) ? expected + '&updatedvalue=' + updated : ''), method: 'put', headers:{"application-id":$config.appId, "secret-key":$config.secretKey,"application-type":"JS","Content-Type":"application/json"}})
                    .success(function(data){
                        deffered.resolve(data);
                    })
                    .error(function(e){
                        deffered.resolve(e);
                    });
                return deffered.promise;
            }
        };

        AtomicInstance.prototype = {
            incrementAndGet: function (){
                return Counters.prototype.getConstructor().incrementAndGet(this.name);
            },
            getAndIncrement: function(){
                return Counters.prototype.getConstructor().getAndIncrement(this.name);
            },
            decrementAndGet: function(){
                return Counters.prototype.getConstructor().decrementAndGet(this.name);
            },
            getAndDecrement: function(){
                return Counters.prototype.getConstructor().getAndDecrement(this.name);
            },
            reset: function(){
                return Counters.prototype.getConstructor().reset(this.name);
            },
            get: function(){
                return Counters.prototype.getConstructor().get(this.name);
            },
            addAndGet: function(value){
                return Counters.prototype.getConstructor().addAndGet(this.name, value);
            },
            getAndAdd: function(value){
                return Counters.prototype.getConstructor().getAndAdd(this.name, value);
            },
            compareAndSet: function(expected, updated){
                return Counters.prototype.getConstructor().getAndAdd(this.name, expected, updated);
            }
        };

        return new Counters();
    });

    BackendlessAngular.factory("$Cache", function($q, $http, $config){
        var Cache = function(){};

        var FactoryMethods = [];

        Cache.prototype = {
            put: function(key, value, timeToLive){
                if(!angular.isString(key))
                    throw new Error('You can use only String as key to put into Cache');
                if(timeToLive){
                    if(typeof timeToLive != ('number' || 'string')){
                        throw new Error('You can use only String as timeToLive attribute to put into Cache');
                    }
                }
                if(angular.isObject(value) && value.constructor.name != 'Object'){
                    value.___class = (!value.___class) ? value.constructor.name : value.___class;
                }
                var deffered = $q.defer();
                $http({url: $config.serverURL + '/' + $config.appVersion + '/cache/' + key + ((timeToLive) ? '?timeout=' + timeToLive : ''), method: 'put', data: JSON.stringify(value), headers:{"application-id":$config.appId, "secret-key":$config.secretKey,"application-type":"JS","Content-Type":"application/json"}})
                    .success(function(data){
                        deffered.resolve(data);
                    })
                    .error(function(e){
                        deffered.resolve(e);
                    });
                return deffered.promise;
            },
            expireIn: function(key, seconds){
                if(angular.isString(key) && (angular.isNumber(seconds) || angular.isDate(seconds)) && seconds){
                    seconds = (angular.isDate(seconds)) ? seconds.getTime() : seconds;
                    var deffered = $q.defer();
                    $http({url: $config.serverURL + '/' + $config.appVersion + '/cache/' + key + '/expireIn?timeout=' + seconds, method: 'put', data: {}, headers:{"application-id":$config.appId, "secret-key":$config.secretKey,"application-type":"JS","Content-Type":"application/json"}})
                        .success(function(data){
                            deffered.resolve(data);
                        })
                        .error(function(e){
                            deffered.resolve(e);
                        });
                    return deffered.promise;
                } else {
                    throw new Error('The "key" argument must be String. The "seconds" argument can be either Number or Date');
                }
            },
            expireAt: function(key, timestamp){
                if(angular.isString(key) && (angular.isNumber(timestamp) || angular.isDate(timestamp)) && timestamp){
                    timestamp = (angular.isDate(timestamp)) ? timestamp.getTime() : timestamp;
                    var deffered = $q.defer();
                    $http({url: $config.serverURL + '/' + $config.appVersion + '/cache/' + key + '/expireAt?timestamp=' + timestamp, method: 'put', data: {}, headers:{"application-id":$config.appId, "secret-key":$config.secretKey,"application-type":"JS","Content-Type":"application/json"}})
                        .success(function(data){
                            deffered.resolve(data);
                        })
                        .error(function(e){
                            deffered.resolve(e);
                        });
                    return deffered.promise;
                } else {
                    throw new Error('You can use only String as key while expire in Cache. Second attribute must be declared and must be a Number or Date type');
                }
            },
            cacheMethod: function(method, key, contain){
                if(!angular.isString(key))
                    throw new Error('The "key" argument must be String');
                var deffered = $q.defer();
                $http({url: $config.serverURL + '/' + $config.appVersion + '/cache/' + key + (contain ? '/check' : ''), method: method, headers:{"application-id":$config.appId, "secret-key":$config.secretKey,"application-type":"JS","Content-Type":"application/json"}})
                    .success(function(data){
                        deffered.resolve(data);
                    })
                    .error(function(e){
                        deffered.resolve(e);
                    });
                return deffered.promise;
            },
            contains: function(key){
                return this.cacheMethod('GET', key, true)
            },
            get: function(key){
                if(!angular.isString(key))
                    throw new Error('The "key" argument must be String');
                var deffered = $q.defer();
                $http({url: $config.serverURL + '/' + $config.appVersion + '/cache/' + key, method: 'get', headers:{"application-id":$config.appId, "secret-key":$config.secretKey,"application-type":"JS","Content-Type":"application/json"}})
                    .success(function(data){
                        if(angular.isObject(data)){
                            if(data.___class){
                                var object;
                                try {
                                    var Object = eval(data.___class);
                                    object = new Object(data);
                                } catch(e) {
                                    try {
                                        object = new FactoryMethods[data.___class](data);
                                    } catch(e){
                                        object = data;
                                    }
                                }
                                for(var key in data){
                                    object[key] = data[key];
                                }
                                deffered.resolve(object);
                            } else {
                                deffered.resolve(data);
                            }
                        } else {
                            deffered.resolve(data);
                        }
                    })
                    .error(function(e){
                        deffered.resolve(e);
                    });
                return deffered.promise;
            },
            remove: function(key){
                return this.cacheMethod('DELETE', key, false)
            },
            setObjectFactory: function( objectName, factoryMethod ){
                FactoryMethods[ objectName ] = factoryMethod;
            }
        };

        return new Cache();
    });

    BackendlessAngular.factory("$DataQuery", function(){
        function DataQuery() {
            this.properties = [];
            this.condition = null;
            this.options = null;
            this.url = null;
        }

        DataQuery.prototype = {
            addProperty: function (prop) {
                this.properties = this.properties || [];
                this.properties.push(prop);
            }
        };
        return new DataQuery();
    });

    BackendlessAngular.provider("Backendless", function(){
        return {
            $get: function($initApp, User, $UserService, $Persistence, $GeoQuery, $Geo, $Messaging, $Files, $Commerce, $Events, $Counters, $Cache, $DataQuery){
                return {
                    initApp:$initApp,
                    User: User,
                    UserService: $UserService,
                    Persistence: $Persistence,
                    GeoQuery: $GeoQuery,
                    DataQuery:$DataQuery,
                    Geo: $Geo,
                    Messaging: $Messaging,
                    Files: $Files,
                    Commerce: $Commerce,
                    Events: $Events,
                    Counters: $Counters,
                    Cache: $Cache
                }
            }
        }
    });
})();

var PublishOptionsHeaders = {
    'MESSAGE_TAG': 'message',
    'IOS_ALERT_TAG': 'ios-alert',
    'IOS_BADGE_TAG': 'ios-badge',
    'IOS_SOUND_TAG': 'ios-sound',
    'ANDROID_TICKER_TEXT_TAG': 'android-ticker-text',
    'ANDROID_CONTENT_TITLE_TAG': 'android-content-title',
    'ANDROID_CONTENT_TEXT_TAG': 'android-content-text',
    'ANDROID_ACTION_TAG': 'android-action',
    'WP_TYPE_TAG': 'wp-type',
    'WP_TITLE_TAG': 'wp-title',
    'WP_TOAST_SUBTITLE_TAG': 'wp-subtitle',
    'WP_TOAST_PARAMETER_TAG': 'wp-parameter',
    'WP_TILE_BACKGROUND_IMAGE': 'wp-backgroundImage',
    'WP_TILE_COUNT': 'wp-count',
    'WP_TILE_BACK_TITLE': 'wp-backTitle',
    'WP_TILE_BACK_BACKGROUND_IMAGE': 'wp-backImage',
    'WP_TILE_BACK_CONTENT': 'wp-backContent',
    'WP_RAW_DATA': 'wp-raw'
};

var PublishOptions = function (args) {
    args = args || {};
    this.publisherId = args.publisherId || undefined;
    this.headers = args.headers || undefined;
    this.subtopic = args.subtopic || undefined;
};

var DeliveryOptions = function (args) {
    args = args || {};
    this.pushPolicy = args.pushPolicy || undefined;
    this.pushBroadcast = args.pushBroadcast || undefined;
    this.pushSinglecast = args.pushSinglecast || undefined;
    this.publishAt = args.publishAt || undefined;
    this.repeatEvery = args.repeatEvery || undefined;
    this.repeatExpiresAt = args.repeatExpiresAt || undefined;
};

var Bodyparts = function (args) {
    args = args || {};
    this.textmessage = args.textmessage || undefined;
    this.htmlmessage = args.htmlmessage || undefined;
};

var SubscriptionOptions = function (args) {
    args = args || {};
    this.subscriberId = args.subscriberId || undefined;
    this.subtopic = args.subtopic || undefined;
    this.selector = args.selector || undefined;
};
