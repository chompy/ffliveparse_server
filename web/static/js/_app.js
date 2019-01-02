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
        // list widgets
        this.widgets = {};
        // connection flag
        this.connected = false;
        // user config
        this.userConfig = {};
    }

    /**
     * Initalize widgets.
     */
    initWidgets()
    {
        var availableWidgets = [
            new WidgetEncounter(),
            new WidgetCombatants(),
        ];
        // don't load timeline for 'stream' mode
        if (window.location.hash != "#stream") {
            availableWidgets.push(new WidgetTimelime());
        }
        for (var i = 0; i < availableWidgets.length; i++) {
            this.widgets[availableWidgets[i].getName()] = availableWidgets[i];
            availableWidgets[i].init();
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
     * Connect to websocket server.
     */
    connect()
    {
        var socketUrl = (window.location.protocol == "https:" ? "wss" : "ws") + "://" + window.location.host + "/ws/" + this.webId;
        if (this.encounterUid) {
            socketUrl += "/" + this.encounterUid;
        }
        var socket = new WebSocket(socketUrl);
        var t = this;
        // net decoder messageRead event
        window.addEventListener("messageRead", parseNextMessage);
        // socket open event
        socket.onopen = function(event) {
            document.getElementById("loadingMessage").innerText = "Waiting for Encounter data...";
            console.log(">> Connected to server.");
            t.connected = true;
            t.initUserConfig();
            t.initWidgets();
            fetchActionData();            
        };
        // socket message event
        socket.onmessage = function(event) {
            if (socket.readyState !== 1) {
                return;
            }
            var fileReader = new FileReader();
            fileReader.onload = function(event) {
                var buffer = new Uint8Array(event.target.result);
                try {
                    parseMessage(buffer);
                } catch (e) {
                    console.log(">> Error parsing message,", buf2hex(buffer));
                    throw e
                }
            };
            fileReader.readAsArrayBuffer(event.data);
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
        var currentCombatants = [];
        window.addEventListener("act:encounter", function(e) {
            if (e.detail.ID != lastEncounterUid) {
                console.log(">> Receieved new encounter, ", e.detail);
                lastEncounterUid = e.detail.UID;
                currentCombatants = [];
            }
        });
        window.addEventListener("act:combatant", function(e) {
            if (currentCombatants.indexOf(e.detail.Name) == -1) {
                console.log(">> Receieved new combatant, ", e.detail);
                currentCombatants.push(e.detail.Name);
            }
        });
        // flags
        window.addEventListener("onFlag", function(e) {
            console.log(">> Received flag, ", e.detail);
            // TODO online status set
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