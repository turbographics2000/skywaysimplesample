/**
 * An abstraction on top of WebSockets and XHR streaming to provide fastest
 * possible connection for peers.
 */
function Socket(secure, host, port, path, key) {
    if (!(this instanceof Socket)) return new Socket(secure, host, port, path, key);


    this.eventListeners = {};
    this.on = function(eventName, listener) {
        this.eventListeners[eventName] = this.eventListeners[eventName] || [];
        if (!this.eventListeners[eventName].includes(listener)) {
            this.eventListeners[eventName].push(listener.bind(this));
        }
    }
    this.emit = function(eventName, eventArg) {
        var listeners = this.eventListeners[eventName];
        if (!listeners.length) return;
        for (var i = 0, l = listeners.length; i < l; i++) {
            listeners[i](eventArg);
        }
    };
    this.logList = [];
    this.log = function(level = 'log', log, data) {
        logList.push({
            level: level,
            dt: Date.now(),
            log: log,
            data: data
        });
    };
    this.error = function(errMessage, data) {
        this.log('ERROR', errorMessage);
    }

    // Disconnected manually.
    this.disconnected = false;
    this._queue = [];

    var httpProtocol = secure ? 'https://' : 'http://';
    var wsProtocol = secure ? 'wss://' : 'ws://';
    this._httpUrl = httpProtocol + host + ':' + port + path + key;
    this._wsUrl = wsProtocol + host + ':' + port + path + 'peerjs?key=' + key;
}


/** Check in with ID or get one from server. */
Socket.prototype.start = function(id, token) {
    this.id = id;

    this._httpUrl += '/' + id + '/' + token;
    this._wsUrl += '&id=' + id + '&token=' + token;

    this._startXhrStream();
    this._startWebSocket();
}


/** Start up websocket communications. */
Socket.prototype._startWebSocket = function(id) {
    var self = this;

    if (this._socket) {
        return;
    }

    this._socket = new WebSocket(this._wsUrl);

    this._socket.onmessage = function(event) {
        try {
            var data = JSON.parse(event.data);
        } catch (e) {
            this.log('Invalid server message', event.data);
            return;
        }
        addLog({ action: 'SOCKET RECEIVE', type: 'ws', url: this._wsUrl, data: data });
        self.emit('message', data);
    };

    this._socket.onclose = function(event) {
        addLog({ action: 'SOCKET CLOSE', type: 'ws', url: this._wsUrl, msg: event.message });
        self.log('Socket closed.');
        self.disconnected = true;
        self.emit('disconnected');
    };

    // Take care of the queue of connections if necessary and make sure Peer knows
    // socket is open.
    this._socket.onopen = function() {
        addLog({ action: 'SOCKET OPEN', type: 'ws', url: this._wsUrl });
        if (self._timeout) {
            clearTimeout(self._timeout);
            setTimeout(function() {
                self._http.abort();
                self._http = null;
            }, 5000);
        }
        self._sendQueuedMessages();
        self.log('Socket open');
    };
}

/** Start XHR streaming. */
Socket.prototype._startXhrStream = function(n) {
    try {
        var self = this;
        this._http = new XMLHttpRequest();
        this._http._index = 1;
        this._http._streamIndex = n || 0;
        this._httpUrl2 = this._httpUrl + '/id?i=' + this._http._streamIndex;
        this._http.open('post', xhrURL, true);
        this._http.onerror = function(err) {
            addLog({ action: 'SOCKET ERROR', type: 'xhr', method: 'POST', url: this._httpUrl2, msg: err.message });
            // If we get an error, likely something went wrong.
            // Stop streaming.
            clearTimeout(self._timeout);
            this.emit('disconnected');
        }
        this._http.onreadystatechange = function() {
            if (this.readyState == 2 && this.old) {
                this.old.abort();
                delete this.old;
            } else if (this.readyState > 2 && this.status === 200 && this.responseText) {
                self._handleStream(this, 'POST', xhrURL);
            }
        };
        addLog({ action: 'SOCKET OPEN', type: 'xhr', method: 'POST', url: this._httpUrl2 });
        this._http.send(null);
        this._setHTTPTimeout();
    } catch (e) {
        this.log('XMLHttpRequest not available; defaulting to WebSockets');
    }
}


/** Handles onreadystatechange response as a stream. */
Socket.prototype._handleStream = function(http) {
    // 3 and 4 are loading/done state. All others are not relevant.
    var messages = http.responseText.split('\n');

    // Check to see if anything needs to be processed on buffer.
    if (http._buffer) {
        while (http._buffer.length > 0) {
            var index = http._buffer.shift();
            var bufferedMessage = messages[index];
            try {
                bufferedMessage = JSON.parse(bufferedMessage);
            } catch (e) {
                http._buffer.shift(index);
                break;
            }
            addLog({ action: 'SOCKET RECEIVE', type: 'xhr', method: 'POST', url: this._httpUrl2, data: bufferedMessage });
            this.emit('message', bufferedMessage);
        }
    }

    var message = messages[http._index];
    if (message) {
        http._index += 1;
        // Buffering--this message is incomplete and we'll get to it next time.
        // This checks if the httpResponse ended in a `\n`, in which case the last
        // element of messages should be the empty string.
        if (http._index === messages.length) {
            if (!http._buffer) {
                http._buffer = [];
            }
            http._buffer.push(http._index - 1);
        } else {
            try {
                message = JSON.parse(message);
            } catch (e) {
                this.log('Invalid server message', message);
                return;
            }
            addLog({ action: 'SOCKET RECEIVE', type: 'xhr', method: 'POST', url: this._httpUrl2, data: message });
            this.emit('message', message);
        }
    }
}

Socket.prototype._setHTTPTimeout = function() {
    var self = this;
    this._timeout = setTimeout(function() {
        addLog({ action: 'SOCKET TIMEOUT', type: 'xhr', method: 'POST', url: this._httpUrl2 });
        var old = self._http;
        if (!self._wsOpen()) {
            self._startXhrStream(old._streamIndex + 1);
            self._http.old = old;
        } else {
            old.abort();
        }
    }, 25000);
}

/** Is the websocket currently open? */
Socket.prototype._wsOpen = function() {
    return this._socket && this._socket.readyState == 1;
}

/** Send queued messages. */
Socket.prototype._sendQueuedMessages = function() {
    for (var i = 0, ii = this._queue.length; i < ii; i += 1) {
        this.send(this._queue[i]);
    }
}

/** Exposed send for DC & Peer. */
Socket.prototype.send = function(data) {
    data = JSON.parse(data);
    if (this.disconnected) {
        return;
    }

    // If we didn't get an ID yet, we can't yet send anything so we should queue
    // up these messages.
    if (!this.id) {
        this._queue.push(data);
        return;
    }

    if (!data.type) {
        addLog({ action: 'SOCKET ERROR', type: 'both', msg: 'Invalid message' });
        this.emit('error', 'Invalid message');
        return;
    }

    var message = JSON.stringify(data);
    if (this._wsOpen()) {
        addLog({ action: 'SOCKET SEND', type: 'ws', data: data });
        this._socket.send(message);
    } else {
        var http = new XMLHttpRequest();
        var url = this._httpUrl + '/' + data.type.toLowerCase();
        addLog({ action: 'SOCKET SEND', type: 'xhr', url: url, data: data });
        http.open('post', url, true);
        http.setRequestHeader('Content-Type', 'application/json');
        http.send(message);
    }
}

Socket.prototype.close = function() {
    if (!this.disconnected && this._wsOpen()) {
        this._socket.close();
        this.disconnected = true;
    }
}