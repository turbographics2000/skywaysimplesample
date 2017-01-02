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
                signalingChannel.send(JSON.stringify({
                    type: 'OFFER',
                    payload: {
                        sdp: {
                            type: offer.type,
                            sdp: offer.sdp
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
                }));
            })
            .catch(logError);
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

    if (pc.addTrack) {
        //pc.addTrack(myVideo.srcObject.getAudioTracks()[0], stream);
        pc.addTrack(myVideo.srcObject.getVideoTracks()[0], stream);
    } else {
        pc.addStream(myVideo.srcObject);
    }
}

makeCall.onclick = _ => {
    start(callToId.value);
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
                pc.setRemoteDescription(message.payload.sdp).then(_ => {
                    return pc.createAnswer();
                }).then(answer => {
                    return pc.setLocalDescription(answer);
                }).then(_ => {
                    // {"src":"kIZ7X2OKqp5MU4QL","dst":"ObHaiLJKMbhQSN66","payload":{"browser":"Chrome","connectionId":"mc_1lfzm6ccrbvz2umsibyma8xgvi","sdp":{"sdp":"v=0\r\no=- 1332821003923139301 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\na=group:BUNDLE audio video\r\na=msid-semantic: WMS cbgOva9tqJ0MoAu6oWGbPKlFuAWDSUsZy1Fw\r\nm=audio 9 UDP\/TLS\/RTP\/SAVPF 111 103 104 9 0 8 106 105 13 126\r\nc=IN IP4 0.0.0.0\r\na=rtcp:9 IN IP4 0.0.0.0\r\na=ice-ufrag:W8yi\r\na=ice-pwd:9wbj1TykGh\/022LFtmi3HEHX\r\na=fingerprint:sha-256 91:39:DF:4E:0A:F7:B0:08:44:6E:EF:2A:5B:CA:C0:E5:73:2C:A5:F3:D4:BD:2F:A8:67:87:44:2B:FF:63:E5:A4\r\na=setup:active\r\na=mid:audio\r\na=extmap:1 urn:ietf:params:rtp-hdrext:ssrc-audio-level\r\na=sendrecv\r\na=rtcp-mux\r\na=rtpmap:111 opus\/48000\/2\r\na=rtcp-fb:111 transport-cc\r\na=fmtp:111 minptime=10;useinbandfec=1\r\na=rtpmap:103 ISAC\/16000\r\na=rtpmap:104 ISAC\/32000\r\na=rtpmap:9 G722\/8000\r\na=rtpmap:0 PCMU\/8000\r\na=rtpmap:8 PCMA\/8000\r\na=rtpmap:106 CN\/32000\r\na=rtpmap:105 CN\/16000\r\na=rtpmap:13 CN\/8000\r\na=rtpmap:126 telephone-event\/8000\r\na=ssrc:3430097990 cname:zeDEX4lYdufTvtIw\r\na=ssrc:3430097990 msid:cbgOva9tqJ0MoAu6oWGbPKlFuAWDSUsZy1Fw d8221ce3-a041-4e3b-ba71-4f07a3d159e6\r\na=ssrc:3430097990 mslabel:cbgOva9tqJ0MoAu6oWGbPKlFuAWDSUsZy1Fw\r\na=ssrc:3430097990 label:d8221ce3-a041-4e3b-ba71-4f07a3d159e6\r\nm=video 9 UDP\/TLS\/RTP\/SAVPF 100 101 107 116 117 96 97 99 98\r\nc=IN IP4 0.0.0.0\r\na=rtcp:9 IN IP4 0.0.0.0\r\na=ice-ufrag:W8yi\r\na=ice-pwd:9wbj1TykGh\/022LFtmi3HEHX\r\na=fingerprint:sha-256 91:39:DF:4E:0A:F7:B0:08:44:6E:EF:2A:5B:CA:C0:E5:73:2C:A5:F3:D4:BD:2F:A8:67:87:44:2B:FF:63:E5:A4\r\na=setup:active\r\na=mid:video\r\na=extmap:2 urn:ietf:params:rtp-hdrext:toffset\r\na=extmap:3 http:\/\/www.webrtc.org\/experiments\/rtp-hdrext\/abs-send-time\r\na=extmap:4 urn:3gpp:video-orientation\r\na=extmap:5 http:\/\/www.ietf.org\/id\/draft-holmer-rmcat-transport-wide-cc-extensions-01\r\na=extmap:6 http:\/\/www.webrtc.org\/experiments\/rtp-hdrext\/playout-delay\r\na=sendrecv\r\na=rtcp-mux\r\na=rtcp-rsize\r\na=rtpmap:100 VP8\/90000\r\na=rtcp-fb:100 ccm fir\r\na=rtcp-fb:100 nack\r\na=rtcp-fb:100 nack pli\r\na=rtcp-fb:100 goog-remb\r\na=rtcp-fb:100 transport-cc\r\na=rtpmap:101 VP9\/90000\r\na=rtcp-fb:101 ccm fir\r\na=rtcp-fb:101 nack\r\na=rtcp-fb:101 nack pli\r\na=rtcp-fb:101 goog-remb\r\na=rtcp-fb:101 transport-cc\r\na=rtpmap:107 H264\/90000\r\na=rtcp-fb:107 ccm fir\r\na=rtcp-fb:107 nack\r\na=rtcp-fb:107 nack pli\r\na=rtcp-fb:107 goog-remb\r\na=rtcp-fb:107 transport-cc\r\na=fmtp:107 level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=42e01f\r\na=rtpmap:116 red\/90000\r\na=rtpmap:117 ulpfec\/90000\r\na=rtpmap:96 rtx\/90000\r\na=fmtp:96 apt=100\r\na=rtpmap:97 rtx\/90000\r\na=fmtp:97 apt=101\r\na=rtpmap:99 rtx\/90000\r\na=fmtp:99 apt=107\r\na=rtpmap:98 rtx\/90000\r\na=fmtp:98 apt=116\r\na=ssrc-group:FID 2274909477 994010029\r\na=ssrc:2274909477 cname:zeDEX4lYdufTvtIw\r\na=ssrc:2274909477 msid:cbgOva9tqJ0MoAu6oWGbPKlFuAWDSUsZy1Fw 8f4b6709-7b0d-4cd6-8635-ff3c25524fb2\r\na=ssrc:2274909477 mslabel:cbgOva9tqJ0MoAu6oWGbPKlFuAWDSUsZy1Fw\r\na=ssrc:2274909477 label:8f4b6709-7b0d-4cd6-8635-ff3c25524fb2\r\na=ssrc:994010029 cname:zeDEX4lYdufTvtIw\r\na=ssrc:994010029 msid:cbgOva9tqJ0MoAu6oWGbPKlFuAWDSUsZy1Fw 8f4b6709-7b0d-4cd6-8635-ff3c25524fb2\r\na=ssrc:994010029 mslabel:cbgOva9tqJ0MoAu6oWGbPKlFuAWDSUsZy1Fw\r\na=ssrc:994010029 label:8f4b6709-7b0d-4cd6-8635-ff3c25524fb2\r\n","type":"answer"},"type":"media"},"type":"ANSWER"}
                    console.log('ANSWER', pc.localDescription);
                    var str = JSON.stringify({
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
                    });
                    signalingChannel.send(str);
                }).catch(logError);
                break;
            case 'ANSWER':
                pc.setRemoteDescription(message.payload.sdp).catch(logError);
                break;
            case 'CANDIDATE':
                console.log('candidate', message.candidate);
                pc.addIceCandidate(message.candidate);
                break;
            default:
                console.warn('You received a malformed message from ' + peer + ' of type ' + type);
                break;
        }
    }
};

function logError(error) {
    console.log(error.name + ': ' + error.message);
}