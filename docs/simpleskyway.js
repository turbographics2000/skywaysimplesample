var token = Math.random().toString(36).substr(2);
var myUserId = (new MediaStream()).id;
var apiKey = '894abaae-ca60-4915-8107-d68c98c0aef1';
var configuration = {
    iceServers: [{
        urls: 'stun:stun.skyway.io:3478'
    }]
};
var pc = null;

var signalingChannel = null;
fetch(`https://skyway.io/${apiKey}/id?ts=${Date.now() + '' + Math.random()}`).then(res => {
    res.text().then(text => {
        myUserId = text;
        signalingChannel = new WebSocket(`wss://skyway.io/peerjs?key=${apiKey}&id=${myUserId}&token=${token}`);
        signalingChannel.onmessage = signalingChannelOnMessage;
        signalingChannel.onerror = evt => {
            console.log('signalingChannel error', evt);
        };
        // get a local stream, show it in a self-view and add it to be sent
        navigator.mediaDevices.getUserMedia({ video: true })
            .then(stream => {
                myVideo.srcObject = stream;
                myId.textContent = myUserId;
                step1Container.style.display = step3Container.style.display = 'none';
                step2Container.style.display = 'block';
            })
            .catch(logError);
    });
});


function start() {
    pc = new RTCPeerConnection(configuration);

    // send any ice candidates to the other peer
    pc.onicecandidate = evt => {
        signalingChannel.send(JSON.stringify({ candidate: evt.candidate }));
    };

    // let the "negotiationneeded" event trigger offer generation
    pc.onnegotiationneeded = _ => {
        pc.createOffer().then(offer => {
                return pc.setLocalDescription(offer);
            })
            .then(_ => {
                // send the offer to the other peer
                signalingChannel.send(JSON.stringify({ 'desc': pc.localDescription }));
            })
            .catch(logError);
    };

    // once remote video track arrives, show it in the remote video element
    pc.ontrack = evt => {
        if (evt.track.kind === 'video')
            remoteView.srcObject = evt.streams[0];
    };

    if (pc.addTrack) {
        //pc.addTrack(myVideo.srcObject.getAudioTracks()[0], stream);
        pc.addTrack(myVideo.srcObject.getVideoTracks()[0], stream);
    } else {
        pc.addStream(myVideo.srcObject);
    }
}
makeCall.onclick = start;


signalingChannelOnMessage = evt => {
    if (!pc)
        start();

    var message = JSON.parse(evt.data);
    if (message.type) {
        var payload = message.payload;
        var peer = message.src;
        var connection;
        switch (message.type) {
            case 'OPEN': // The connection to the server is open.
                //this.emit('signalingChannel open', this.id);
                //this.open = true;
                console.log('sc open');
                break;
            case 'ERROR': // Server error.
                console.log('server-error', payload.msg);
                break;
            case 'ID-TAKEN': // The selected ID is taken.
                console.log('unavailable-id', `ID "${this.id}" is taken`);
                break;
            case 'INVALID-KEY': // The given API key cannot be found.
                console.log('invalid-key', `API KEY "${this.options.key}" is invalid`);
                break;
            case 'PING':
                this.socket.sendPong();
                break;
            case 'LEAVE': // Another peer has closed its connection to this peer.
                console.log('Received leave message from', peer);
                this._cleanupPeer(peer);
                break;

            case 'EXPIRE': // The offer sent to a peer has expired without response.
                this.emitError('peer-unavailable', 'Could not connect to peer ' + peer);
                break;
            case 'OFFER': // we should consider switching this to CALL/CONNECT, but this is the least breaking option.
                var connectionId = payload.connectionId;
                connection = this.getConnection(peer, connectionId);

                if (connection) {
                    console.warn('Offer received for existing Connection ID:', connectionId);
                    //connection.handleMessage(message);
                } else {
                    // Create a new connection.
                    if (payload.type === 'media') {
                        connection = new MediaConnection(peer, this, {
                            connectionId: connectionId,
                            _payload: payload,
                            metadata: payload.metadata
                        });
                        util.log("MediaConnection created in OFFER");
                        this._addConnection(peer, connection);
                        this.emit('call', connection);
                    } else if (payload.type === 'data') {
                        connection = new DataConnection(peer, this, {
                            connectionId: connectionId,
                            _payload: payload,
                            metadata: payload.metadata,
                            label: payload.label,
                            serialization: payload.serialization,
                            reliable: payload.reliable
                        });
                        this._addConnection(peer, connection);
                        this.emit('connection', connection);
                    } else {
                        util.warn('Received malformed connection type:', payload.type);
                        return;
                    }
                    // Find messages.
                    var messages = this._getMessages(connectionId);
                    for (var i = 0, ii = messages.length; i < ii; i += 1) {
                        connection.handleMessage(messages[i]);
                    }
                }
                break;
            default:
                if (!payload) {
                    console.warn('You received a malformed message from ' + peer + ' of type ' + type);
                    return;
                }

                var id = payload.connectionId;
                connection = this.getConnection(peer, id);

                if (connection && connection.pc) {
                    // Pass it on.
                    connection.handleMessage(message);
                } else if (id) {
                    // Store for possible later use
                    this._storeMessage(id, message);
                } else {
                    console.warn('You received an unrecognized message:', message);
                }
                break;
        }
    }

    if (message.desc) {
        var desc = message.desc;

        // if we get an offer, we need to reply with an answer
        if (desc.type === 'offer') {
            pc.setRemoteDescription(desc).then(_ => {
                    return pc.createAnswer();
                })
                .then(answer => {
                    return pc.setLocalDescription(answer);
                })
                .then(_ => {
                    var str = JSON.stringify({ desc: pc.localDescription });
                    signalingChannel.send(str);
                })
                .catch(logError);
        } else if (desc.type === 'answer') {
            pc.setRemoteDescription(desc).catch(logError);
        } else {
            log('Unsupported SDP type. Your code may differ here.');
        }
    } else
        pc.addIceCandidate(message.candidate).catch(logError);
};

function logError(error) {
    console.log(error.name + ': ' + error.message);
}