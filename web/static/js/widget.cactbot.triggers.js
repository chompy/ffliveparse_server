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

var CBT_LOCALE_NAME = "en";
var CBT_JOB_ROLE_LIST = {
    "dps-melee"     : [
        "MNK", "SAM", "NIN", "DRG"
    ],
    "dps-caster"    : [
        "BLM", "SMN", "RDM"
    ],
    "dps-ranged"    : [
        "BRD", "MCH"
    ],
    "tank"          : [
        "PLD", "DRK", "WAR"
    ],
    "healer"        : [
        "AST", "SCH", "WHM"
    ]
};

/**
 * Cactbot triggers widget
 */
class WidgetCactbotTriggers extends WidgetBase
{

    constructor()
    {
        super();
        this.currentZone = "";
        this.data = null;
        this.activeTriggers = [];
        this.delayTriggers = [];
        this.alertClearTimeout = null;
        this.playerData = null;
        if (!("characterName" in this.userConfig)) {
            this.userConfig["characterName"] = null;
            this._saveUserConfig();
        }
        if (!("tts" in this.userConfig)) {
            this.userConfig["tts"] = false;
            this._saveUserConfig();
        }
        if (!("beep" in this.userConfig)) {
            this.userConfig["beep"] = false;
            this._saveUserConfig();
        }
    }

    getName()
    {
        return "cactbot-triggers";
    }

    getTitle()
    {
        return "Cactbot Triggers";
    }

    getOptions()
    {
        var options = super.getOptions();
        var t = this;
        options.push(
            new WidgetOption(
                "Configuration",
                "/static/img/opt_config.png",
                function() { t.showOptionConfig(); }
            )
        )
        return options;
    }

    add()
    {
        super.add()
        var bodyElement = this.getBodyElement();
        if (!bodyElement) {
            return;
        }
        // add alert area
        var alertElement = document.createElement("div");
        alertElement.classList.add("cactbotAlert", "textCenter", "textBold");
        bodyElement.appendChild(alertElement);

        // fetch data
        this._fetchData();
        // hook events
        var t = this;
        this.addEventListener("act:logLine", function(e) { t._onLogLine(e); });
        this.addEventListener("act:combatant", function(e) { t._onCombatant(e); });
        this.addEventListener("act:encounter", function(e) { t._onEncounter(e); });
    }

    remove()
    {
        super.remove();
        this.currentZone = "";
        this.data = null;
        this.activeTriggers = [];
        this.delayTriggers = [];
        this.alertClearTimeout = null;
        this.playerData = null;
    }
    
    showOptionHelp()
    {
        var helpText ="";
        helpText += "--- Cactbot Trigger Widget ---\n";
        helpText += "Displays triggers from Cactbot raidboss ACT overlay.\n";
        helpText += "https://github.com/quisquous/cactbot";
        alert(helpText);
    }

    showOptionConfig()
    {
        Modal.reset();
        Modal.open();
        var t = this;
        Modal.addSection("General");
        Modal.addText("Enter your character name to recieve alerts and callouts specific to you.");
        Modal.addTextbox(
            "name",
            "Character Name",
            t.userConfig["characterName"],
            function(name, value) {
                t.userConfig["characterName"] = value.trim();
                t._saveUserConfig();
            }
        );
        Modal.addSection("Audio");
        Modal.addCheckbox(
            "tts",
            "Enable TTS Alerts",
            this.userConfig["tts"],
            function(name, checked) {
                t.userConfig["tts"] = checked;
                t._saveUserConfig();
            }
        );
        Modal.addCheckbox(
            "beep",
            "Enable Alert Beep",
            this.userConfig["beep"],
            function(name, checked) {
                t.userConfig["beep"] = checked;
                t._saveUserConfig();
            }
        );
    }

    /**
     * Process encounter data.
     * @param {Event} event 
     */
    _onEncounter(event)
    {
        if (!this.data) {
            return;
        }
        //event.detail.Zone = "Alphascape V2.0 (Savage)";
        if (this.currentZone != event.detail.Zone) {
            this.currentZone = event.detail.Zone;
            this.activeTriggers = [];
            this.delayTriggers = [];
            for (var key in this.data) {
                for (var i in this.data[key]) {
                    var triggerData = this.data[key][i];
                    if (
                        !("zoneRegex" in triggerData) ||
                        this.currentZone.match(triggerData.zoneRegex)
                    ) {
                        this.activeTriggers.push(triggerData);
                    }
                }
            }
            console.log(">> Cactbot triggers, new zone '" + this.currentZone + ".'");
        }
        /*var t = this;
        setTimeout(function() {
            t._onLogLine({"detail" : {"LogLine" : "15:40006EB8:Midgardsormr:31AD:"}});
        }, 2000)
        setTimeout(function() {
            t._onLogLine({"detail" : {"LogLine" : "15:40006EB8:Midgardsormr:31AE:"}});
        }, 4000)
        setTimeout(function() {
            t._onLogLine({"detail" : {"LogLine" : " 1B:........:Minda Silva:....:....:0017:0000:0000:0000:"}});
        }, 6000)*/
    }

