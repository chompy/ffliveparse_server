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

    constructor(webId, encounterId)
    {
        // user web id
        this.webId = webId;
        // encounter id, when provided ignore all data not
        // related to encounter
        this.encounterId = encounterId;
        // list of available widgets
        this.availableWidgets = {};
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
        // list available widgets
        this.availableWidgets = {
            "encounter"         : new WidgetEncounter(),
            "parse"             : new WidgetParse(),
            "triggers"          : new WidgetTrigger(),
            "cactbot-triggers"  : new WidgetCactbotTriggers(),
            "skilltimer"        : new WidgetSkilltimer()
        };
        // start installed widgets
        for (var i in this.userConfig["_app"]["installedWidgets"]) {
            this.availableWidgets[this.userConfig["_app"]["installedWidgets"][i]].add();
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
     * Add config button to top right of page.
     */
    initConfigButton()
    {
        var headerElement = document.getElementById("header");
        var rightElement = headerElement.getElementsByClassName("rightSide")[0];
        var configButton = document.createElement("img");
        configButton.classList.add("configBtn", "hide");
        configButton.title = "Config"
        configButton.alt = "Config";
        configButton.src = "/static/img/opt_config_white_16x16.png";
        rightElement.appendChild(configButton);
        var t = this;
        configButton.addEventListener("click", function(e) {
            t.showConfig();
        });
        configButton.addEventListener("load", function(e) {
            configButton.classList.remove("hide");
        });
    }

    /**
     * Connect to websocket server.
     */
    connect()
    {
        var socketUrl = (window.location.protocol == "https:" ? "wss" : "ws") + "://" + window.location.host + "/ws/" + this.webId;
        if (this.encounterId) {
            socketUrl += "/" + this.encounterId;
        }
        var socket = new WebSocket(socketUrl);
        var t = this;
        socket.onopen = function(event) {
            document.getElementById("loadingMessage").remove();
            console.log(">> Connected to server.");
            t.connected = true;
            t.setConfigFromPresetUrl();
            t.initUserConfig();
            t.initWidgets();
            t.initConfigButton();
        };
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
        var lastEncounterId = null;
        var currentCombatants = [];
        window.addEventListener("act:encounter", function(e) {
            if (e.detail.ID != lastEncounterId) {
                console.log(">> Receieved new encounter, ", e.detail);
                lastEncounterId = e.detail.ID;
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
            if (e.detail.Name == "active") {
                var onlineStatusElement = document.getElementsByClassName("onlineStatus")[0];
                onlineStatusElement.innerText = e.detail.Value ? "Online" : "Offline";
                onlineStatusElement.classList.remove("online");
                onlineStatusElement.title = "ACT was not detected.";
                if (e.detail.Value) {
                    onlineStatusElement.classList.add("online");
                    onlineStatusElement.title = "ACT detected.";
                }
            }
        });
    }    

    /**
     * Open main application configuration modal.
     */
    showConfig()
    {
        Modal.reset();
        Modal.open();

        // widget config
        Modal.addSection("Widgets");
        var widgetConfigElement = document.createElement("div");
        
        // build widget select options
        var buildWidgetSelect = function(name, label, widgetList) {

            // create main widget select element
            var widgetElement = document.createElement("div");
            widgetElement.classList.add("widgetSelect", "widgetSelect-" + name);
            // create label
            var widgetLabel = document.createElement("label");
            widgetLabel.appendChild(
                document.createTextNode(label)
            );
            widgetLabel.setAttribute("for", "widgetSelect-" + name);
            // create select field
            var widgetSelectElement = document.createElement("select");
            widgetSelectElement.id = "widgetSelect-" + name;
            widgetSelectElement.size = 10;
            for (var i in widgetList) {
                var widgetOptionElement = document.createElement("option");
                widgetOptionElement.value = widgetList[i].getName();
                widgetOptionElement.innerText = widgetList[i].getTitle();
                widgetSelectElement.appendChild(widgetOptionElement);
            }
            widgetElement.appendChild(widgetLabel);
            widgetElement.appendChild(widgetSelectElement);
            return widgetElement;
        };

        // build list of installed and not installed widgets
        var installedWidgets = [];
        var notInstalledWidgets = [];
        for (var i in this.userConfig["_app"]["installedWidgets"]) {
            installedWidgets.push(this.availableWidgets[this.userConfig["_app"]["installedWidgets"][i]]);
        }
        for (var key in this.availableWidgets) {
            if (this.userConfig["_app"]["installedWidgets"].indexOf(key) == -1) {
                notInstalledWidgets.push(this.availableWidgets[key]);
            }
        }

        var notInstalledWidgetElement = buildWidgetSelect(
            "available",
            "Available",
            notInstalledWidgets
        );
        var installedWidgetElement = buildWidgetSelect(
            "installed",
            "Installed",
            installedWidgets
        );

        var widgetInstallerElement = document.createElement("div");
        widgetInstallerElement.classList.add("widgetInstallOptions");

        var widgetInstallButton = document.createElement("input");
        widgetInstallButton.type = "button"
        widgetInstallButton.value = "▼";
        widgetInstallButton.title = "Add Widget";
        widgetInstallerElement.appendChild(widgetInstallButton);

        var widgetUninstallButton = document.createElement("input");
        widgetUninstallButton.type = "button"
        widgetUninstallButton.value = "▲";
        widgetUninstallButton.title = "Remove Widget";
        widgetInstallerElement.appendChild(widgetUninstallButton);

        Modal.getModalBodyElement().appendChild(notInstalledWidgetElement);
        Modal.getModalBodyElement().appendChild(widgetInstallerElement);
        Modal.getModalBodyElement().appendChild(installedWidgetElement);

        var clearElement = document.createElement("div");
        clearElement.classList.add("clear");
        Modal.getModalBodyElement().appendChild(clearElement);

        // event listeners
        var t = this;
        // install widget
        widgetInstallButton.addEventListener("click", function(e) {
            var index = notInstalledWidgetElement.getElementsByTagName("select")[0].selectedIndex;
            if (index == -1) {
                return;
            }
            var widgetName = notInstalledWidgetElement.getElementsByTagName("select")[0].childNodes[index].value;
            for (var key in t.availableWidgets) {
                if (t.availableWidgets[key].getName() == widgetName) {
                    t.userConfig["_app"]["installedWidgets"].push(key);
                    t.availableWidgets[key].add();
                }
            }
            t._saveUserConfig();
            t.showConfig();
        });
        // remove widget
        widgetUninstallButton.addEventListener("click", function(e) {
            var index = installedWidgetElement.getElementsByTagName("select")[0].selectedIndex;
            if (index == -1) {
                return;
            }
            var widgetName = installedWidgetElement.getElementsByTagName("select")[0].childNodes[index].value;
            for (var key in t.availableWidgets) {
                if (t.availableWidgets[key].getName() == widgetName) {
                    var index = t.userConfig["_app"]["installedWidgets"].indexOf(key);
                    if (index >= 0) {
                        t.userConfig["_app"]["installedWidgets"].splice(index, 1);
                    }
                    t.availableWidgets[key].remove();
                }
            }
            t._saveUserConfig();
            t.showConfig();
        });

        // debug status
        Modal.addSection("Stats / Debug");btoa
        Modal.addText("Data Recieved: " + (totalBytesRecieved / 1024).toFixed(4) + "KB.");

    }

    /**
     * Parse URL query string
     * @param string url 
     * @return object
     */
    parseUrlQueryString(url)
    {
        var queryString = url.split("?");
        if (queryString.length < 2) {
            return {};
        }
        queryString = queryString[1].split("&");
        var params = {};
        for (var i in queryString) {
            var queryParamParts = queryString[i].split("=");
            if (queryParamParts.length < 2) {
                continue;
            }
            params[queryParamParts[0]] = queryParamParts[1];
        }
        return params;
    }

    /**
     * Set default configurations from preset key in url.
     * @return object
     */
    setConfigFromPresetUrl()
    {
        if (typeof(window.location.href) == "undefined") {
            return;
        }
        var queryParams = this.parseUrlQueryString(window.location.href);
        if (!("p" in queryParams)) {
            return;
        }
        
        this._loadUserConfig();
        if (!("_app" in this.userConfig)) {
            this.userConfig["_app"] = {};
        }

        // hard code presets for now
        switch(queryParams["p"])
        {
            case "stream":
            case "stream_overylay":
            case "obs":
            {
                this.userConfig["_app"]["installedWidgets"] = ["encounter", "parse"];
                document.getElementById("header").style.display = "none";
                document.getElementById("footer").style.display = "none";
                document.getElementsByTagName("html")[0].style.backgroundColor = "transparent";
                document.getElementsByTagName("body")[0].style.backgroundColor = "transparent";
                break;
           }

           case "callouts":
           case "triggers":
           case "cactbot":
           {
                this.userConfig["_app"]["installedWidgets"] = ["encounter", "parse", "cactbot-triggers", "triggers"];
                if (!("cactbot-triggers" in this.userConfig)) {
                    this.userConfig["cactbot-triggers"] = {};
                }
                this.userConfig["cactbot-triggers"]["tts"] = true;
                this.userConfig["cactbot-triggers"]["beep"] = true;
                if (!("characterName" in this.userConfig["cactbot-triggers"])) {
                    this.userConfig["cactbot-triggers"]["characterName"] = prompt("Enter your character name for callouts.");
                }
                break;
           }

        }
        
        this._saveUserConfig();

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