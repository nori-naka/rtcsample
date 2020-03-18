// p2p.js
// <<使い方>>
//
// import {P2P} from "./P2P.js";      /* モジュールのインポート */
// const peer = new P2P({           /* P2Pインスタンスの生成 */
//     my_id: my_id,　　　　　　     /* 自分のID */
//     remote_id: remote_id,        /* 対向先のID */
//     group_id: group_id           /* グループID (デフォルト値: g1) */
//     direction: direction,        /* 方向 sendonly | recvonly | sendrecv */
//     type: type,                  /* 種類 audio | video | both */
//     stream: stream,　　　　     　/* 自デバイスのstream */
//     socket: socket,              /* 外部にあるsocketを使用する場合に指定する(option) */
//     options: options,            /* 別途iceサーバを使用する場合に指定する(option) */
// });
// peer.call_in();　                 /* 発呼 */
// peer.call_out();                  /* 切断 */
// peer.on("call_in", (stream) => {  /* 他デバイスのstream */
//     /* ここで着信時の処理*/
// });
// peer.on("call_out", (stream) = {  /* 他デバイスのstream */
//     /* ここで、切断時の処理 */
// }


// import io from "socket.io-client";
export function P2P(args) {

    this.name = args.name
    //--------------------------------------------------
    // LOG
    //--------------------------------------------------
    const self = this;
    this.LOG = function (title, s, style) {
        // const NO_DISP = ["OFFER", "ANSWER", "ICE"]
        const NO_DISP = []
        if (NO_DISP.includes(title)) return;

        if (style) {
            console.log(`${self.my_id} in ${this.name}: ${title}: %c${s}`, style, "");
        } else {
            console.log(`${self.my_id} in ${this.name}: ${title}: ${s}`);
        }
    }
    //--------------------------------------------------
    // Setting
    //--------------------------------------------------
    const options = args.options || {
        "iceServers": [
            { "urls": "stun:stun.l.google.com:19302" },
            { "urls": "stun:stun1.l.google.com:19302" },
            { "urls": "stun:stun2.l.google.com:19302" }
        ]
    };

    if (!args.my_id || !args.remote_id || !args.type) {
        throw new Error("missing setting(args.XXX)");
    }

    this.socketio = args.socket || io.connect();
    this.my_id = args.my_id;
    this.remote_id = args.remote_id;
    this.group_id = args.group_id || "g1";
    this.stream = args.stream;
    // this.direction = args.direction;
    this.type = args.type;

    //--------------------------------------------------
    // Regist
    //--------------------------------------------------
    // this.socketio.emit("regist", JSON.stringify({ id: this.my_id, group_id: this.group_id }));

    //--------------------------------------------------
    // PeerConnection
    //--------------------------------------------------
    this.pc = new RTCPeerConnection(options);

    //--------------------------------------------------
    // destroy
    //--------------------------------------------------
    this.close = () => {
        this.pc.close();
        this.addTrack = null;
        this.pc.onicecandidate = null;
        this.pc.onsignalingstatechange = null;
        this.pc.oniceconnectionstatechange = null;
        this.call_in = null;
        this.call_out = null;
        this.callback = null;
        this.on = null;
        this.pc.ontrack = null;
        this.pc = null;
    }

    //--------------------------------------------------
    // addTrack
    //--------------------------------------------------
    this.addTrack = (local_direction) => {
        if (local_direction == "sendrecv" || local_direction == "sendonly") {
            if (this.type == "both" || this.type == "audio") {
                if (this.stream) {
                    const audio_track = this.stream.getAudioTracks()[0];
                    if (this.audio_sender) {
                        this.pc.getTransceivers().forEach(t => { t.direction = local_direction });
                    } else {
                        this.audio_sender = this.pc.addTrack(audio_track, this.stream);
                    }
                } else {
                    throw new Error("Setting ERROR(audio)");
                }
            }
            if (this.type == "both" || this.type == "video") {
                if (this.stream) {
                    const video_track = this.stream.getVideoTracks()[0];
                    if (this.video_sender) {
                        this.pc.getTransceivers().forEach(t => { t.direction = local_direction });
                    } else {
                        this.video_sender = this.pc.addTrack(video_track, this.stream);
                    }
                } else {
                    throw new Error("Setting ERROR(video)");
                }
            }
        } else if (local_direction == "recvonly") {
            if (!this.audio_transceiver) {
                if (this.type == "both" || this.type == "audio") {
                    this.audio_transceiver = this.pc.addTransceiver("audio", { direction: "recvonly" });
                }
            }
            if (!this.video_transceiver) {
                if (this.type == "both" || this.type == "video") {
                    this.video_transceiver = this.pc.addTransceiver("video", { direction: "recvonly" });
                }
            }
        }

        this.pc.getTransceivers().forEach(t => {
            this.LOG("TRANSCEIVER", `direct=${t.direction} sender=${t.sender.track ? t.sender.track.kind : "null"}`, "color:red; font-size: large")
        })
    }

    this.pc.onicecandidate = (ev) => {
        if (ev.candidate) {
            const data = {
                dest: this.remote_id,
                src: this.my_id,
                type: "candidate",
                candidate: ev.candidate
            }
            this.LOG("ICE", JSON.stringify(data));
            this.LOG("ICE", `SEND to ${data.dest}`);
            this.socketio.emit("publish", JSON.stringify(data));
        }
    }
    this.pc.addEventListener('signalingstatechange', () => {
        if (this.pc) {
            this.LOG("SIGNAL", this.pc.signalingState)
        } else {
            console.dir(this);
        }
    });
    this.pc.addEventListener('iceconnectionstatechange', () => this.LOG("CONNECT", this.pc.iceConnectionState));

    this.socketio.on("publish", async (msg) => {
        const data = JSON.parse(msg);
        if (!(data.src == this.remote_id && data.dest == this.my_id)) return;

        if (data.type == "offer") {
            this.LOG("OFFER", msg);
            try {
                if (this.pc.signalingState != "stable") return;
            } catch (err) {
                this.LOG("ERR", `this.my_id=${this.my_id}`, "color:red; font-size: large;")
            }

            await this.addTrack(data.direction);
            await this.pc.setRemoteDescription(data);
            await this.pc.createAnswer().then(answer => this.pc.setLocalDescription(answer));
            const _data = {
                dest: this.remote_id,
                src: this.my_id,
                type: "answer",
                sdp: this.pc.localDescription.sdp
            }
            this.socketio.emit("publish", JSON.stringify(_data));
            this.LOG("SDP", `SEND to ${_data.dest}`);
        } else if (data.type == "answer") {
            this.LOG("ANSWER", msg);
            if (this.pc.signalingState != "have-local-offer") return;
            await this.pc.setRemoteDescription(data);
        } else if (data.type == "candidate") {
            this.LOG("ICE", msg);
            try {
                await this.pc.addIceCandidate(data.candidate);
            } catch (err) {
                this.LOG("ERR", `CANDIDATE ERRO=${err}`);
                // console.log(JSON.stringify(data.candidate));
            }
        }
    });

    //--------------------------------------------------
    // remote_direction
    //--------------------------------------------------
    this.remote_direction = (local_direction) => {
        if (local_direction == "sendrecv") return "sendrecv";
        else if (local_direction == "sendonly") return "recvonly";
        else if (local_direction == "recvonly") return "sendonly";
        else return "inactive";
    }

    //--------------------------------------------------
    // 発呼
    //--------------------------------------------------
    this.call_in = async (local_direction) => {

        this.addTrack(local_direction);
        await this.pc.createOffer().then(offer => this.pc.setLocalDescription(offer));
        const data = {
            dest: this.remote_id,
            src: this.my_id,
            type: "offer",
            direction: this.remote_direction(local_direction),
            sdp: this.pc.localDescription.sdp,
        }
        // this.LOG("LOCAL SDP", JSON.stringify(data));
        this.LOG("SDP", `SEND to ${data.dest}`);
        this.socketio.emit("publish", JSON.stringify(data));
        // this.socketio.emit("publish", data);
    };

    //--------------------------------------------------
    // 切断
    //--------------------------------------------------
    this.call_out = async () => {
        console.log(`---------切断:${this.my_id}:----------------------------`);
        this.pc.getTransceivers().forEach(transceiver => {
            transceiver.direction = "recvonly";
        })
        await this.pc.createOffer().then(offer => this.pc.setLocalDescription(offer));
        const data = {
            dest: this.remote_id,
            src: this.my_id,
            type: "offer",
            direction: "recvonly",
            sdp: this.pc.localDescription.sdp,
        }
        // this.LOG("LOCAL SDP", JSON.stringify(data));
        this.LOG("SDP", `SEND to ${data.dest}`);
        this.socketio.emit("publish", JSON.stringify(data));
    }
    this.callback = {};
    this.on = (key, func_name) => {
        this.callback[key] = func_name;
    };
    this.last_stream;
    this.pc.ontrack = ev => {
        this.LOG("CALL_IN", `ev.track.kind=${ev.track.kind}`, "color: blue; font-size: large;")
        if (this.last_stream == ev.streams[0]) return;
        this.callback.call_in(ev.streams[0]);

        // ev.streams[0].onremovetrack = () => this.callback.call_out();
        ev.track.onmute = () => {
            this.callback.call_out();
            ev.track.onmute = null;
        }
        this.last_stream = ev.streams[0];
    }
}

