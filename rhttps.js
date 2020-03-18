var PORT = 8443;
var SSL_KEY = 'server.key';
var SSL_CERT = 'server.crt';

var keepAliveStart = false;
var ttlVal = 5;
var keepAliveTime = (new Date()).getTime();

var path = require('path');
var fs = require("fs");
var url = require("url");

var mime = {
    ".html": "text/html",
    ".css": "text/css",
    ".js": "text/javascript",
    ".webm": "video/webm"
};

// var json_filename = "./RECORD_layer/position.json";
// var out_str = fs.readFileSync(json_filename, 'utf8')
// var position_hash = JSON.parse(out_str)

var options = {
    key: fs.readFileSync(SSL_KEY).toString(),
    cert: fs.readFileSync(SSL_CERT).toString()
};

const getUniqueId = getUniqueIdMaker();

const LOG = function (flag, msg) {
    if (!flag) return;
    console.log(`${new Date().toLocaleString()}:${msg}`);
    // console.dir(user_sid)
}
// LOG FLAG
USER_LIST_LOG_FLAG = false;
MSG_LOG_FLAG = false;
SERVER_LOG_FLAG = false;

// var allDraw = [];

// サーバの初期化
var server = require("https").createServer(options, function (req, res) {
    var urlParse = url.parse(req.url, true);

    // // User-Agent : WebView detected
    // var ua_str = JSON.stringify(req.headers['user-agent'])
    // // console.log("ua is " + ua_str);
    // var re = /.+\swv\).+/
    // var is_webview = ua_str.match(re);


    var filePath;
    if (urlParse.pathname == '/' || urlParse.pathname == '/index.html') {
        filePath = '/index.html';
    } else {
        // クエリ文字が無くても、index.html宛てでない場合は、普通にそのファイルを返す
        filePath = decodeURI(urlParse.pathname);
    }
    var fullPath = __dirname + filePath;
    fs.readFile(fullPath, function (err, data) {
        if (err) {
            // console.log("NO FILE: " + filePath);
            LOG(SERVER_LOG_FLAG, `NO FILE= ${filePath}`)
            res.writeHead(500);
            res.end('Error loading ' + filePath);
        } else {
            res.writeHead(200, {
                "Content-Type": mime[path.extname(fullPath)] || "text/html",
                "Access-Control-Allow-Origin": "*"
            });
            if (urlParse.pathname == "/index.html" && urlParse.query.user_id) {
                data = data.toString().replace("initial_user_id", urlParse.query.user_id);
            }
            res.end(data);
        }
    });
}).listen(process.env.PORT || PORT);
var io = require("socket.io").listen(server);

// ユーザ管理ハッシュ
var userHash = {};
var user_list = {};
var user_sid = {};
var user_gid = {};
var allDraw = {};

var getUniqueStr = function (myStrong) {
    var strong = 10;
    if (myStrong) strong = myStrong;
    return new Date().getTime().toString(16) + Math.floor(strong * Math.random()).toString(16)
}

