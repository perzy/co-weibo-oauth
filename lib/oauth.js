"use strict";

const urllib      = require('urllib');
const extend      = require('lodash').extend;
const querystring = require('querystring');

const AccessToken = function ( data ) {
  if ( !(this instanceof AccessToken) ) {
    return new AccessToken(data);
  }
  this.data = data;
};

/*!
 * 检查AccessToken是否有效，检查规则为当前时间和过期时间进行对比
 *
 * Examples:
 * ```
 * token.isValid();
 * ```
 */
AccessToken.prototype.isValid = function () {
  return !!this.data.access_token && (new Date().getTime()) < (this.data.create_at + this.data.expires_in * 1000);
};

/**
 * 根据client_id和client_secret创建OAuth接口的构造函数
 * 如需跨进程跨机器进行操作，access token需要进行全局维护
 * 使用使用token的优先级是：
 *
 * 1. 使用当前缓存的token对象
 * 2. 调用开发传入的获取token的异步方法，获得token之后使用（并缓存它）。

 * Examples:
 * ```
 * const OAuth = require('co-weibo-oauth');
 * const api = new OAuth('client_id', 'client_secret');
 * ```
 * @param {String} client_id 在公众平台上申请得到的 client_id
 * @param {String} client_secret 在公众平台上申请得到的app client_secret
 * @param {String} redirectUri 在公众平台上设置的回调地址 redirect_uri
 * @param {Generator} getToken 用于获取token的方法
 * @param {Generator} saveToken 用于保存token的方法
 */
const OAuth = function ( clientId, clientSecret, redirectUri, getToken, saveToken ) {
  this.clientId     = clientId;
  this.clientSecret = clientSecret;
  this.redirectUri  = redirectUri;
  // token的获取和存储
  this.store = {};
  const self = this;

  this.getToken = getToken || function * ( uid ) {
      return self.store[uid];
    };
  if ( !saveToken && process.env.NODE_ENV === 'production' ) {
    console.warn("Please dont save oauth token into memory under production");
  }
  this.saveToken = saveToken || function * ( uid, token ) {
      self.store[uid] = token;
    };
  this.defaults  = {};
};

/**
 * 用于设置urllib的默认options
 *
 * Examples:
 * ```
 * oauth.setOpts({timeout: 15000});
 * ```
 * @param {Object} opts 默认选项
 */
OAuth.prototype.setOpts = function setOpts( opts ) {
  this.defaults = opts;
};

/*!
 * urllib的封装
 *
 * @param {String} url 路径
 * @param {Object} opts urllib选项
 */
OAuth.prototype.request = function *request( url, opts ) {
  const options = {};
  extend(options, this.defaults);
  opts || (opts = {});
  for ( const key in opts ) {
    if ( key !== 'headers' ) {
      options[key] = opts[key];
    } else {
      if ( opts.headers ) {
        options.headers = options.headers || {};
        extend(options.headers, opts.headers);
      }
    }
  }

  let result;
  try {
    result = yield urllib.requestThunk(url, options);
  } catch ( err ) {
    err.name = 'WeiboAPI' + err.name;
    throw err;
  }

  const data = result.data;

  if ( data.error ) {
    const err = new Error(data.error_description);
    err.name  = 'WeiboAPIError';
    err.code  = data.error_code;
    throw err;
  }

  return data;
};

/**
 * 获取授权页面的URL地址
 * @param {String} redirect 授权后要跳转的地址
 * @param {String} state 开发者可提供的数据
 * @param {String} scope 作用范围，值为snsapi_userinfo和snsapi_base，前者用于弹出，后者用于跳转
 */
OAuth.prototype.getAuthorizeURL = function getAuthorizeURL( redirect, state, scope ) {
  const url  = 'https://api.weibo.com/oauth2/authorize';
  const info = {
    client_id: this.clientId,
    redirect_uri: this.redirectUri,
    response_type: 'code',
    scope: scope || 'users_show',
    state: state || ''
  };

  return url + '?' + querystring.stringify(info) + '#weibo_redirect'
};

/**
 * 获取授权页面的URL地址
 * @param {String} redirect 授权后要跳转的地址
 * @param {String} state 开发者可提供的数据
 * @param {String} scope 作用范围，值为snsapi_login，前者用于弹出，后者用于跳转
 */
