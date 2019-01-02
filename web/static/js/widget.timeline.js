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

var TIMELINE_ELEMENT_ID = "timeline";
var TIMELINE_MOUSEOVER_ELEMENT_ID = "timeline-mouseover";
var TIMELINE_PIXELS_PER_MILLISECOND = 0.07; // how many pixels represents a millisecond in timeline
var TIMELINE_PIXEL_OFFSET = TIMELINE_PIXELS_PER_MILLISECOND * 1000;
var GAIN_EFFECT_REGEX = /1A\:([a-zA-Z0-9` ']*) gains the effect of ([a-zA-Z0-9` ']*) from ([a-zA-Z0-9` ']*) for ([0-9]*)\.00 Seconds\./;
var LOSE_EFFECT_REGEX = /1E\:([a-zA-Z0-9` ']*) loses the effect of ([a-zA-Z0-9` ']*) from ([a-zA-Z0-9` ']*)\./;

/**
 * Timeline widget
 */
class WidgetTimelime extends WidgetBase
{

    constructor()
    {
        super();
        // timeline related elements
        this.timelineElement = document.getElementById(TIMELINE_ELEMENT_ID);
        this.timelineMouseoverElement = document.getElementById(TIMELINE_MOUSEOVER_ELEMENT_ID);
        this.timeKeyContainerElement = null;
        // encounter data
        this.encounterId = null;
        this.startTime = null;
        this.endTime = null;
        this.isActiveEncounter = false;
        // timeline data
        this.combatants = [];
        this.actionTimeline = [];
        this.actionData = null;
        this.effectTracker = {};
        // other
        this.lastTimeKey = 0;
    }

    getName()
    {
        return "timeline";
    }

    getTitle()
    {
        return "Timeline";
    }

    init()
    {
        super.init()
        // get action data if already set
        if (typeof(_actionData) != "undefined") {
            this.actionData = _actionData;
        }        
        // reset
        this.reset();
        // hook events
        var t = this;
        this.addEventListener("act:encounter", function(e) { t._updateEncounter(e); });
        this.addEventListener("act:logLine", function(e) { t._onLogLine(e); });
        this.addEventListener("combatants-display", function(e) { t._updateCombatants(e); });
        this.addEventListener("action-data-ready", function(e) { t.actionData = e.detail; t._renderTimeline(); });
        // horizontal scrolling
        function hScrollTimeline(e) {
            var delta = Math.max(-1, Math.min(1, (e.wheelDelta || -e.detail)));
            t.timelineElement.scrollLeft -= (delta * 40);
        }
        this.timelineElement.addEventListener("mousewheel", hScrollTimeline);
        this.timelineElement.addEventListener("DOMMouseScroll", hScrollTimeline);
        // window resize
        this.addEventListener("resize", function(e) { t._onWindowResize(); });
    }

    /**
     * Reset all elements.
     */
    reset()
    {
        // carry over actions that have the same encounter uid
        var carryOverActions = [];
        for (var i in this.actionTimeline) {
            var actionData = this.actionTimeline[i];
            if (actionData.encounterUID == this.encounterId || !this.encounterId) {
                carryOverActions.push(actionData);
            }
        }
        this.actionTimeline = carryOverActions;
        this.timelineElement.innerHTML = "";
        this.lastTimeKey = 0;
        this.timeKeyContainerElement = document.createElement("div");
        this.timeKeyContainerElement.classList.add("time-key-container");
        this.timelineElement.append(this.timeKeyContainerElement);
        var npcCombatant = {
            "Name"          : "Non-Player Combatants",
            "IsNPC"         : true
        };
        npcCombatant["element"] = this._createTimelineElement(npcCombatant);
        this.combatants = [npcCombatant];
        this.effectTracker = {};
    }

    /**
     * Update encounter data from act:encounter event.
     * @param {Event} event 
     */
    _updateEncounter(event)
    {
        // new encounter active
        if (event.detail.Active && this.encounterId != event.detail.UID) {
            this.encounterId = event.detail.UID;
            this.reset();
        }
        this.isActiveEncounter = event.detail.Active;
        this.startTime = event.detail.StartTime;
        this.endTime = event.detail.EndTime;
    }

