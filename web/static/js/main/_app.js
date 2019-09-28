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
        // ready flag
        this.ready = false;
        // workers
        this.workers = [];
        // user config
        this.userConfig = {};
        // current encounter
        this.encounter = null;
        // combatant collector
        this.combatantCollector = new CombatantCollector();        
        // action collector
        this.actionCollector = new ActionCollector(this.combatantCollector);
        // current view mode
        this.currentView = "";
        // loading message element
        this.loadingMessageElement = document.getElementById("loading-message");
        // loading progress element
        this.loadingProgressElement = document.getElementById("loading-progress");
        // error overlay element
        this.errorOverlayElement = document.getElementById("error-overlay");
        // error overlay message elment
        this.errorOverlayMessageElement = document.getElementById("error-overlay-message");
        // ping refresh timeout
        this.pingRefreshTimeout = null;
    }

    /**
     * Initalize views.
     */
    initViews()
    {
        // load views, statically for now, eventually views should be 
        // loaded dynamically and user should be able to load their own views in
        this.views = [
            new ViewOverview(this.combatantCollector, this.actionCollector),
            new ViewCombatantTable(this.combatantCollector, this.actionCollector),
            new ViewCombatantGraph(this.combatantCollector, this.actionCollector),
            new ViewCombatantStream(this.combatantCollector, this.actionCollector),
            new ViewTimeline(this.combatantCollector, this.actionCollector),
            new ViewLogs(this.combatantCollector, this.actionCollector),
            new ViewTriggers(this.combatantCollector, this.actionCollector),
        ];
        // create mutation observer
        var t = this;
        var observer = new MutationObserver(function(mutations) {
            fflpFixFooter();
            for (var i in t.views) {
                t.views[i].onResize();
            }
        });
        // init all views
        for (var i in this.views) {
            this.views[i].init();
            sideMenuAddView(this.views[i]);
            observer.observe(
                this.views[i].getElement(),
                {
                    attributes: true
                }
            );
        }


        // set view on hash change
        this.setView(window.location.hash);
        window.addEventListener("hashchange", function(e) {
            t.setView(window.location.hash);
        });
    }

    /**
     * Set view mode.
     * @param {string} viewName 
     */
    setView(viewName)
    {
        // do nothing if same view
        if (viewName == this.currentView && viewName) {
            return;
        }
        // no views loaded, do nothing
        if (this.views.length == 0) {
            return;
        }
        // view name not set, use first available view
        if (!viewName) {
            viewName = this.views[0].getName();
        }
        // strip "#" off of view
        if (viewName[0] == "#") {
            viewName = viewName.substr(1);
        }
        // add a global class name
        document.getElementById("head").style.display = "";
        var bodyElement = document.getElementsByTagName("html")[0];
        bodyElement.classList.remove("view-" + this.currentView);
        // make old view inactive
        if (this.currentView) {
            for (var i in this.views) {
                if (this.views[i].getName() == this.currentView) {
                    this.views[i].onInactive();
                    break;
                }
            }            
        }
        // set view
        this.currentView = viewName
        bodyElement.classList.add("view-" + this.currentView);
        // make view button active and set view active
        for (var i in this.views) {
            if (this.views[i].getName() == this.currentView) {
                sideMenuSetActiveView(this.views[i]);
                this.views[i].onActive();
            }
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
        var onReadyTimeout = null;
        for (var i = 0; i < WORKER_COUNT; i++) {
            var worker = new Worker("/worker.min.js?v=" + VERSION);
            worker.onmessage = function(e) {
                switch (e.data.type)
                {
                    case "status_in_progress":
                    {
                        // update status message
                        t.loadingProgressElement.style.width = e.data.value + "%";
                        t.loadingProgressElement.innerText = e.data.message;
                        t.loadingProgressElement.classList.remove("hide");
                        clearTimeout(onReadyTimeout);
                        break;
                    }
                    case "status_ready":
                    {
                        t.loadingProgressElement.style.width = "0";
                        t.loadingProgressElement.classList.add("hide");
                        t.loadingMessageElement.classList.add("hide");
                        clearTimeout(onReadyTimeout);
                        if (!t.ready) {
                            onReadyTimeout = setTimeout(
                                function() {
                                    if (t.ready) {
                                        return;
                                    }
                                    t.ready = true;
                                    console.log(">> Ready.");
                                    for (var i in t.views) {
                                        t.views[i].onReady();
                                    }
                                },
                                1000
                            );
                        }
                        break;
                    }
                    case "error":
                    {
                        t.errorOverlayElement.classList.remove("hide");
                        clearTimeout(onReadyTimeout);
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
            t.initViews();
            fetchActionData();
            fetchStatusData();
            // display encounter data
            var encounterDisplay = new EncounterDisplay();
            encounterDisplay.init();
            // log connection
            console.log(">> Connected to server.");
            t.loadingMessageElement.innerText = "Connected. Waiting for encounter data...";
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
            t.errorOverlayElement.classList.remove("hide");
            t.errorOverlayMessageElement.innerHTML = "Connection lost.";
            console.log(">> Connection closed,", event);
            t.pingRefreshTimeout = setTimeout(function() { t._pingRefresh(); }, 5000);
        };
        socket.onerror = function(event) {
            t.errorOverlayElement.classList.remove("hide");
            t.errorOverlayMessageElement.innerHTML = "An error has occured.";
            console.log(">> An error has occured,", event);
        };    
        // log incoming data
        window.addEventListener("act:encounter", function(e) {
            if (!t.encounter || e.detail.UID != t.encounter.data.UID) {
                console.log(">> Encounter active, ", e.detail);
                t.combatantCollector.reset();
                t.actionCollector.reset();
                t.encounter = new Encounter();
                t.encounter.update(e.detail);
                // forward encounter to all views
                for (var i in t.views) {
                    t.views[i].onEncounter(t.encounter);
                }
                return;
            }
            t.encounter.update(e.detail);
            if (t.encounter && !e.detail.Active) {
                console.log(">> Encounter inactive, ", e.detail);
                for (var i in t.views) {
                    t.views[i].onEncounterInactive(t.encounter);
                } 
            }
        });
        
        // add/update combatant
        window.addEventListener("act:combatant", function(e) {
            var combatant = t.combatantCollector.update(e.detail);
            if (combatant) {
                window.dispatchEvent(
                    new CustomEvent("app:combatant", {"detail" : combatant})
                );
                // forward combatant to all views
                for (var i in t.views) {
                    t.views[i].onCombatant(combatant);
                }
            }
        });
        // add action
        window.addEventListener("act:logLine", function(e) {
            // create action if log line is valid action
            var action = t.actionCollector.add(event.detail);
            if (action) {
                window.dispatchEvent(
                    new CustomEvent("app:action", {"detail" : action})
                );
            }
            // forward action and log line event to all views
            for (var i in t.views) {
                t.views[i].onLogLine(e.detail);
                if (action) {
                    t.views[i].onAction(action);
                }
            }
        });
        // action data has been downloaded
        window.addEventListener("app:action-data", function(e) {
            // forward action data to all views
            for (var i in t.views) {
                t.views[i].actionData = e.detail;
            }
        });
        // status data has been downloaded
        window.addEventListener("app:status-data", function(e) {
            // forward status data to all views
            for (var i in t.views) {
                t.views[i].statusData = e.detail;
            }
        });
        // flags
        window.addEventListener("onFlag", function(e) {
            console.log(">> Received flag, ", e.detail);
            switch (e.detail.Name)
            {
                case "active":
                {
                    t.loadingMessageElement.classList.add("hide");
                    if (!e.detail.Value) {
                        t.loadingMessageElement.classList.remove("hide");
                        t.loadingMessageElement.innerHTML = "Waiting for connection from ACT...<br/></br><sub>(Please make sure you are using the correct version of the ACT Plugin.)</sub>";
                    }
                    break;
                }
            }
        });
        // resize event
        window.addEventListener("resize", function(e) {
            for (var i in t.views) {
                t.views[i].onResize();
            }            
        });
        window.addEventListener("onbeforeunload", function(e) {
            clearTimeout(t.pingRefreshTimeout)
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

    /**
     * Ping server until connection is made. Once connection is made
     * refresh the current page.
     */
    _pingRefresh()
    {
        console.log(">> Check connection.");
        clearTimeout(this.pingRefreshTimeout);
        var request = new XMLHttpRequest();
        request.open("GET", "/ping", true);
        request.send();
        request.addEventListener("load", function(e) {
            window.location.reload();
        });
        var t = this;
        request.addEventListener("error", function(e) {
            t.pingRefreshTimeout = setTimeout(function() {
                t._pingRefresh();
            }, 5000);
        });
        request.addEventListener("abort", function(e) {
            t.pingRefreshTimeout = setTimeout(function() {
                t._pingRefresh();
            }, 5000);
        });
    }

}