// イベントの定義
io.on("connection", function (socket) {

    console.log(`----------------------CONNECTION=${socket.id}------------------`);
    // socket.to(socket.id).emit("req-regist", {});
    socket.emit("req-regist", "HELLO");


    // ログメッセージ
    socket.on("log", function (msg) {
        var data = JSON.parse(msg);
        // console.log(`from=${data.id} // text=${data.text}`);
        LOG(MSG_LOG_FLAG, `from=${data.id} // ${data.text}`);
    });

    // 登録
    socket.on("regist", function (msg) {
        var data = JSON.parse(msg);
        console.dir(msg)
        // console.log('ON REGIST:' + _id);
        LOG(USER_LIST_LOG_FLAG, `ON REGIST: ${data.id}@${data.group_id}`);
        _id = data.id;
        group_id = data.group_id;

        socket.join(group_id);

        user_sid[_id] = socket.id;
        user_gid[_id] = group_id;

        if (!userHash[group_id]) {
            userHash[group_id] = {};
        }

        console.log(`changed user_sid `);
        console.dir(user_sid);
        socket.broadcast.emit("regist", JSON.stringify({ id: _id }));//現在、誰も受信していない
        // socket.emit("alldraw", JSON.stringify(allDraw));
        // io.to(group_id).emit("alldraw", JSON.stringify(allDraw[group_id]));
    });


    // メッセージ送信
    socket.on("publish", function (msg) {
        var data = JSON.parse(msg);
        if (data.dest) {
            //socket.broadcast.emit("publish", msg);
            socket.to(user_sid[data.dest]).emit("publish", msg);
        } else {
            socket.broadcast.emit("publish", msg);
        }
        LOG(MSG_LOG_FLAG, `PUBLISH MSG: ${msg}`);
    });

    // PING
    socket.on("remote_connect", function (msg) {
        var data = JSON.parse(msg);

        // console.log(`remote_connect ${msg}`);
        if (data.dest) {
            socket.to(user_sid[data.dest]).emit("remote_connect", msg);
        }
    });


    // 位置情報着信
    socket.on("renew", function (msg) {
        var data = JSON.parse(msg);
        // console.log(`ON RENEW : From=${data.id} LAT=${data.lat} LNG=${data.lng} CAM=${data.cam} NAME=${data.name}`);
        LOG(USER_LIST_LOG_FLAG, `ON RENEW : From=${data.id} LAT=${data.lat} LNG=${data.lng} CAM=${data.cam} NAME=${data.name}`);

        if (data.id) {
            if (!userHash[user_gid[data.id]]) {
                userHash[user_gid[data.id]] = {};
            }
            userHash[user_gid[data.id]][data.id] = { lat: data.lat, lng: data.lng, ttl: ttlVal, cam: data.cam, name: data.name };
            //console.log("RECIVE:USERHASH=" + JSON.stringify(userHash));
        }
    });

    // 切断
    socket.on("disconnect", function (reason) {
        // console.log(`DISCONNECT msg=${reason}`);
        LOG(USER_LIST_LOG_FLAG, `DISCONNECT msg=${reason}`);
        console.log(`socket.id=${socket.id}`);
        // if (reason.indexOf("transport error") != -1) {
        Object.keys(user_sid).forEach(function (_id) {
            if (user_sid[_id] == socket.id) {
                delete userHash[_id];
                delete user_sid[_id];
                delete user_gid[_id];
                // io.sockets.emit("user_disconnect", JSON.stringify({ id: _id}));
            }
        });
    });

    // 接続終了(接続元ユーザを削除し、他ユーザへ通知)
    /*
    Object.keys(user_sid).forEach(function(_id){
        if (socket.id == user_sid[_id]) {
            delete userHash[_id];
            delete user_sid[_id];
            var msg = {id: _id};
            socket.broadcast.emit("disconect", JSON.stringify(msg));
        }
    });
    console.log("DELETE:USERHASH=" + JSON.stringify(userHash));        
    //socket.broadcast.emit("renew", { value: JSON.stringify(userHash) });   
    */


    // ユーザリスト
    socket.on("user_list", function (msg) {
        // console.log(`recive user_list=${msg}`)
        LOG(USER_LIST_LOG_FLAG, `recive user_list=${msg}`)
        var data = JSON.parse(msg);

        if (data.id) {
            user_sid[data.id] = socket.id;
            user_gid[data.id] = data.group_id;
            if (!user_list[data.group_id]) {
                user_list[data.group_id] = {};
            }
            user_list[data.group_id][data.id] = { ttl: ttlVal, name: data.name };
        }
    });

    // setInterval(function () {
    //     console.log(`USER_LIST=${JSON.stringify(user_list)}`);
    //     io.emit("user_list", JSON.stringify(user_list));
    // }, 5000);

    // setInterval(function () {
    //     io.emit("renew", JSON.stringify(userHash));
    // }, 1500);

});

setInterval(function () {
    // console.log(`USER_LIST=${JSON.stringify(user_list)}`);
    LOG(USER_LIST_LOG_FLAG, `SEND USER_LIST=${JSON.stringify(user_list)}`);
    Object.keys(user_list).forEach(function (group_id) {
        io.to(group_id).emit("user_list", JSON.stringify(user_list[group_id]));
    });
}, 5000);

setInterval(function () {
    // io.emit("renew", JSON.stringify(userHash));
    LOG(USER_LIST_LOG_FLAG, `SEND RENEW=${JSON.stringify(userHash)}`)
    Object.keys(userHash).forEach(function (group_id) {
        io.to(group_id).emit("renew", JSON.stringify(userHash[group_id]));
    });
}, 1500);


setInterval(function () {
    Object.keys(user_list).forEach(function (group_id) {
        Object.keys(user_list[group_id]).forEach(function (id) {
            user_list[group_id][id].ttl = user_list[group_id][id].ttl - 1;
            if (user_list[group_id][id].ttl < 0) {
                delete user_list[group_id][id];
                delete user_sid[id];
                delete user_gid[id];
                // console.log(`DELETE id=${id} USER_LIST=${JSON.stringify(user_list)}`);
                LOG(USER_LIST_LOG_FLAG, `DELETE id=${id} USER_LIST=${JSON.stringify(user_list)} USER_SID=${JSON.stringify(user_sid)}`);
            }
        });
    });
}, 5000);

setInterval(function () {
    const now = (new Date()).getTime();
    if (now >= keepAliveTime + 1500) {
        keepAliveTime = now;
        Object.keys(userHash).forEach(function (group_id) {
            Object.keys(userHash[group_id]).forEach(function (id) {
                userHash[group_id][id].ttl = userHash[group_id][id].ttl - 1;
                if (userHash[group_id][id].ttl < 0) {
                    delete userHash[group_id][id];
                    //delete user_sid[id];
                    // console.log(`DELETE id=${id} USER_HASH=${JSON.stringify(userHash)}`);
                    LOG(USER_LIST_LOG_FLAG, `DELETE id=${id} USER_HASH=${JSON.stringify(userHash)}`);
                }
            });
        })
    }
}, 1500);



// 番号をアルファベットに変換（27進数）
function getAlphabet(no) {
    return getAlphabetExec(no + 1);
}
function getAlphabetExec(no) {
    if (no == 0) {
        return "";
    }
    else if (no < 27) {
        return String.fromCharCode(0x40 + no);
    }
    else {
        var upper = Math.floor(no / 27);
        var lower = no % 27;
        return getAlphabetExec(upper) + getAlphabetExec(lower);
    }
}

// ユニークID
function getUniqueIdMaker() {
    var userId = 0;
    return function () {
        var alpha = getAlphabet(userId);
        userId++;
        return alpha;
    }
}