    /**
     * Update combatant data from combatant-display event (combatant widget).
     * @param {Event} event 
     */
    _updateCombatants(event)
    {
        var combatants = event.detail;
        for (var i = 0; i < combatants.length; i++) {
            var combatant = combatants[i];
            // update existing
            var isExisting = false;
            for (var j = 0; j < this.combatants.length; j++) {
                if (this.combatants[j].Name == combatant[0].Name) {
                    var element = this.combatants[j].element;
                    this.combatants[j] = combatant[0];
                    this.combatants[j]["element"] = element;
                    this.timelineElement.appendChild(this.combatants[j].element);
                    isExisting = true;
                    break;
                }
            }
            if (isExisting) {
                continue;
            }
            // new combatant
            combatant[0]["element"] = this._createTimelineElement(combatant[0]);            
            this.combatants.push(combatant[0]);

            // itterate action timeline and move new combatant actions to their timeline from npc timline
            for (var i in this.actionTimeline) {
                var action = this.actionTimeline[i];
                if (
                    !action.element ||
                    typeof(action.logData.sourceName) == "undefined" ||
                    action.logData.sourceName != combatant[0].Name
                ) {
                    continue;
                }
                // remove from npc timeline
                this.combatants[0].element.removeChild(action.element);
                // add to player timeline
                combatant[0].element.appendChild(action.element);
            }
            // force window resize event
            this._onWindowResize();
        }
    }

    /**
     * Queue up action recieved from "act:logline" event.
     * @param {Event} event 
     */
    _onLogLine(event)
    {
        var logLineData = parseLogLine(event.detail.LogLine);
        switch (logLineData.type)
        {
            case MESSAGE_TYPE_SINGLE_TARGET:
            case MESSAGE_TYPE_AOE:
            {
                this._addAction(logLineData, event.detail.Time, event.detail.EncounterUID);
                break;
            }
            case MESSAGE_TYPE_DEATH:
            {
                logLineData["actionId"] = -1;
                logLineData["actionName"] = "Death";
                logLineData["sourceId"] = -1;
                logLineData["targetName"] = logLineData.sourceName;
                logLineData["targetId"] = -1;
                this._addAction(logLineData, event.detail.Time, event.detail.EncounterUID)
                break;
            }
            case MESSAGE_TYPE_GAIN_EFFECT:
            {
                var regexParse = GAIN_EFFECT_REGEX.exec(logLineData.raw);
                if (!regexParse) {
                    break;
                }
                var target = regexParse[1];
                var effect = regexParse[2];
                var source = regexParse[3];
                var time = parseInt(regexParse[4]);
                if (!(target in this.effectTracker)) {
                    this.effectTracker[target] = {};
                }
                this.effectTracker[target][effect + "/" + source] = {
                    "effect"        : effect,
                    "source"        : source,
                    "startTime"     : event.detail.Time,
                    "length"        : time * 1000,
                    "active"        : true,
                }
                break;
            }
            case MESSAGE_TYPE_LOSE_EFFECT:
            {
                var regexParse = LOSE_EFFECT_REGEX.exec(logLineData.raw);
                if (!regexParse) {
                    break;
                }
                var target = regexParse[1];
                var effect = regexParse[2];
                var source = regexParse[3];
                if (!(target in this.effectTracker)) {
                    this.effectTracker[target] = {};
                }
                if ((effect + "/" + source) in this.effectTracker[target]) {
                    this.effectTracker[target][effect + "/" + source]["active"] = false;
                }
                break;
            }
        }
    }

    /**
     * Create new timeline element.
     * @param {dict} combatant 
     */
    _createTimelineElement(combatant)
    {
        var element = document.createElement("div");
        element.classList.add("combatant", "combatant-timeline");
        element.setAttribute("data-name", combatant.Name);
        this.timelineElement.appendChild(element);
        return element;
    }

    /**
     * Add action to timeline.
     * @param {Object} logData
     * @param {Date} time
     * @param {string} encounterUID
     */
    _addAction(logData, time, encounterUID)
    {
        if (!time || isNaN(time) || !encounterUID) {
            return;
        }
        // add to action timeline
        this.actionTimeline.push({
            "logData"       : logData,
            "time"          : time,
            "element"       : null,
            "encounterUID"  : encounterUID
        });
        // render new timeline elements
        this._renderTimeline();
    }

    /**
     * Resize elements.
     */
    _onWindowResize()
    {
        // fix timeline element height
        this.timelineElement.style.height = (
            window.innerHeight - document.getElementById("head").offsetHeight - document.getElementById("footer").offsetHeight
        ) + "px";
        // resize timeline elements to match height of combatant elements
        var combatantElements = document.getElementsByClassName("combatant-info");
        for (var i = 0; i < combatantElements.length; i++) {
            this.combatants[i].element.style.height = (combatantElements[i].offsetHeight - 1) + "px";
        }        
    }

