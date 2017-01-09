window.RTCPeerConnection = window.RTCPeerConnection = window.webkitRTCPeerConnection;
const LOG_ERROR = 1;
const LOG_WARNING = 2;
const LOG_NORMAL = 3;

class Peer {
    constructor(options) {
        const options = Object.assign({
            id: '',
            debug: 0, // 1: Errors, 2: Warnings, 3: All logs
            host: 'skyway.io',
            port: 443,
            key: 'peerjs',
            token: Math.random().toString(36).substr(2),
            path: '/',
            config: { iceServers: [] }
        }, options);
        Object.assign(this, options);
        if (!this.config.iceServers.find(val => val.urls === 'stun:stun.skyway.io:3478')) {
            this.config.iceServers.push({ urls: 'stun:stun.skyway.io:3478' });
        }
        this.eventListeners = {};
        this.logList = [];
        this.pcs = {};
        this.mediaConnections = {};
    }


    init() {
        return new Promise((resolve, reject) => {
            const url = `wss://skyway.io/peerjs?key=${this.key}&id=${this.id}&token=${this.token}`;
            this.log(LOG_NORMAL, 'SOCKET CONNECT', url);
            this.ws = new WebSocket(url);
            this.ws.onmessage = wsOnMessage;
            this.ws.onclose = evt => {
                this.log('SOCKET CLOSED', 'code:' + evt.code);
                if (evt.code === 1006) {
                    reject('Could not connect Signaling Server.');
                } else {
                    //this.signalingChannelOnClose();
                }
            }
        });
    }

    listAllPeers() {
        return fetch(`https://skyway.io/active/list/${apiKey}`)
            .then(res => res.json())
            .then(list => this.userList = list);
    }

    retrieveId() {
        return fetch(`https://skyway.io/${apiKey}/id?ts=${Date.now()}${Math.random()}`)
            .then(res => res.text())
            .then(text => this.id = text);
    }

    start(peerId) {
        let pc = this.pcs[peerId] = new RTCPeerConnection(configuration);
        pc.peerId = peerId;
        pc.onicecandidate = evt => {
            this.wsSend({ type: 'CANDIDATE', candidate: evt.candidate, dst: dstId });
        };
        pc.onnegotiationneeded = _ => {
            pc.createOffer().then(offer => {
                this.log(LOG_NORMAL, 'CREATE OFFER', offer);
                return pc.setLocalDescription(offer);
            }).then(_ => {
                wsSend({ type: 'OFFER', offer: pc.localDescription, dst: dstId });
            }).catch(logError);
        };
        pc.oniceconnectionstatechange = evt => {
            this.emit(pc.iceConnectionState, pc.peerId);
        }
        if ('ontrack' in pc) {
            pc.ontrack = evt => {
                this.log(LOG_NORMAL, 'ON ADD TRACK', evt.streams[0].id);
                if (evt.track.kind === 'video')
                    theirVideo.srcObject = evt.streams[0];
            };
        } else {
            pc.onaddstream = evt => {
                this.log(LOG_NORMAL, 'ON ADD STREAM', evt.stream.id);
                theirVideo.srcObject = evt.stream;
            }
        }

        setTimeout(function() {
            if (pc.addTrack) {
                this.log(LOG_NORMAL, 'ADD TRACK', myVideo.srcObject.id);
                pc.addTrack(myVideo.srcObject.getVideoTracks()[0], myVideo.srcObject);
            } else {
                this.log(LOG_NORMAL, 'ADD STREAM', myVideo.srcObject.id);
                pc.addStream(myVideo.srcObject);
            }
        }, 100);

        return pc;
    }

    wsSend(data) {
        this.log(LOG_NORMAL, 'SEND ' + data.type);
        this.ws.send(JSON.stringify(data));
    }

