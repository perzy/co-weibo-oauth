co-weibo-oauth
===============
Weibo OAuth for ES6。微博公共平台OAuth SDK. [api](http://open.weibo.com/wiki/index.php/%E6%8E%88%E6%9D%83%E6%9C%BA%E5%88%B6%E8%AF%B4%E6%98%8E)

fork from [co-wechat-oauth](https://github.com/node-webot/co-wechat-oauth)
感谢co-wechat-oauth作者以及所有贡献者!!

## 模块状态

- [![NPM version](https://badge.fury.io/js/co-weibo-oauth.png)](http://badge.fury.io/js/co-weibo-oauth)

## 功能列表
- OAuth授权
- 获取基本信息

OAuth2.0网页授权，使用此接口须通过微博认证.

## Installation

```sh
$ npm install co-weibo-oauth
```

## Usage

### 初始化
引入OAuth并实例化

```js
var OAuth = require('co-weibo-oauth');
var client = new OAuth('your client_id', 'your client_secret');
```

以上即可满足单进程使用。
当多进程时，token需要全局维护，以下为保存token的接口。

```js
var oauthApi = new OAuth('client_id', 'client_secret', function * (uid) {
  // 传入一个根据uid获取对应的全局token的方法
  var txt = yield fs.readFile(uid +':access_token.txt', 'utf8');
  return JSON.parse(txt);
}, function (uid, token) {
  // 请将token存储到全局，跨进程、跨机器级别的全局，比如写到数据库、redis等
  // 这样才能在cluster模式及多机情况下使用，以下为写入到文件的示例
  // 持久化时请注意，每个uid都对应一个唯一的token!
  yield fs.writeFile(uid + ':access_token.txt', JSON.stringify(token));
});
```

### 引导用户
生成引导用户点击的URL。

```js
var url = client.getAuthorizeURL('redirectUrl', 'state', 'scope');
```

如果是PC上的网页，请使用以下方式生成
```js
var url = client.getAuthorizeURLForWebsite('redirectUrl');
```

### 获取Openid和AccessToken
用户点击上步生成的URL后会被重定向到上步设置的 `redirectUrl`，并且会带有`code`参数，我们可以使用这个`code`换取`access_token`和用户的`openid`

```js
var token = yield client.getAccessToken('code');
var accessToken = token.data.access_token;
var uid = token.data.uid;
```

### 获取用户信息
如果我们生成引导用户点击的URL中`scope`参数值为`snsapi_userinfo`，接下来我们就可以使用`uid`换取用户详细信息（必须在getAccessToken方法执行完成之后）

```js
var userInfo = yield client.getUser('uid');
```

## License
The MIT license.