    /**
     * Process combatant data.
     * @param {Event} event 
     */
    _onCombatant(event)
    {
        if (
            this.userConfig["characterName"] && 
            event.detail.Name.trim().toLowerCase() == this.userConfig["characterName"].trim().toLowerCase() &&
            (
                !this.playerData || this.playerData.me != event.detail.Name || this.playerData.job.toUpperCase() != event.detail.Job.toUpperCase()
            )
        ) {
            var myRole = null;
            for (var role in CBT_JOB_ROLE_LIST) {
                if (CBT_JOB_ROLE_LIST[role].indexOf(event.detail.Job.toUpperCase()) != -1) {
                    myRole = role;
                    break;
                }
            }
            this.playerData = {
                "me"        : event.detail.Name,
                "job"       : event.detail.Job.toUpperCase(),
                "role"      : myRole,
                "lang"      : CBT_LOCALE_NAME,
                "currentHP" : 1,
                "ShortName" : function(name) { return name; },
                ParseLocaleFloat: parseFloat,
                "StopCombat": function() { return null; },
            };
            console.log(">> Cactbot triggers, set player data,", this.playerData);
        }        
    }

    /**
     * Process log data.
     * @param {Event} event 
     */
    _onLogLine(event)
    {
        if (!this.activeTriggers) {
            return;
        }
        for (var i in this.activeTriggers) {
            for (var j in this.activeTriggers[i].triggers) {
                var trigger = this.activeTriggers[i].triggers[j];
                var matches = event.detail.LogLine.match(trigger.localRegex);
                if (matches) {
                    this._executeTrigger(trigger, matches);
                }
            }
        }
    }

    _fetchData()
    {
        if (this.data) {
            return;
        }
        var localName = CBT_LOCALE_NAME.toLowerCase();
        localName = CBT_LOCALE_NAME.substr(0, 1).toUpperCase() + CBT_LOCALE_NAME.substr(1).toUpperCase();
        var request = new XMLHttpRequest();
        request.open("GET", "/static/data/cactbot.triggers.json", true);
        request.send();
        var t = this;
        request.addEventListener("load", function(e) {
            console.log(">> Cactbot triggers, fetched data.");
            t.data = {};
            var data = JSON.parse(request.response);
            for (var key in data) {
                t.data[key] = eval(data[key]);
                // compile regexes
                for (var i in t.data[key]) {
                    for (var j in t.data[key][i].triggers) {
                        var trigger = t.data[key][i].triggers[j];
                        // parse regex
                        var regex = trigger.regex;
                        if (("regex" + localName) in trigger) {
                            regex = trigger["regex" + localName];
                        }
                        regex = Regexes.Parse(regex);
                        t.data[key][i].triggers[j].localRegex  = regex;
                    }
                }
            }
        });
        request.addEventListener("error", function(e) {
            throw e;
        });
        request.addEventListener("abort", function(e) {
            throw e;
        });        
    }

    /**
     * Execute trigger, display alert and tts.
     * @param {object} trigger
     * @param {array} matches
     */
    _executeTrigger(trigger, matches)
    {
        console.log(">> Cactbot triggers, trigger '" + trigger.regex + "' matched.");

        // check if recently triggered, ignore if so
        var index = this.activeTriggers.indexOf(trigger);
        if (index > -1 && this.delayTriggers.indexOf(index) > -1) {
            return;
        }

        // must have 'playerData'
        if (!this.playerData) {
            return;
        }

        // check condition
        if ("condition" in trigger) {
            if (!this._getTriggerValue("condition", trigger, matches)) {
                return;
            }
        }

        // pre run
        this._getTriggerValue("preRun", trigger, matches);

        // add to recent trigger list
        var suppressSeconds = this._getTriggerValue("suppressSeconds", trigger, matches);
        if (
            index > -1 &&
            suppressSeconds > 0
        ) {
            this.delayTriggers.push(index);
            var t = this;
            // set timeout to remove from recent trigger list
            setTimeout(
                function(i) {
                    var delayTriggerIndex = t.delayTriggers.indexOf(i);
                    if (delayTriggerIndex > -1) {
                        t.delayTriggers.splice(delayTriggerIndex, 1);
                    }
                },
                suppressSeconds * 1000,
                index
            );
        }

        // number of seconds to wait before displaying alert
        var delaySeconds = this._getTriggerValue("delaySeconds", trigger, matches);
        if (!delaySeconds) {
            delaySeconds = 0;
        }

        // number of seconds to display alert for
        var durationSeconds = this._getTriggerValue("durationSeconds", trigger, matches);
        if (!durationSeconds) {
            durationSeconds = 3;
        }

        // wait delaySeconds
        setTimeout(
            function(trigger, matches, durationSeconds, t) {

                // display alert
                var alertTextTypes = ["infoText", "alertText", "alarmText"];
                for (var i in alertTextTypes) {
                    var alertText = t._getTriggerValue(alertTextTypes[i], trigger, matches);
                    if (!alertText) {
                        continue;
                    }
                    t._displayAlertText(alertText, durationSeconds);
                }

                // tts
                if (t.userConfig["tts"]) {
                    var ttsText = t._getTriggerValue("tts", trigger, matches);
                    if (ttsText) {
                        t._speak(ttsText);    
                    }
                }

                // post run
                t._getTriggerValue("run", trigger, matches);

            },
            delaySeconds * 1000,
            trigger,
            matches,
            durationSeconds,
            this
        );

    }