    wsOnMessage(evt) {
        const msg = JSON.parse(evt.data);
        if (msg.type === 'OFFER') {
            this.log(LOG_NORMAL, 'RECEIVE OFFER', null, msg.offer);
            pc.setRemoteDescription(new RTCSessionDescription(msg.offer)).then(_ => {
                return pc.createAnswer()
            }).then(answer => {
                this.log(LOG_NORMAL, 'CREATE ANSWER', answer);
                return pc.setLocalDescription(answer)
            }).then(_ => {
                this.log(LOG_NORMAL, 'SEND ANSWER', null, pc.localDescription);
                socket.send(o2j({ type: 'ANSWER', answer: pc.localDescription, dst: msg.src }))
            }).catch(e => console.log('set remote offer error', e));
        } else if (msg.type === 'ANSWER') {
            this.log(LOG_NORMAL, 'RECEIVE ANSWER', null, msg.answer);
            pc.setRemoteDescription(new RTCSessionDescription(msg.answer));
        } else if (msg.type === 'CANDIDATE') {
            this.log(LOG_NORMAL, 'RECEIVE CANDIDATE', null, msg.candidate);
            pc.addIceCandidate(new RTCIceCandidate(msg.candidate));
        } else if (msg.type === 'LEAVE') {
            this.log(LOG_NORMAL, 'RECEIVE LEAVE', 'Received leave message from' + message.src);
            this.emit('leave', message.src);
        } else if (msg.type === 'EXPIRE') {
            this.log(LOG_WARNING, 'RECEIVE EXPIRE', 'Could not connect to peer ' + message.src);
            pcClose(message.src);
            this.wsSend({ type: 'REMOTE EXPIRED', dst: message.src });
        } else if (msg.type === 'REMOTE EXPIRED') {
            this.log(LOG_WARNING, 'RECEIVE REMOTE EXPIRED', message.src);
            pcClose(message.src);
        } else if (msg.type === 'ERROR') {
            this.log(LOG_ERROR, 'SERVER ERROR', message.payload.msg);
            this.disconnect();
        } else if (msg.type === 'ID-TAKEN') {
            this.log(LOG_ERROR, 'ID TAKEN', `ID "${this.id}" is taken`);
            this.disconnect();
        } else if (msg.type === 'INVALID-KEY') {
            this.log(LOG_ERROR, 'INVALID KEY', `API KEY "${this.key}" is invalid`);
            this.disconnect();
        } else if (msg.type === 'PING') {
            this.log(LOG_NORMAL, 'RECEIVE PING');
            this.wsSend({ type: 'PONG' });
        }
    }

    pcClose(peerId) {
        if (this.pcs[peerId]) {
            try {
                this.pcs[peerId].close();
                delete this.pcs[peerId];
            } catch (e) {
                this.log(LOG_WARNING, 'PEERCONNECTION CLOSE EXCEPTION', e);
            }
        }
    }

    disconnect() {
        for (let peerId in this.pcs) {
            pcClose(peerId);
        }
        if (this.ws) {
            try {
                this.ws.close();
                delete this.ws;
            } catch (e) {
                this.log(LOG_WARNING, 'WEBSOCKET CLOSE EXCEPTION', e);
            }
        }
        this.emit('close');
    }

    reconnect() {
        this.log(LOG_NORMAL, 'RECONNECT');
        this.disconnect();
        this.init();
    }


    on(eventName, listener) {
        this.eventListeners[eventName] = this.eventListeners[eventName] || [];
        if (!this.eventListeners[eventName].includes(listener)) {
            this.eventListeners[eventName].push(listener.bind(this));
        }
    }

    off(eventName, listener) {
        if (this.eventListeners[eventName]) {
            let idx = this.eventListeners[eventName].indexOf(listener);
            if (idx === -1) return;
            this.eventListeners[eventName].splice(idx, 1);
        }
    }

    emit(eventName, eventArg) {
        const listeners = this.eventListeners[eventName];
        if (!listeners.length) return;
        for (var i = 0, l = listeners.length; i < l; i++) {
            listeners[i](eventArg);
        }
    }

    log(level, type, msg, data) {
        if (this.debug) {
            if (this.options.debug < level) return;
            this.logList.push({
                level: level,
                dt: Date.now(),
                log: log,
                data: data
            });
        }
    }

    downloadLog() {
        var sorted = logList.sort((a, b) => a.dt - b.dt);
        var jsonStr = JSON.stringify(sorted, null, 2);
        jsonStr = jsonStr.replace(/\\r\\n/g, '\r\n');
        var blob = new Blob([jsonStr]);
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `log_${myId.textContent}.json`;
        if (window.chrome) {
            a.click();
        } else {
            var clickEvent = new MouseEvent("click", {
                "view": window,
                "bubbles": true,
                "cancelable": false
            });
            a.dispatchEvent(clickEvent);
        }
    }
}