    /**
     * Resize timelines and add new time keys.
     * @param {integer} timestamp
     */
    _resizeTimeline(timestamp)
    {
        var timestamp = parseInt(Math.ceil(timestamp / 1000)) * 1000;
        var timelinePixelLength = TIMELINE_PIXEL_OFFSET + parseInt(TIMELINE_PIXELS_PER_MILLISECOND * timestamp);
        // resize combatant timelines
        for (var i = 0; i < this.combatants.length; i++) {
            if (this.combatants[i].element.offsetWidth < timestamp) {
                this.combatants[i].element.style.width = timelinePixelLength + "px";
            }
        }
        // resize time key container
        if (this.timeKeyContainerElement && this.timeKeyContainerElement.offsetWidth < timelinePixelLength) {
            this.timeKeyContainerElement.style.width = timelinePixelLength + "px";
            // add more time keys
            if (timestamp > this.lastTimeKey) {
                for (var i = this.lastTimeKey; i < parseInt(timestamp / 1000) + 1; i++) {
                    var timeKeyElement = document.createElement("div");
                    timeKeyElement.classList.add("time-key");
                    timeKeyElement.innerText = ((i / 60) < 10 ? "0" : "") + (Math.floor((i / 60)).toFixed(0)) + ":" + ((i % 60) < 10 ? "0" : "") + (i % 60);
                    timeKeyElement.style.right = (parseInt(((i * 1000) * TIMELINE_PIXELS_PER_MILLISECOND) - 16)) + "px";
                    this.timeKeyContainerElement.append(timeKeyElement);
                }
                this.lastTimeKey = parseInt(timestamp / 1000) + 1;
            }
        }
    }

