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
        // worker
        this.worker = null;
        // user config
        this.userConfig = {};
        // list of combatants
        this.combatants = [];
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
        var worker = new Worker("/worker.min.js")
        worker.postMessage({
            url: socketUrl,
            encounterUid: this.encounterUid
        });
        worker.onmessage = function(e) {

            switch (e.data.type)
            {
                case "status_in_progress":
                {
                    // update status message
                    document.getElementById("loadingMessage").classList.remove("hide");
                    document.getElementById("loadingMessage").innerText = e.data.message;
                    // handle initial connection
                    if (!t.connected) {
                        t.connected = true;
                        t.initUserConfig();
                        t.initWidgets();
                        fetchActionData();            
                        fetchStatusData();                        
                    }
                    break;
                }
                case "status_ready":
                {
                    document.getElementById("loadingMessage").classList.add("hide");
                    break;
                }
                case "error":
                {
                    document.getElementById("errorOverlay").classList.remove("hide");
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
        
        // log incoming data
        var lastEncounterUid = null;
        window.addEventListener("act:encounter", function(e) {
            if (e.detail.ID != lastEncounterUid) {
                console.log(">> Receieved new encounter, ", e.detail);
                lastEncounterUid = e.detail.UID;
                t.combatants = [];
            }
        });
        window.addEventListener("act:combatant", function(e) {
            // update combatant list
            var combatant = null;
            for (var i in t.combatants) {
                if (t.combatants[i].compare(e.detail)) {
                    t.combatants[i].update(e.detail);
                    combatant = t.combatants[i]
                    break;
                }
            }
            // add new combatant
            if (!combatant) {
                console.log(">> Receieved new combatant, ", e.detail);
                combatant = new Combatant();
                combatant.update(e.detail);
                t.combatants.push(combatant);
            }
            // push event with combatant
            window.dispatchEvent(
                new CustomEvent("app:combatant", {"detail" : combatant})
            );
        });
        // flags
        window.addEventListener("onFlag", function(e) {
            console.log(">> Received flag, ", e.detail);
            switch (e.detail.Name)
            {
                case "active":
                {
                    var element = document.getElementById("loadingMessage");
                    element.classList.add("hide");
                    if (!e.detail.Value) {
                        document.getElementById("loadingMessage").classList.remove("hide");
                        document.getElementById("loadingMessage").innerHTML = "Waiting for connection from ACT...<br/></br><sub>(Please make sure you are using the correct version of the ACT Plugin.)</sub>";
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