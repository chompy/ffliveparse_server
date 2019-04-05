/*
This file is part of FFLiveParse.

FFLiveParse is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

FFLiveParse is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with FFLiveParse.  If not, see <https://www.gnu.org/licenses/>.
*/

/**
 * Number of workers to spawn.
 */
var WORKER_COUNT = 10;

/**
 * Main application class.
 */
class Application
{

    constructor(webId, encounterUid)
    {
        // user web id
        this.webId = webId;
        // encounter uid, when provided ignore all data not
        // related to encounter
        this.encounterUid = encounterUid;
        // views
        this.views = {};
        // connection flag
        this.connected = false;
        // workers
        this.workers = [];
        // user config
        this.userConfig = {};
        // combatant collector
        this.combatantCollector = new CombatantCollector();        
        // action collector
        this.actionCollector = new ActionCollector(this.combatantCollector);
        // current view mode
        this.currentView = "";
        // loading message element
        this.loadingMessageElement = document.getElementById("loading-message");
        // error overlay element
        this.errorOverlayElement = document.getElementById("error-overlay")
    }

    /**
     * Initalize widgets.
     */
    initWidgets()
    {
        var views = [];

        // set view on hash change
        /*var t = this;
        this.setView(window.location.hash);
        window.addEventListener("hashchange", function(e) {
            t.setView(window.location.hash);
        });
        // don't load timeline for 'stream' mode
        if (this.currentView != "stream") {
            availableWidgets.push(new WidgetTimelime());
        }
        if (this.currentView == "stream") {
            document.getElementById("head").style.display = "none";
        }
        for (var i = 0; i < availableWidgets.length; i++) {
            this.widgets[availableWidgets[i].getName()] = availableWidgets[i];
            availableWidgets[i].init();
        }*/
    }

    /**
     * Set view mode.
     * @param {string} view 
     */
    setView(view)
    {
        if (!view) {
            view = "timeline";
        }
        if (view[0] == "#") {
            view = view.substr(1);
        }
        document.getElementById("head").style.display = "";
        var bodyElement = document.getElementsByTagName("html")[0];
        bodyElement.classList.remove("mode-" + this.currentView);
        // unselect mode buttons
        var buttons = document.getElementsByClassName("btn-mode-" + this.currentView);
        for (var i = 0; i < buttons.length; i++) {
            buttons[i].classList.remove("active");
        }
        // set mode
        this.currentView = view
        // select mode buttons
        buttons = document.getElementsByClassName("btn-mode-" + this.currentView);
        for (var i = 0; i < buttons.length; i++) {
            buttons[i].classList.add("active");
        }
        bodyElement.classList.add("mode-" + this.currentView);
        if (typeof(this.widgets.parse) != "undefined") {
            this.widgets.parse.displayCombatants();
        }
    }

    /**
     * Init user config data.
     */
    initUserConfig()
    {
        // load widget config
        this._loadUserConfig();
        // set default app settings
        if (
            !this.userConfig || !("_app" in this.userConfig) || !("installedWidgets" in this.userConfig["_app"])
        ) {
            this.userConfig["_app"] = {
                "installedWidgets" : ["encounter", "parse"]
            };
            this._saveUserConfig();
        }        
    }

    /**
     * Start the app.
     */
    start()
    {
        var socketUrl = (window.location.protocol == "https:" ? "wss" : "ws") + "://" + window.location.host + "/ws/" + this.webId;
        if (this.encounterUid) {
            socketUrl += "/" + this.encounterUid;
        }
        var t = this;
        // create worker
        for (var i = 0; i < WORKER_COUNT; i++) {
            var worker = new Worker("/worker.min.js?v=" + VERSION);
            worker.onmessage = function(e) {
                switch (e.data.type)
                {
                    case "status_in_progress":
                    {
                        // update status message
                        document.getElementById("loading-message").classList.remove("hide");
                        document.getElementById("loading-message").innerText = e.data.message;
                        break;
                    }
                    case "status_ready":
                    {
                        document.getElementById("loading-message").classList.add("hide");
                        break;
                    }
                    case "error":
                    {
                        document.getElementById("error-overlay").classList.remove("hide");
                        break;
                    }
                    case "act:encounter": 
                    case "act:combatant": 
                    case "act:logLine":
                    case "act:combatAction":
                    {
                        var event = new CustomEvent(
                            e.data.type,
                            {
                                detail: e.data.data
                            }
                        );
                        window.dispatchEvent(event);
                        break;
                    }
                }
            };
            this.workers.push(worker);
        }
        // create socket
        var socket = new WebSocket(socketUrl);
        socket.onopen = function(e) {
            t.connected = true;
            t.initUserConfig();
            t.initWidgets();
            fetchActionData();
            fetchStatusData();
            console.log(">> Connected to server.");
            document.getElementById("loading-message").innerText = "Connected. Waiting for encounter data...";
        };
        var workerIndex = 0;    
        socket.onmessage = function(e) {
            if (socket.readyState !== 1) {
                return;
            }
            t.workers[workerIndex].postMessage({
                encounterUid: t.encounterUid,
                data: e.data
            });
            workerIndex++;
            if (workerIndex >= t.workers.length) {
                workerIndex = 0;
            }
        };
        socket.onclose = function(event) {
            document.getElementById("errorOverlay").classList.remove("hide");
            console.log(">> Connection closed,", event);
        };
        socket.onerror = function(event) {
            document.getElementById("errorOverlay").classList.remove("hide");
            console.log(">> An error has occured,", event);
        };    
        // log incoming data
        var lastEncounterUid = null;
        window.addEventListener("act:encounter", function(e) {
            if (e.detail.UID != lastEncounterUid) {
                console.log(">> Receieved new encounter, ", e.detail);
                lastEncounterUid = e.detail.UID;
                t.combatantCollector.reset();
                t.actionCollector.reset();
            }
        });
        // add/update combatant
        window.addEventListener("act:combatant", function(e) {
            var combatant = t.combatantCollector.update(e.detail);
            if (combatant) {
                window.dispatchEvent(
                    new CustomEvent("app:combatant", {"detail" : combatant})
                );
            }
        });
        // add action
        window.addEventListener("act:logLine", function(e) {
            var logLineData = parseLogLine(event.detail.LogLine);
            var action = t.actionCollector.add(logLineData);
            if (action) {
                window.dispatchEvent(
                    new CustomEvent("app:action", {"detail" : action})
                );
            }
        });
        // flags
        window.addEventListener("onFlag", function(e) {
            console.log(">> Received flag, ", e.detail);
            switch (e.detail.Name)
            {
                case "active":
                {
                    var element = document.getElementById("loading-message");
                    element.classList.add("hide");
                    if (!e.detail.Value) {
                        document.getElementById("loading-message").classList.remove("hide");
                        document.getElementById("loading-message").innerHTML = "Waiting for connection from ACT...<br/></br><sub>(Please make sure you are using the correct version of the ACT Plugin.)</sub>";
                    }
                    break;
                }
            }
        });
    }    

    /**
     * Load user config from local storage and
     * set userConfig var.
     */
    _loadUserConfig()
    {
        this.userConfig = JSON.parse(window.localStorage.getItem(USER_CONFIG_LOCAL_STORAGE_KEY));
        if (!this.userConfig) {
            this.userConfig = {};
        }
    }

    /**
     * Save userConfig var to local storage.
     */
    _saveUserConfig()
    {
        window.localStorage.setItem(
            USER_CONFIG_LOCAL_STORAGE_KEY,
            JSON.stringify(this.userConfig)
        );
    }


}