    /**
     * Render actions to timeline DOM.
     */
    _renderTimeline()
    {
        // must have action data loaded
        if (!this.actionData || !this.startTime) {
            return;
        }
        var endTime = 0;
        for (var i in this.actionTimeline) {
            var action = this.actionTimeline[i];
            // ensure action isn't already rendered
            if (action.element) {
                continue;
            }
            // get log data + action data
            var sourceName = typeof(action.logData.sourceName) != "undefined" ? action.logData.sourceName : "";
            var sourceId = typeof(action.logData.sourceId) != "undefined" ? action.logData.sourceId : "";
            var targetId = typeof(action.logData.targetId) != "undefined" ? action.logData.targetId : -1;
            var targetName = typeof(action.logData.targetName) != "undefined" ? action.logData.targetName : "";
            var damage = typeof(action.logData.damage) != "undefined" ? action.logData.damage : 0;
            var actionId = typeof(action.logData.actionId) != "undefined" ? action.logData.actionId : -99;
            var actionName = typeof(action.logData.actionName) != "undefined" ? action.logData.actionName : "";
            // find combatant
            var combatant = this.combatants[0];
            for (var j = 0; j < this.combatants.length; j++) {
                if (this.combatants[j].Name == sourceName) {
                    combatant = this.combatants[j];
                    break;
                }
            }
            // get action data
            var actionData = null;
            if (actionId > 0) {
                actionData = this.actionData.getActionById(actionId);
                if (actionData && typeof(actionData.name_en) != "undefined") {
                    actionName = actionData.name_en;
                }
            }
            var actionDescription = actionData && actionData.help_en.trim() ? actionData.help_en.trim() : "(no description available)";
            // get timestamp for action in current encounter
            var timestamp = action.time.getTime() - this.startTime.getTime();
            // action takes place after encounter end, do nothing
            if (!this.isActiveEncounter && timestamp > this.endTime.getTime() - this.startTime.getTime()) {
                continue;
            }
            // drop if occured more then 10 seconds before pull
            if (timestamp < -10000) {
                continue;
            }   
            // record latest action so timeline can be resized
            if (timestamp > endTime) {
                endTime = timestamp;
            }
            // calculate action pixel position
            var pixelPosition = parseInt((timestamp * TIMELINE_PIXELS_PER_MILLISECOND));
            // get icon
            var iconUrl = "/static/img/attack.png"; // default
            if (typeof(combatant.IsNPC) != "undefined" && combatant.IsNPC) {
                iconUrl = "/static/img/enemy.png"; // default npc icon
            }
            if (actionData && actionData["icon"]) {
                iconUrl = ACTION_DATA_BASE_URL + actionData["icon"];
            }
            // override "attack" icon
            if (actionName == "Attack") {
                iconUrl = "/static/img/attack.png";
            }
            // create element
            action.element = document.createElement("div");
            action.element.classList.add("action");
            action.element.setAttribute("data-action-index", i);
            if (typeof(action.logData.flags) != "undefined") {
                for (var flagIndex in action.logData.flags) {
                    action.element.classList.add("flag-" + action.logData.flags[flagIndex]);
                }
            }
            // special case actions
            switch (actionId)
            {
                // death
                case -1:
                {
                    actionName = "Death";
                    targetName = sourceName; // target of "death" is actually combatant
                    targetId = sourceId;
                    iconUrl = "/static/img/death.png";
                    action.element.classList.add("special");
                    // show active effects at death
                    actionDescription = "Active Effects:\n";
                    var effectCount = 0;
                    if (targetName in this.effectTracker) {
                        for (var j in this.effectTracker[targetName]) {
                            var effectData = this.effectTracker[targetName][j];
                            if (!effectData.active) {
                                continue;
                            }
                            effectCount++;
                            actionDescription += effectData.effect + "\n";
                        }
                    }
                    if (effectCount == 0) {
                        actionDescription += "(none)\n";
                    }
                    // show damage taken that lead to the death
                    actionDescription += "\nLast Damage Taken:\n"
                    var lastDamages = [];
                    for (var j in this.actionTimeline) {
                        if (
                            [MESSAGE_TYPE_SINGLE_TARGET, MESSAGE_TYPE_AOE].indexOf(this.actionTimeline[j].logData.type) == -1 ||
                            this.actionTimeline[j].logData.targetName != targetName ||
                            this.actionTimeline[j].logData.flags.indexOf("damage") == -1
                        ) {
                            continue;
                        }
                        lastDamages.push(this.actionTimeline[j].logData);
                        if (lastDamages.length > 5) {
                            lastDamages.shift();
                        }
                    }
                    for (var j in lastDamages) {
                        actionDescription += lastDamages[j].actionName + " (" + lastDamages[j].damage + (lastDamages[j].flags.indexOf("crit") != -1 ? "!" : "") + ")\n";
                    }
                    if (lastDamages.length == 0) {
                        actionDescription += "(none)\n";
                    }
                    break;
                }
            }
            // create icon            
            var actionIconElement = document.createElement("img");
            actionIconElement.classList.add("icon", "loading");
            actionIconElement.src = iconUrl;
            actionIconElement.alt = actionName;
            actionIconElement.onload = function() {
                this.classList.remove("loading");
                this.classList.add("appear");
            };
            action.element.appendChild(actionIconElement);
            var actionNameElement = document.createElement("span");
            actionNameElement.classList.add("name");
            actionNameElement.innerText = name;        
            // set offset relative to time
            action.element.style.right = pixelPosition + "px";
            // add info to element attributes
            action.element.setAttribute("data-action-name", actionName);
            action.element.setAttribute("data-action-desc", actionDescription);
            action.element.setAttribute("data-action-target", targetName);
            if (typeof(combatant.IsNPC) != "undefined" && combatant.IsNPC) {
                action.element.setAttribute("data-action-target", sourceName + " > " + targetName);
            }
            var time = new Date(timestamp);
            action.element.setAttribute("data-action-time", time.getMinutes() + ":" + (time.getSeconds() < 10 ? "0" : "") + time.getSeconds() + "." + time.getMilliseconds() ) ;
            // mouse over tooltip
            var t = this;
            action.element.onmouseenter = function(e) {
                // update mouse over element                
                t.timelineMouseoverElement.style.display = "block";
                t.timelineMouseoverElement.getElementsByClassName("action-name")[0].innerText = this.getAttribute("data-action-name");
                t.timelineMouseoverElement.getElementsByClassName("action-desc")[0].innerText = this.getAttribute("data-action-desc");;
                t.timelineMouseoverElement.getElementsByClassName("action-target")[0].innerText = this.getAttribute("data-action-target");;
                t.timelineMouseoverElement.getElementsByClassName("action-time")[0].innerText = this.getAttribute("data-action-time");
               
            };
            action.element.onmousemove = function(e) {
                t.timelineMouseoverElement.style.left = e.pageX + "px";
                if (e.pageX + t.timelineMouseoverElement.offsetWidth > window.innerWidth) {
                    t.timelineMouseoverElement.style.left = (e.pageX - t.timelineMouseoverElement.offsetWidth) + "px";
                }
                t.timelineMouseoverElement.style.top = e.pageY + "px";
            };
            action.element.onmouseleave = function(e) {
                t.timelineMouseoverElement.style.display = "none";
            };
            // add element
            combatant.element.appendChild(action.element);
        }
        // resize all timelines
        if (endTime > 0) {
            this._resizeTimeline(endTime);
        }
    }

};