// <<使い方>>
//
// import {getStream} from "./P2P.js"; /* モジュールのインポート */
// const stream = getStream (          /* 返値:MediaStream */
//     elm,            　　　　　　     /* MediaStreamを表示するvideo要素 or audio要素 */
//     mConstruction,                  /* 制約(デフォルト値: {video:true, audio:true}) */
// );

export async function getStream(elm, mConstruction) {
    const construction = mConstruction || {
        video: true,
        audio: true,
    }
    const stream = await navigator.mediaDevices.getUserMedia(construction);
    if (elm) {
        elm.srcObject = stream;
        await elm.play();
    }
    return await stream;
}

// <<使い方>>
//
// import {stats} from "./P2P.js";     /* モジュールのインポート */
// stats (                             /* 返値:無し */
//     pc,                             /* ステータスを取得する対象:PeerConnection */
//     elm,            　　　　　　     /* 結果を表示するdiv要素相当 */
// );

export function stats(pc, elm) {
    this.timerId = setInterval(function () {
        pc.getStats(null).then(stats => {
            let statsOutput = "";

            stats.forEach(report => {
                statsOutput += `<h2>Report: ${report.type}</h3>\n<strong>ID:</strong> ${report.id}<br>\n` +
                    `<strong>Timestamp:</strong> ${report.timestamp}<br>\n`;

                // Now the statistics for this report; we intentially drop the ones we
                // sorted to the top above

                Object.keys(report).forEach(statName => {
                    if (statName !== "id" && statName !== "timestamp" && statName !== "type") {
                        statsOutput += `<strong>${statName}:</strong> ${report[statName]}<br>\n`;
                    }
                });
            });

            elm.innerHTML = statsOutput;
        });
    }, 1000);
    this.clear = () => { clearInterval(this.timerId); }
}