    /**
     * Get a trigger value.
     * @param {string} name
     * @param {object} trigger
     * @param {array} matches 
     */
    _getTriggerValue(name, trigger, matches)
    {
        if (!(name in trigger)) {
            return null;
        }
        var value = trigger[name];
        if (typeof(value) == "function") {
            value = value(this.playerData, matches);
        }
        if (typeof(value) == "object" && CBT_LOCALE_NAME in value) {
            value = value[CBT_LOCALE_NAME];
        }
        return value;
    }

    /**
     * Display alert text.
     * @param {string} text
     * @param {integer} duration
     */
    _displayAlertText(text, duration)
    {
        this.getBodyElement().getElementsByClassName("cactbotAlert")[0].innerText = text;
        this._playAlertSound();
        var t = this;
        if (this.alertClearTimeout) {
            clearTimeout(this.alertClearTimeout)
        }
        this.alertClearTimeout = setTimeout(
            function() {
                t.getBodyElement().getElementsByClassName("cactbotAlert")[0].innerText = "";
            },
            duration * 1000
        );        
    }

    /**
     * Say text with TTS.
     * @param {string} text 
     */
    _speak(text)
    {
        var u = new SpeechSynthesisUtterance(text);
        speechSynthesis.speak(u);
    }

    /**
     * Play 'alert' sound.
     */
    _playAlertSound()
    {
        if (!this.userConfig["beep"]) {
            return;
        }
        var snd = new Audio("data:audio/wav;base64,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qJrx4KOQjahZxWbcZgztj2c49nKmkId44S71j0c8eV9yDK6uPRzx5X18eDvjvQ6yKo9ZSS6l//8elePK/Lf//IInrOF/FvDoADYAGBMGb7FtErm5MXMlmPAJQVgWta7Zx2go+8xJ0UiCb8LHHdftWyLJE0QIAIsI+UbXu67dZMjmgDGCGl1H+vpF4NSDckSIkk7Vd+sxEhBQMRU8j/12UIRhzSaUdQ+rQU5kGeFxm+hb1oh6pWWmv3uvmReDl0UnvtapVaIzo1jZbf/pD6ElLqSX+rUmOQNpJFa/r+sa4e/pBlAABoAAAAA3CUgShLdGIxsY7AUABPRrgCABdDuQ5GC7DqPQCgbbJUAoRSUj+NIEig0YfyWUho1VBBBA//uQZB4ABZx5zfMakeAAAAmwAAAAF5F3P0w9GtAAACfAAAAAwLhMDmAYWMgVEG1U0FIGCBgXBXAtfMH10000EEEEEECUBYln03TTTdNBDZopopYvrTTdNa325mImNg3TTPV9q3pmY0xoO6bv3r00y+IDGid/9aaaZTGMuj9mpu9Mpio1dXrr5HERTZSmqU36A3CumzN/9Robv/Xx4v9ijkSRSNLQhAWumap82WRSBUqXStV/YcS+XVLnSS+WLDroqArFkMEsAS+eWmrUzrO0oEmE40RlMZ5+ODIkAyKAGUwZ3mVKmcamcJnMW26MRPgUw6j+LkhyHGVGYjSUUKNpuJUQoOIAyDvEyG8S5yfK6dhZc0Tx1KI/gviKL6qvvFs1+bWtaz58uUNnryq6kt5RzOCkPWlVqVX2a/EEBUdU1KrXLf40GoiiFXK///qpoiDXrOgqDR38JB0bw7SoL+ZB9o1RCkQjQ2CBYZKd/+VJxZRRZlqSkKiws0WFxUyCwsKiMy7hUVFhIaCrNQsKkTIsLivwKKigsj8XYlwt/WKi2N4d//uQRCSAAjURNIHpMZBGYiaQPSYyAAABLAAAAAAAACWAAAAApUF/Mg+0aohSIRobBAsMlO//Kk4soosy1JSFRYWaLC4qZBYWFRGZdwqKiwkNBVmoWFSJkWFxX4FFRQWR+LsS4W/rFRb/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////VEFHAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAU291bmRib3kuZGUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMjAwNGh0dHA6Ly93d3cuc291bmRib3kuZGUAAAAAAAAAACU=");
        snd.play();
    }

}