OAuth.prototype.getAuthorizeURLForWebsite = function getAuthorizeURLForWebsite( redirect, state, scope ) {
  const url  = 'https://open.weibo.cn/oauth2/authorize';
  const info = {
    client_id: this.clientId,
    redirect_uri: this.redirectUri,
    response_type: 'code',
    scope: scope || 'users_show',
    state: state || ''
  };

  return url + '?' + querystring.stringify(info) + '#weibo_redirect'
};

/*!
 * 处理token，更新过期时间
 */
OAuth.prototype.processToken = function * processToken( data ) {
  data.create_at = new Date().getTime();
  // 存储token
  yield this.saveToken(data.uid, data);
  return AccessToken(data);
};


/**
 * 根据授权获取到的 `code` ，换取 `access_token` 和 `uid`
 * 获取 `uid` 之后，可以调用 `weibo.API` 来获取更多信息
 *
 * Examples:
 * ```
 * yield api.getAccessToken(code)
 * ```
 *
 * Result:
 * ```
 * {
 *  data: {
 *    "access_token": "ACCESS_TOKEN",
 *    "expires_in": 7200,
 *    "uid": "uid",
 *    "scope": "SCOPE"
 *  }
 * }
 * ```
 * @param {String} code 授权获取到的code
 */
OAuth.prototype.getAccessToken = function* getAccessToken( code ) {
  const url  = 'https://api.weibo.com/oauth2/access_token';
  const info = {
    client_id: this.clientId,
    client_secret: this.clientSecret,
    code: code,
    grant_type: 'authorization_code',
    redirect_uri: this.redirectUri
  };
  const args = {
    method: 'POST',
    data: info,
    dataType: 'json'
  };

  const data = yield this.request(url, args);

  return yield this.processToken(data);
};

/**
 * 根据授权获取到的accessToken，换取 expire_in 和 uid
 * 获取openid之后，可以调用`weibo.API`来获取更多信息
 * Examples:
 * ```
 * yield api.getTokenInfo(accessToken);
 * ```
 * Exception:
 *
 * - `err`, 获取access token出现异常时的异常对象
 *
 * 返回值:
 * ```
 * {
 *    "create_at": 1446856960,
 *    "expire_in": 7200,
 *    "appkey": "APPKEY",
 *    "uid": "OPENID",
 *    "scope": "SCOPE"
 * }
 * ```
 * @param {String} accessToken 授权获取到的code
 */
OAuth.prototype.getTokenInfo = function* getTokenInfo( accessToken ) {
  const url  = 'https://api.weibo.com/oauth2/get_token_info';
  const info = {
    access_token: accessToken
  };
  const args = {
    data: info,
    dataType: 'json'
  };

  return yield this.request(url, args);
};

OAuth.prototype.getExpiredDate = function getExpiredDate( tokenInfo ) {
  return new Date(tokenInfo.create_at + tokenInfo.expire_in);
};

/**
 * 根据refresh token，刷新access token，调用getAccessToken后才有效
 * Examples:
 * ```
 * api.refreshAccessToken(refreshToken);
 * ```
 * Exception:
 *
 * - `err`, 刷新access token出现异常时的异常对象
 *
 * Return:
 * ```
 * {
 *  data: {
 *    "access_token": "ACCESS_TOKEN",
 *    "expires_in": 7200,
 *  }
 * }
 * ```
 * @param {String} refreshToken refreshToken
 */
OAuth.prototype.refreshAccessToken = function* refreshAccessToken( refreshToken ) {
  const url  = 'https://api.weibo.com/oauth2/access_token';
  const info = {
    client_id: this.clientId,
    client_secret: this.clientSecret,
    grant_type: 'refresh_token',
    redirect_uri: this.redirectUri,
    refresh_token: refreshToken
  };
  const args = {
    data: info,
    dataType: 'json'
  };

  const data = yield this.request(url, args);

  return yield this.processToken(data);
};

OAuth.prototype._getUser = function ( options, accessToken ) {
  const url  = 'https://api.weibo.com/2/users/show.json';
  const info = {
    access_token: accessToken,
    uid: options.uid,
    lang: options.lang || 'en'
  };
  const args = {
    data: info,
    dataType: 'json'
  };
  return this.request(url, args);
};

