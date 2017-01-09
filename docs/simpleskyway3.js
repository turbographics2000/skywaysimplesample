window.RTCPeerConnection = window.RTCPeerConnection || window.webkitRTCPeerConnection;
let apiKey = '21b4b0a5-f810-4b30-ac5e-a98b24a1be87';
let token = Math.random().toString(36).substr(2);
let pcs = {},
    pc, socket, dstId, o2j = JSON.stringify,
    j2o = JSON.parse;
btnStart.onclick = _ => start(dstId = callTo.value);
btnScreenShare.onclick = _ => chrome.runtime.sendMessage(extId, ["screen", "window", "tab"], srcId => {
    navigator.mediaDevices.getUserMedia({
        video: {
            mandatory: {
                chromeMediaSource: 'desktop',
                chromeMediaSourceId: srcId
            }
        }
    }).then(stream => {
        selfTypes[stream.id] = 'screen';
        selfScreen.srcObject = stream;
        pc.addTrack ? stream.getTracks().map(trk => pc.addTrack(trk, stream)) : pc.addStream(stream);
    });
});

fetch(`https://skyway.io/${apiKey}/id?ts=${Date.now()}${Math.random()}`)
    .then(res => res.text()).then(myId => {
        myIdDisp.textContent = myId;

        socket = new WebSocket(`wss://skyway.io/peerjs?key=${apiKey}&id=${myId}&token=${token}`);
        socket.onmessage = evt => {
            const msg = j2o(evt.data);
            if (!['OPEN', 'PING'].includes(msg.type) && apiKey && !pc) start(dstId = msg.src);
            msg.ans && pc.setRemoteDescription(new RTCSessionDescription(msg.ans));
            msg.ofr && pc.setRemoteDescription(new RTCSessionDescription(msg.ofr))
                .then(_ => pc.createAnswer())
                .then(answer => pc.setLocalDescription(answer))
                .then(_ => socket.send(o2j({ type: 'ANSWER', ans: pc.localDescription, dst: msg.src })))
                .catch(e => console.log('set remote offer error', e));
            msg.cnd && pc.addIceCandidate(new RTCIceCandidate(msg.cnd));
            msg.type === 'PING' && socket.send(o2j({ type: 'PONG' }));
        };
        socket.onclose = evt => console.log(`socket close: code=${evt.code}`);
    });

function start() {
    pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.skyway.io:3478' }] });
    pc.onicecandidate = evt => socket.send(o2j({ type: 'CANDIDATE', cnd: evt.candidate, dst: dstId }));
    pc.onnegotiationneeded = evt => {
        pc.createOffer()
            .then(offer => pc.setLocalDescription(offer))
            .then(_ => socket.send(o2j({ type: 'OFFER', ofr: pc.localDescription, dst: dstId })))
            .catch(e => console.log('create offer error', e));
    }
    navigator.mediaDevices.getUserMedia({ video: true }).then(stream => {
        selfView.srcObject = stream;
        pc.addTrack ? stream.getTracks().map(trk => pc.addTrack(trk, stream)) : pc.addStream(stream);
    }).catch(e => console.log(`${e.name}: ${e.message}`));
    pc.onaddstream = evt => remoteView.srcObject = evt.stream;
}