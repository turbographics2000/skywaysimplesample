var token = Math.random().toString(36).substr(2);
var myUserId = (new MediaStream()).id;
var apiKey = '894abaae-ca60-4915-8107-d68c98c0aef1';
var configuration = {
    iceServers: [{
        urls: 'stun:stun.skyway.io:3478'
    }]
};
var pc = null;

var signalingChannel = new WebSocket(`wss://skyway.io/peerjs?key=${apiKey}&id=${myUserId}&token=${token}`);

// get a local stream, show it in a self-view and add it to be sent
navigator.mediaDevices.getUserMedia({ video: true })
    .then(stream => {
        myVideo.srcObject = stream;
        myId.textContent = myUserId;
        step1Container.style.display = step3Container.style.display = 'none';
        step2Container.style.display = 'block';
    })
    .catch(logError);


makeCall.onclick = evt => {
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

signalingChannel.onmessage = evt => {
    if (!pc)
        start();

    var message = JSON.parse(evt.data);
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
    log(error.name + ': ' + error.message);
}