/**
 * 根据uid，获取用户信息。
 * 当access token无效时，自动通过refresh token获取新的access token。然后再获取用户信息
 * Examples:
 * ```
 * api.getUser(options);
 * ```
 *
 * Options:
 * ```
 * uid
 * // 或
 * {
 *  "uid": "the user Id", // 必须
 *  "access_token": "ACCESS_TOKEN"
 *  "lang": "the lang code" // zh_CN 简体，zh_TW 繁体，en 英语
 * }
 * ```
 * Callback:
 *
 * - `err`, 获取用户信息出现异常时的异常对象
 *
 * Result:
 * ```
 * {
 *   id: 123456,
 *   idstr: '123456',
 *   class: 1,
 *   screen_name: '瓶子',
 *   name: '瓶子',
 *   province: '8',
 *   city: '2',
 *   location: '福建 厦门',
 *   description: '',
 *   url: '',
 *   profile_image_url: '',
 *   cover_image_phone: '',
 *   profile_url: '',
 *   domain: '',
 *   weihao: '',
 *   gender: 'm',
 *   followers_count: 190,
 *   friends_count: 182,
 *   pagefriends_count: 0,
 *   statuses_count: 898,
 *   favourites_count: 23,
 *   created_at: 'Thu Sep 24 09:11:41 +0800 2009',
 *   following: false,
 *   allow_all_act_msg: false,
 *   geo_enabled: true,
 *   verified: false,
 *   verified_type: -1,
 *   remark: '',
 *   status:
 *   {
 *
  *  },
 *   ptype: 0,
 *   allow_all_comment: true,
 *   avatar_large: '',
 *   avatar_hd: '',
 *   verified_reason: '',
 *   verified_trade: '',
 *   verified_reason_url: '',
 *   verified_source: '',
 *   verified_source_url: '',
 *   follow_me: false,
 *   online_status: 0,
 *   bi_followers_count: 45,
 *   lang: 'zh-cn',
 *   star: 0,
 *   mbtype: 2,
 *   mbrank: 3,
 *   block_word: 0,
 *   block_app: 0,
 *   credit_score: 80,
 *   user_ability: 0,
 *   urank: 20
 * }
 * ```
 * @param {Object|String} options 传入uid或者参见Options
 */
OAuth.prototype.getUser = function* getUser( options ) {
  if ( typeof options !== 'object' ) {
    options = {
      uid: options
    };
  }

  const data = yield this.getToken(options.uid);

  // 没有token数据
  if ( !data ) {
    const error = new Error('No token for ' + options.uid + ', please authorize first.');
    error.name  = 'NoOAuthTokenError';
    throw error;
  }
  const token = AccessToken(data);
  let accessToken;
  if ( token.isValid() ) {
    accessToken = token.data.access_token;
  } else {
    const newToken = yield this.refreshAccessToken(token.data.refresh_token);
    accessToken    = newToken.data.access_token;
  }

  return yield this._getUser(options, accessToken);
};

OAuth.prototype.getUser2 = function* getUser2( uid, accessToken ) {
  const options = {
    uid: uid
  };
  return yield this._getUser(options, accessToken);
};

OAuth.prototype._verifyToken = function * ( accessToken ) {
  return yield this.getTokenInfo(accessToken);
};

/**
 * 根据access_token，获取用户信息。
 * Examples:
 * ```
 * const user = yield api.getUserByAccessToken(accessToken);
 * ```
 * Exception:
 *
 * - `err`, 获取用户信息出现异常时的异常对象
 *
 * @param {String} accessToken 授权获取到的accessToken
 */
OAuth.prototype.getUserByAccessToken = function* getUserByAccessToken( accessToken ) {
  const tokenInfo = yield this.getTokenInfo(accessToken);
  return yield this.getUser(tokenInfo.uid);
};

/**
 * 根据code，获取用户信息。
 * Examples:
 * ```
 * const user = yield api.getUserByCode(code);
 * ```
 * Exception:
 *
 * - `err`, 获取用户信息出现异常时的异常对象
 *
 * @param {String} code 授权获取到的accessToken
 */
OAuth.prototype.getUserByCode = function* getUserByCode( code ) {
  const token = yield this.getAccessToken(code);
  return yield this.getUser(token.data.uid);
};

module.exports = OAuth;
