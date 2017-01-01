var localStream = null;
var existingCall = null;

// PeerJS object
var peer = new Peer({
    key: '894abaae-ca60-4915-8107-d68c98c0aef1',
    debug: 3
});
peer.on('open', _ => {
    myId.textContent = peer.id;
    navigator.mediaDevices.getUserMedia({
        video: true
    }).then(stream => {
        // Set your video displays
        myVideo.srcObject = stream;
        localStream = stream;
        step2();
    }).catch(_ => {
        step1Error.style.display = '';
    });
});

// Receiving a call
peer.on('call', call => {
    // Answer the call automatically (instead of prompting user) for demo purposes
    call.answer(localStream);
    step3(call);
});
peer.on('error', err => {
    alert(err.message);
    // Return to step 2 if error occurs
    step2();
});

// Click handlers setup
makeCall.onclick = _ => {
    // Initiate a call!
    var call = peer.call(callToId.value, window.localStream);
    step3(call);
};
endCall.onclick = function() {
    window.existingCall.close();
    step2();
};
// Retry if getUserMedia fails
step1Retry.onclick = function() {
    step1Error.style.display = 'none';
    step1();
};

function step2() {
    step1Container.style.display = step3Container.style.display = 'none';
    step2Container.style.display = 'block';
}

function step3(call) {
    // Hang up on an existing call if present
    if (existingCall) {
        existingCall.close();
    }
    // Wait for stream on the call, then set peer video display
    call.on('stream', stream => {
        theirVideo.srcObject = stream;
    });
    // UI stuff
    existingCall = call;
    theirId.textContent = call.peer;
    call.on('close', step2);
    step1Container.style.display = step2Container.style.display = 'none';
    step3Container.style.display = 'block';
}