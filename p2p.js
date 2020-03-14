// 使い方
// import P2P from "./P2P.js";
// P2Pインスタンスの生成
// const peer = new P2P({
//     my_id: my_id,　　　　　　/* 自分のID */
//     remote_id: remote_id,   /* 対向先のID */
//     stream: stream,
//     socket: socket
// });
// peer.call_in();　/* 発呼 */
// peer.on("call_in", (stream) => {
//     /* ここで着信時の処理*/
// })


// import io from "socket.io-client";
const P2P = function (args) {
    // args = { my_id: my_id, remote_id: remote_id, stream: stream, socket: socket }
    
    this.name = args.name
    //--------------------------------------------------
    // LOG
    const self = this;
    this.LOG = function (title, s, style) {
        const NO_DISP = ["OFFER", "ANSWER"]
        // const NO_DISP = []
        if (NO_DISP.includes(title)) return;

        if (style) {
            console.log(`${self.my_id} in ${this.name}: ${title}: %c${s}`, style, "");
        } else {
            console.log(`${self.my_id} in ${this.name}: ${title}: ${s}`);
        }
    }
    //--------------------------------------------------
    // Setting
    const options = {
        "iceServers": [
            { "urls": "stun:stun.l.google.com:19302" },
            { "urls": "stun:stun1.l.google.com:19302" },
            { "urls": "stun:stun2.l.google.com:19302" }
        ]
    };
    this.socketio = args.socket || io.connect();
    if (!args.my_id || !args.remote_id) {
        throw new Error("ID missing");
    }
    this.my_id = args.my_id;
    this.remote_id = args.remote_id;
    this.stream = args.stream;
    this.direction = args.direction;
    this.type = args.type;

    this.socketio.emit("regist", JSON.stringify({ id: this.my_id, group_id: "g1" }));

    //--------------------------------------------------
    // PeerConnection
    //--------------------------------------------------
    this.pc = new RTCPeerConnection(options);

    //--------------------------------------------------
    // Transceiver
    //--------------------------------------------------
    // this.transceivers = {};
    // if (this.stream) {
    //     this.stream.getTracks().forEach(track => {
    //         if (track.kind == "audio") {
    //             this.transceivers.audio = this.pc.addTransceiver(track, { direction: "inactive", streams: [this.stream] });
    //         } else if (track.kind == "video") {
    //             this.transceivers.video = this.pc.addTransceiver(track, { direction: "inactive", streams: [this.stream] });
    //         }
    //     });
    // }

    //--------------------------------------------------
    // addTrack
    //--------------------------------------------------

    if (!args.my_id || !args.remote_id || !args.direction || !args.type) throw new Error("missing setting(args.XXX)");
    this.addTrack = () => {
        const audio_send = ((args.type == "both") || (args.type == "audio")) && ((args.direction == "sendonly") || (args.direction == "sendrecv"))
        const video_send = ((args.type == "both") || (args.type == "video")) && ((args.direction == "sendonly") || (args.direction == "sendrecv"))
        const audio_recv = ((args.type == "both") || (args.type == "audio")) && (args.direction == "recvonly")
        const video_recv = ((args.type == "both") || (args.type == "video")) && (args.direction == "recvonly")

        if (audio_send) {
            if (this.stream) {
                [audio_track] = this.stream.getAudioTracks();
                if (this.audio_sender) {
                    this.pc.getTransceivers().forEach(t => {
                        if (t.sender == this.audio_sender)  t.direction = "sendrecv";
                    })
                } else {
                    // this.audio_sender = this.pc.addTrack(audio_track, this.stream);
                    this.audio_sender = this.pc.addTransceiver(audio_track, {
                        streams: [this.stream],
                        direction: "sendrecv"
                    });
                }
            } else {
                throw new Error("Missing Stream (audio)")
            }
        } else if (audio_recv) {
            this.pc.addTransceiver("audio", { direction: "recvonly" });
        } else {
            if (args.type == "audio" || args.type == "both") throw new Error("setting NG (audio)")
        };

        if (video_send) {
            if (this.stream) {
                [video_track] = this.stream.getVideoTracks();
                if (this.video_sender) {
                    this.pc.getTransceivers().forEach(t => {
                        if (t.sender == this.video_sender) t.direction = "sendrecv";
                    })
                } else {
                    // this.video_sender = this.pc.addTrack(video_track, this.stream);
                    this.video_sender = this.pc.addTransceiver(video_track, {
                        streams: [this.stream],
                        direction: "sendrecv"
                    });
                }
            } else {
                throw new Error("Missing Stream (audio)")
            }
        } else if (video_recv) {
            this.pc.addTransceiver("video", { direction: "recvonly" });
        } else {
            if (args.type == "video" || args.type == "both") throw new Error("setting NG (video)")
        };

        this.pc.getTransceivers().forEach(t => {
            this.LOG("TRANSCEIVER", `direct=${t.direction} sender=${t.sender.track ? t.sender.track.kind : "null"}`, "color:red; font-size: large" )
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
            // this.socketio.emit("publish", data);
        }
    }
    this.pc.addEventListener('signalingstatechange', () => this.LOG("SIGNAL", this.pc.signalingState));
    this.pc.addEventListener('iceconnectionstatechange', () => this.LOG("CONNECT", this.pc.iceConnectionState));
    this.socketio.on("publish", async (msg) => {
        const data = JSON.parse(msg);
        if (data.src == this.my_id) return;

        if (data.type == "offer") {
            this.LOG("OFFER", msg);
            await this.addTrack();
            // const sdp = new RTCSessionDescription(data);
            // await this.pc.setRemoteDescription(sdp);
            await this.pc.setRemoteDescription(data);
            await this.pc.createAnswer().then(answer => this.pc.setLocalDescription(answer));
            const _data = {
                dest: this.remote_id,
                src: this.my_id,
                type: "answer",
                sdp: this.pc.localDescription.sdp
            }
            this.socketio.emit("publish", JSON.stringify(_data));
            // this.socketio.emit("publish", _data);
            // this.LOG("LOCAL SDP", JSON.stringify(_data));
            this.LOG("SDP", `SEND to ${_data.dest}`);
        } else if (data.type == "answer") {
            this.LOG("ANSWER", msg);
            // const sdp = new RTCSessionDescription(data);
            // await this.pc.setRemoteDescription(sdp);
            await this.pc.setRemoteDescription(data);
        } else if (data.type == "candidate") {
            this.LOG("ICE", msg);
            try {
                // const candidate = new RTCIceCandidate(data.candidate);
                await this.pc.addIceCandidate(data.candidate);
            } catch (err) {
                console.log(`CANDIDATE ERRO=${err}`);
                console.log(JSON.stringify(data.candidate));
                // console.log(JSON.stringify(candidate));
            }
        }
    });
    
    //--------------------------------------------------
    // 発呼
    // peer.call_in({
    //   direction: "recvonly" | "sendonly" | "inactive" | "sendrecv",
    //   type: "audio" | "video" | "both"
    // });
    //--------------------------------------------------
    this.call_in = async () => {
        // if (args.type == "both") {
        //     this.transceivers.audio.direction = args.direction;
        //     this.transceivers.video.direction = args.direction;
        // } else {
        //     this.transceivers[args.type].direction = args.direction;
        // }
        this.addTrack();
        await this.pc.createOffer().then(offer => this.pc.setLocalDescription(offer));
        const data = {
            dest: this.remote_id,
            src: this.my_id,
            type: "offer",
            sdp: this.pc.localDescription.sdp,
        }
        // this.LOG("LOCAL SDP", JSON.stringify(data));
        this.LOG("SDP", `SEND to ${data.dest}`);
        this.socketio.emit("publish", JSON.stringify(data));
        // this.socketio.emit("publish", data);
    };

    this.call_out = async () => {
        console.log(`---------切断:${this.my_id}:----------------------------`);
        // if (this.audio_sender) this.pc.removeTrack(this.audio_sender);
        // if (this.video_sender) this.pc.removeTrack(this.video_sender);

        this.pc.getTransceivers().forEach(transceiver => {
            transceiver.direction = "recvonly";
        })
        // this.pc.getSenders().forEach(sender => {
        //     this.pc.removeTrack(sender);
        // })
        await this.pc.createOffer().then(offer => this.pc.setLocalDescription(offer));
        const data = {
            dest: this.remote_id,
            src: this.my_id,
            type: "offer",
            sdp: this.pc.localDescription.sdp,
        }
        // this.LOG("LOCAL SDP", JSON.stringify(data));
        this.LOG("SDP", `SEND to ${data.dest}`);
        this.socketio.emit("publish", JSON.stringify(data));
        // this.socketio.emit("publish", data);
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
        // ev.streams[0].onremovetrack = function () {
        //     self.callback.call_out();
        // }
        ev.streams[0].onremovetrack = () => this.callback.call_out();
        this.last_stream = ev.streams[0];
    }
}

const getStream = async (elm, mConstruction) => {
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

let timerId;
const stats = (pc, elm) => {
    timerId = setInterval(function () {
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
}