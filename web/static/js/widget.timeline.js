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
var TIMELINE_OVERLAY_ELEMENT_ID = "timeline-overlay";
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
        this.timelineOverlayElement = document.getElementById(TIMELINE_OVERLAY_ELEMENT_ID);
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
        this.tickTimeout = null;
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
        // escape close overlay
        this.addEventListener("keyup", function(e) {
            if (e.keyCode == 27) {
                t.timelineOverlayElement.classList.add("hide");
            }
        });
        // start tick
        this._tick();
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
            "ids"           : [-1],
            "name"          : "Non-Player Combatants",
            "isNpc"         : true,
            "data"          : { "ID" : -1 }
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
                if (this.combatants[j].data.Name == combatant.data.Name) {
                    this.combatants[j].data = combatant.data;
                    this.timelineElement.appendChild(this.combatants[j].element);
                    // update id list, fix timeline actions
                    if (this.combatants[j].ids.toString() != combatant.ids.toString()) {
                        this.combatants[j].ids = combatant.ids.slice();
                        this._fixTimelineActionCombatants();
                    }
                    // update data-name attribute
                    if (this.combatants[j].name != combatant.name) {
                        this.combatants[j].element.setAttribute("data-name", combatant.name);
                    }                    
                    isExisting = true;
                    break;
                }
            }
            if (isExisting) {
                continue;
            }
            // new combatant
            var newTimelineCombatant = {
                "ids"           : combatant.ids.slice(),
                "data"          : combatant.data,
                "name"          : combatant.name,
                "element"       : this._createTimelineElement(combatant)
            };
            this.combatants.push(newTimelineCombatant);
            this._fixTimelineActionCombatants();
            // force window resize event
            this._onWindowResize();
        }
    }

    /**
     * Itterate timeline actions and move actions to their
     * correct combatants.
     */
    _fixTimelineActionCombatants()
    {
            // itterate action timeline and move new combatant actions to their timeline from npc timline
            for (var i in this.actionTimeline) {
                var action = this.actionTimeline[i];
                if (
                    !action.element ||
                    typeof(action.logData[0].sourceId) == "undefined"
                ) {
                    continue;
                }

                for (var j in this.combatants) {
                    if (
                        this.combatants[j].ids.indexOf(action.logData[0].sourceId) != -1 &&
                        action.element.parentElement == this.combatants[0].element
                    ) {
                        // remove from npc timeline
                        this.combatants[0].element.removeChild(action.element);
                        // add to player timeline
                        this.combatants[j].element.appendChild(action.element);
                        break;
                    }
                }
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
            case MESSAGE_TYPE_AOE:
            case MESSAGE_TYPE_SINGLE_TARGET:
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
     * Update the timeline at a regular interval.
     */
    _tick()
    {
        // clear old timeout
        if (this.tickTimeout) {
            clearTimeout(this.tickTimeout);
        }
        // render timeline
        this._renderTimeline();
        // run every half second
        var t = this;
        this.tickTimeout = setTimeout(function() { t._tick(); }, 500);
    }

    /**
     * Create new timeline element.
     * @param {dict} combatant 
     */
    _createTimelineElement(combatant)
    {
        var element = document.createElement("div");
        element.classList.add("combatant", "combatant-timeline");
        element.setAttribute("data-name", combatant.name);
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
        // check if aoe action and if already registered, add additional log data if so
        if (
            logData.type == MESSAGE_TYPE_AOE &&
            this.actionTimeline.length > 0 && 
            this.actionTimeline[this.actionTimeline.length - 1].time.getTime() == time.getTime() &&
            this.actionTimeline[this.actionTimeline.length - 1].logData[0].actionId == logData.actionId
        ) {
            this.actionTimeline[this.actionTimeline.length - 1].logData.push(logData);
            return;
        }
        // add to action timeline
        this.actionTimeline.push({
            "logData"       : [logData],
            "time"          : time,
            "element"       : null,
            "encounterUID"  : encounterUID
        });
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
            var sourceName = typeof(action.logData[0].sourceName) != "undefined" ? action.logData[0].sourceName : "";
            var sourceId = typeof(action.logData[0].sourceId) != "undefined" ? action.logData[0].sourceId : "";
            var targetId = typeof(action.logData[0].targetId) != "undefined" ? action.logData[0].targetId : -1;
            var targetName = typeof(action.logData[0].targetName) != "undefined" ? action.logData[0].targetName : "";
            var damage = typeof(action.logData[0].damage) != "undefined" ? action.logData[0].damage : 0;
            var actionId = typeof(action.logData[0].actionId) != "undefined" ? action.logData[0].actionId : -99;
            var actionName = typeof(action.logData[0].actionName) != "undefined" ? action.logData[0].actionName : "";
            // find combatant
            var combatant = this.combatants[0];
            for (var j = 0; j < this.combatants.length; j++) {
                if (
                    this.combatants[j].ids.indexOf(sourceId) != -1 ||
                    this.combatants[j].name == sourceName
                ) {
                    combatant = this.combatants[j];
                    if (!combatant.name) {
                        combatant.element.setAttribute("data-name", sourceName);
                    }
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
            // create element
            action.element = document.createElement("div");
            action.element.classList.add("action");
            action.element.setAttribute("data-action-index", i);
            if (typeof(action.logData[0].flags) != "undefined") {
                for (var flagIndex in action.logData[0].flags) {
                    action.element.classList.add("flag-" + action.logData[0].flags[flagIndex]);
                }
            }
            // create icon            
            var actionIconElement = document.createElement("img");
            actionIconElement.classList.add("icon", "action-icon", "loading");
            actionIconElement.onload = function() {
                this.classList.remove("loading");
                this.classList.add("appear");
            };
            action.element.appendChild(actionIconElement);
            var actionNameElement = document.createElement("span");
            actionNameElement.classList.add("name", "action-name");
            // set data
            this._setActionElement(action.element, action);
            // set offset relative to time
            action.element.style.right = pixelPosition + "px";
            // mouse over tooltip
            var t = this;
            action.element.onmouseenter = function(e) {
                var index = this.getAttribute("data-action-index");
                if (!index || typeof(t.actionTimeline[index]) == "undefined") {
                    return;
                }
                t._setActionElement(
                    t.timelineMouseoverElement,
                    t.actionTimeline[index]
                );
                t.timelineMouseoverElement.style.display = "block";
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
            // timeline overlay
            action.element.onclick = function(e) {
                var index = this.getAttribute("data-action-index");
                if (!index || typeof(t.actionTimeline[index]) == "undefined") {
                    return;
                }
                t._showOverlay(t.actionTimeline[index]);
            }
            // add element
            combatant.element.appendChild(action.element);
        }
        // resize all timelines
        if (endTime > 0) {
            this._resizeTimeline(endTime);
        }
    }

    /**
     * Update element to display timeline action data.
     * @param {DOMNode} element 
     * @param {object} timelineAction 
     */
    _setActionElement(element, timelineAction)
    {
        // get log data
        var sourceName = typeof(timelineAction.logData[0].sourceName) != "undefined" ? timelineAction.logData[0].sourceName : "";
        var sourceId = typeof(timelineAction.logData[0].sourceId) != "undefined" ? timelineAction.logData[0].sourceId : "";
        var targetId = typeof(timelineAction.logData[0].targetId) != "undefined" ? timelineAction.logData[0].targetId : -1;
        var targetName = typeof(timelineAction.logData[0].targetName) != "undefined" ? timelineAction.logData[0].targetName : "";
        var damage = typeof(timelineAction.logData[0].damage) != "undefined" ? timelineAction.logData[0].damage : 0;
        var actionId = typeof(timelineAction.logData[0].actionId) != "undefined" ? timelineAction.logData[0].actionId : -99;
        var actionName = typeof(timelineAction.logData[0].actionName) != "undefined" ? timelineAction.logData[0].actionName : "";
        var actionFlags = typeof(timelineAction.logData[0].flags) != "undefined" ? timelineAction.logData[0].flags.toString() : "";
        // get action data
        var actionData = null;
        if (actionId > 0) {
            actionData = this.actionData.getActionById(actionId);
        }
        // action vars
        var actionName = actionData ? actionData.name_en : actionName;
        var actionDescription = actionData && actionData.help_en.trim() ? actionData.help_en.trim() : "(no description available)";
        var actionTimestamp = timelineAction.time.getTime() - this.startTime.getTime();
        var actionTimestampDate = new Date(actionTimestamp);
        // find combatant
        var combatant = this.combatants[0];
        for (var j = 0; j < this.combatants.length; j++) {
            if (
                this.combatants[j].ids.indexOf(sourceId) != -1 ||
                this.combatants[j].name == sourceName
            ) {
                combatant = this.combatants[j];
                break;
            }
        }
        // get icon
        var iconUrl = "/static/img/attack.png"; // default
        if (typeof(combatant.isNpc) != "undefined" && combatant.isNpc) {
            iconUrl = "/static/img/enemy.png"; // default npc icon
        }
        if (actionData && actionData.icon) {
            iconUrl = ACTION_DATA_BASE_URL + actionData["icon"];
        }
        // override "attack" icon
        if (actionName == "Attack") {
            iconUrl = "/static/img/attack.png";
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
                        [MESSAGE_TYPE_SINGLE_TARGET, MESSAGE_TYPE_AOE].indexOf(this.actionTimeline[j].logData[0].type) == -1 ||
                        this.actionTimeline[j].logData[0].targetName != targetName ||
                        this.actionTimeline[j].logData[0].flags.indexOf("damage") == -1
                    ) {
                        continue;
                    }
                    lastDamages.push(this.actionTimeline[j].logData[0]);
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
        // update icon element
        var iconElements = element.getElementsByClassName("action-icon");
        for (var i = 0; i < iconElements.length; i++) {
            iconElements[i].src = iconUrl;
            iconElements[i].setAttribute("alt", actionName);
            iconElements[i].setAttribute("title", actionName);
        }
        // update targets
        var targetElements = element.getElementsByClassName("action-targets");
        for (var i = 0; i < targetElements.length; i++) {
            targetElements[i].innerHTML = "";
            for (var j in timelineAction.logData) {
                var targetElement = document.createElement("div");
                targetElement.classList.add("action-target");
                // set source name
                var targetSourceElement = document.createElement("span");
                targetSourceElement.classList.add("action-target-source");
                targetSourceElement.innerText = timelineAction.logData[j].sourceName;
                targetElement.appendChild(targetSourceElement);
                // set target name
                var targetNameElement = document.createElement("span");
                targetNameElement.classList.add("action-target-name");
                targetNameElement.innerText = timelineAction.logData[j].targetName;
                targetElement.appendChild(targetNameElement);
                // set damage element
                var targetDamageElement = document.createElement("span");
                targetDamageElement.classList.add("action-target-damage");
                targetDamageElement.innerText = "n/a";
                if (typeof(timelineAction.logData[j].damage) != "undefined") {
                    targetDamageElement.innerText = timelineAction.logData[j].damage + 
                        (timelineAction.logData[j].flags.indexOf("crit") != -1 ? "!" : "") +
                        "/" + timelineAction.logData[j].targetCurrentHp +
                        "/" + timelineAction.logData[j].targetMaxHp
                    ;
                }
                targetElement.appendChild(targetDamageElement);

                // add
                targetElements[i].appendChild(targetElement)
            }
        }

        // update plain text elements
        var textElementData = [
            ["action-name", actionName],
            ["action-desc", actionDescription],
            ["action-time", actionTimestampDate.getMinutes() + ":" + (actionTimestampDate.getSeconds() < 10 ? "0" : "") + actionTimestampDate.getSeconds() + "." + actionTimestampDate.getMilliseconds()],
            ["action-flags", actionFlags]
        ];
        for (var i in textElementData) {
            var textElements = element.getElementsByClassName(textElementData[i][0]);
            for (var j = 0; j < textElements.length; j++) {
                textElements[j].innerText = textElementData[i][1];
            }
        }
    }

    /**
     * Display timeline action overlay.
     * @param {object} timelineAction 
     */
    _showOverlay(timelineAction)
    {    
        // set elements
        this._setActionElement(this.timelineOverlayElement, timelineAction);
        // find combatant ids
        var combatant = this.combatants[0];
        for (var j = 0; j < this.combatants.length; j++) {
            if (
                this.combatants[j].ids.indexOf(timelineAction.logData[0].sourceId) != -1 ||
                this.combatants[j].name == timelineAction.logData[0].sourceName
            ) {
                combatant = this.combatants[j];
                break;
            }
        }
        // find other actions
        var otherActionsElement = this.timelineOverlayElement.getElementsByClassName("other-actions")[0];
        otherActionsElement.innerHTML = "";
        var timestamp = timelineAction.time.getTime()
        var hasOtherActions = false;
        for (var i in this.actionTimeline) {
            if (
                combatant.ids.indexOf(this.actionTimeline[i].logData[0].sourceId) == -1 ||
                (
                    this.actionTimeline[i].time.getTime() == timelineAction.time.getTime() &&
                    this.actionTimeline[i].logData[0].actionId == timelineAction.logData[0].actionId
                ) ||
                Math.abs(timestamp - this.actionTimeline[i].time.getTime()) > 1000
            ) {
                continue;
            }
            hasOtherActions = true;
            // create element
            var otherActionElement = document.createElement("div");
            otherActionElement.classList.add("other-action");
            var oaTimeElement = document.createElement("span");
            oaTimeElement.classList.add("action-time");
            otherActionElement.appendChild(oaTimeElement);
            var oaIconElement = document.createElement("img");
            oaIconElement.classList.add("action-icon");
            otherActionElement.appendChild(oaIconElement);
            var oaNameElement = document.createElement("span");
            oaNameElement.classList.add("action-name");
            otherActionElement.appendChild(oaNameElement);
            otherActionsElement.appendChild(otherActionElement);
            otherActionElement.setAttribute("data-action-index", i);
            // set elements
            this._setActionElement(otherActionElement, this.actionTimeline[i]);
            var t = this;
            otherActionElement.onclick = function(e) {
                var index = this.getAttribute("data-action-index");
                if (!index || typeof(t.actionTimeline[index]) == "undefined") {
                    return;
                }
                t._showOverlay(t.actionTimeline[index]);
            };
        }
        if (!hasOtherActions) {
            otherActionsElement.innerText = "(none)";
        }

        // show
        this.timelineOverlayElement.classList.remove("hide");

        // close
        this.timelineOverlayElement.onclick = function(e) {
            if (
                typeof(e.target) == "undefined" ||
                e.target == this ||
                e.target == this.getElementsByClassName("close")[0]
            ) {
                this.classList.add("hide");
            }
        };

    }

};