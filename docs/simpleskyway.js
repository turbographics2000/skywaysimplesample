var token = Math.random().toString(36).substr(2);
var myUserId = ''; //(new MediaStream()).id;
var apiKey = '894abaae-ca60-4915-8107-d68c98c0aef1';
var configuration = {
    iceServers: [{
        urls: 'stun:stun.skyway.io:3478'
    }]
};
var pc = null;
var dstPeerId = null;

var pcs = {
    cam_dc: {},
    screen: {}
}

// var url = protocol + this.options.host + ':' + this.options.port +
//     this.options.path + 'active/list/' + this.options.key;

var signalingChannel = null;
fetch(`https://skyway.io/${apiKey}/id?ts=${Date.now() + '' + Math.random()}`).then(res => {
    res.text().then(text => {
        myUserId = text;
        fetch(`https://skyway.io/${apiKey}/${myUserId}/${token}/id?i=0`, { method: 'POST' }).then(res => res.text()).then(text => console.log(text));
        signalingChannel = new WebSocket(`wss://skyway.io/peerjs?key=${apiKey}&id=${myUserId}&token=${token}`);
        signalingChannel.onmessage = signalingChannelOnMessage;
        signalingChannel.onclose = evt => {
            console.log('signalingChannel close', evt);
        };
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
}).catch(err => {

});

getPeerList.onclick = _ => {
    // https://skyway.io/active/list/710982bb-75cd-4bb6-9ed8-f67676c0a8c9
    fetch(`https://skyway.io/active/list/${apiKey}`).then(res => res.text()).then(text => console.log(text)).catch(e => console.log(e));
}

var mediaConnectionId = 'mc_' + Math.random().toString(36).substr(2);


function start() {
    pc = new RTCPeerConnection(configuration);

    // send any ice candidates to the other peer
    pc.onicecandidate = evt => {
        if (evt.candidate) {
            console.log('candidate', evt.candidate);
            signalingChannel.send(JSON.stringify({
                type: 'CANDIDATE',
                payload: {
                    candidate: {
                        sdpMid: evt.candidate.sdpMid,
                        sdpMLineIndex: evt.candidate.sdpMLineIndex,
                        candidate: evt.candidate.candidate
                    },
                    type: 'media',
                    connectionId: mediaConnectionId
                },
                dst: dstPeerId
            }));
        }
    };

    // let the "negotiationneeded" event trigger offer generation
    pc.onnegotiationneeded = _ => {
        pc.createOffer().then(offer => {
                return pc.setLocalDescription(offer);
            })
            .then(_ => {
                // send the offer to the other peer
                var offer = {
                    type: 'OFFER',
                    payload: {
                        sdp: {
                            type: pc.localDescription.type,
                            sdp: pc.localDescription.sdp
                        },
                        type: 'media',
                        //label: connection.label,
                        connectionId: mediaConnectionId,
                        //reliable: connection.reliable,
                        //serialization: connection.serialization,
                        //metadata: connection.metadata,
                        browser: 'Chrome'
                    },
                    dst: dstPeerId
                };
                console.log('send OFFER', offer);
                signalingChannel.send(JSON.stringify(offer));
            }).catch(logError);
    };

    // once remote video track arrives, show it in the remote video element
    if (pc.onTrack) {
        pc.ontrack = evt => {
            if (evt.track.kind === 'video')
                theirVideo.srcObject = evt.streams[0];
        };
    } else {
        pc.onaddstream = evt => {
            theirVideo.srcObject = evt.stream;
        }
    }

    setTimeout(function() {
        if (pc.addTrack) {
            //pc.addTrack(myVideo.srcObject.getAudioTracks()[0], stream);
            pc.addTrack(myVideo.srcObject.getVideoTracks()[0], stream);
        } else {
            pc.addStream(myVideo.srcObject);
        }

    }, 100);
}

makeCall.onclick = _ => {
    dstPeerId = callToId.value;
    start();
};


signalingChannelOnMessage = evt => {
    var message = JSON.parse(evt.data);
    if (message.type) {
        var payload = message.payload;
        var peer = message.src;
        var connection;

        switch (message.type) {
            case 'OPEN': // The connection to the server is open.
                console.log('signalingChannel open');
                break;
            case 'ERROR': // Server error.
                console.log('server-error', payload.msg);
                break;
            case 'ID-TAKEN': // The selected ID is taken.
                console.log('unavailable-id', `ID "${myUserId}" is taken`);
                break;
            case 'INVALID-KEY': // The given API key cannot be found.
                console.log('invalid-key', `API KEY "${apiKey}" is invalid`);
                break;
            case 'PING':
                console.log('PING');
                signalingChannel.send(JSON.stringify({ type: 'PONG' }));
                break;
            case 'LEAVE': // Another peer has closed its connection to this peer.
                console.log('Received leave message from', peer);
                break;
            case 'EXPIRE': // The offer sent to a peer has expired without response.
                console.log('peer-unavailable', 'Could not connect to peer ' + peer);
                break;
            case 'OFFER': // we should consider switching this to CALL/CONNECT, but this is the least breaking option.
                if (!pc) {
                    start();
                    dstPeerId = message.src;
                }
                console.log('receive OFFER', message);
                pc.setRemoteDescription(new RTCSessionDescription(message.payload.sdp)).then(_ => {
                    console.log('create answer');
                    return pc.createAnswer();
                }).then(answer => {
                    return pc.setLocalDescription(answer);
                }).then(_ => {
                    var answer = {
                        type: 'ANSWER',
                        payload: {
                            sdp: {
                                type: pc.localDescription.type,
                                sdp: pc.localDescription.sdp
                            },
                            type: 'media',
                            connectionId: mediaConnectionId,
                            browser: 'Chrome'
                        },
                    };
                    console.log('send ANSWER', answer);
                    signalingChannel.send(JSON.stringify(answer));
                }).catch(logError);
                break;
            case 'ANSWER':
                console.log('receive ANSWER', message);
                pc.setRemoteDescription(new RTCSessionDescription(message.payload.sdp)).catch(logError);
                break;
            case 'CANDIDATE':
                console.log('candidate', message.payload.candidate);
                pc.addIceCandidate(message.payload.candidate);
                break;
            default:
                console.warn('You received a malformed message from ' + peer + ' of type ' + type);
                break;
        }
    } else {
        console.log('unknown message', message);
    }
};

function logError(error) {
    console.log(error.name + ': ' + error.message);
}