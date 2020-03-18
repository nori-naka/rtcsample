import { P2P, getStream } from "./p2p.js";
export function P2G(elm, callback) {
    const socketio = io.connect();
    const my_id = _uuidv4();
    const group_id = "g1";
    let userHash = {};
    let last_user_ids = null;
    let remotes = {};
    let local_stream;
    (async function () {
        local_stream = await getStream(null, { video: false, audio: true })
    })();

    //--------------------------------------------------
    // Regist
    //--------------------------------------------------
    socketio.emit("regist", JSON.stringify({ id: my_id, group_id: "g1" }));

    //--------------------------------------------------
    // Regist
    //--------------------------------------------------
    const timerId = setInterval(() => {
        socketio.emit("renew", JSON.stringify({ id: my_id, group_id: "g1" }));
    }, 1500);


    socketio.on("renew", msg => {
        if (!local_stream) return;

        let new_users = [];
        let del_users = [];
        userHash = JSON.parse(msg);
        const user_ids = Object.keys(userHash);
        if (user_ids.includes(my_id)) user_ids.splice(user_ids.indexOf(my_id), 1);

        if (last_user_ids) {
            new_users = user_ids.filter(user => { return !(last_user_ids.includes(user)) });
            del_users = last_user_ids.filter(user => { return !(user_ids.includes(user)) });
        } else {
            new_users = user_ids;
        }

        new_users.forEach(user => {
            if (my_id == user) return
            const peer = new P2P({
                my_id: my_id,
                remote_id: user,
                group_id: group_id,
                socket: socketio,
                stream: local_stream,
                // direction: "sendonly",
                type: "audio"
            });
            const audio_elm = document.createElement("audio");
            // elm.appendChild(audio_elm);

            peer.on("call_in", stream => {
                audio_elm.srcObject = stream;
                audio_elm.play()
                callback.call_in_effect();
            });
            peer.on("call_out", () => {
                callback.call_out_effect();
            })
            remotes[user] = {
                peer: peer,
                audio: audio_elm
            }
        })
        del_users.forEach(user => {
            // remotes[user].peer.close();
            delete remotes[user];
        })

        last_user_ids = user_ids;
    });

    const call_in = () => {
        Object.keys(remotes).forEach(id => {
            if (my_id == id) return;
            remotes[id].peer.call_in("sendonly");
        })
    }
    const call_out = () => {
        Object.keys(remotes).forEach(id => {
            if (my_id == id) return;
            remotes[id].peer.call_out();
        })
    }
    const show_remotes = () => {
        console.dir(remotes);
    }
    return {
        call_in,
        call_out,
        show_remotes,
    }
}

const _uuidv4 = () => {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
        var r = (Math.random() * 16) | 0,
            v = c == "x" ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}