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
var TIMELINE_CANVAS_ELEMENT_ID = "timeline-canvas";
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
        this.combatantContainerElement = document.getElementById(COMBATANT_CONTAINER_ELEMENT_ID);
        this.timelineElement = document.getElementById(TIMELINE_ELEMENT_ID);
        this.timelineCanvas = document.getElementById(TIMELINE_CANVAS_ELEMENT_ID);
        this.canvasContext = this.timelineCanvas.getContext("2d");
        this.timelineMouseoverElement = document.getElementById(TIMELINE_MOUSEOVER_ELEMENT_ID);
        this.timelineOverlayElement = document.getElementById(TIMELINE_OVERLAY_ELEMENT_ID);
        this.timeKeyContainerElement = null;
        this.images = {};
        this.timelineSeek = null;
        // encounter data
        this.encounterId = null;
        this.startTime = null;
        this.endTime = null;
        this.isActiveEncounter = false;
        // timeline data
        this.combatants = [];
        this.actionTimeline = [];
        this.actionData = null;
        this.statusData = null;
        this.enemyElement = null;
        this.enemyCombatant = null;
        // other
        this.lastTimeKey = 0;
        this.tickTimeout = null;
        this.timelineVOffset = 0;
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
        this.addEventListener("widget-combatants:display", function(e) { t._updateCombatants(e); });
        this.addEventListener("app:action-data", function(e) { t.actionData = e.detail; if (t.statusData) { t._renderTimeline(); } });
        this.addEventListener("app:status-data", function(e) { t.statusData = e.detail; if (t.actionData) { t._renderTimeline(); } });
        // horizontal scrolling
        function hScrollTimeline(e) {
            var delta = Math.max(-1, Math.min(1, (e.wheelDelta || -e.detail)));
            t._addSeek(delta * 300);
        }
        this.timelineElement.addEventListener("mousewheel", hScrollTimeline);
        this.timelineElement.addEventListener("DOMMouseScroll", hScrollTimeline);
        // drag scroll timeline
        var isMouseDown = false;
        this.timelineCanvas.addEventListener("mousedown", function(e) {
            isMouseDown = true;
        });
        window.addEventListener("mouseup", function(e) {
            isMouseDown = false;
        });
        this.timelineCanvas.addEventListener("mousemove", function(e) {
            if (!isMouseDown) {
                return;
            }
            t._addSeek(e.movementX * 15);
            // vertical scroll
            var combatantOffset = parseInt(t.combatantContainerElement.style.marginTop);
            if (!combatantOffset) {
                combatantOffset = 0;
            }
            combatantOffset = combatantOffset + (e.movementY * 2);
            if (combatantOffset > 0) {
                combatantOffset = 0;
            } else if (combatantOffset < -(t.combatantContainerElement.offsetHeight - (window.innerHeight - t.timelineVOffset))) {
                combatantOffset = -(t.combatantContainerElement.offsetHeight - (window.innerHeight - t.timelineVOffset));
            }
            
            t.combatantContainerElement.style.marginTop = combatantOffset + "px";
            t.timelineElement.style.marginTop = combatantOffset + "px";
        });
        // window resize
        this.addEventListener("resize", function(e) { t._resizeTimeline(); });
        setTimeout(function() { t._resizeTimeline(); }, 1000);
        // mouse overlay
        this.timelineCanvas.addEventListener("mousemove", function(e) {
            
        });
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
        this.lastTimeKey = 0;
        this.enemyCombatant = new Combatant();
        this.combatants = [];
        this.timelineSeek = null;
        this.combatantContainerElement.style.marginTop = "0px";
        this.timelineElement.style.marginTop = "0px";
        this.timelineVOffset = this.combatantContainerElement.offsetTop + document.getElementById("footer").offsetHeight;
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
            var hasCombatant = false;
            for (var j = 0; j < this.combatants.length; j++) {
                if (
                    this.combatants[j].compare(combatant)
                ) {
                    hasCombatant = true;
                    break;
                }
            }
            if (hasCombatant) {
                continue;
            }
            // new combatant
            this.combatants.push(combatant);
            // resize timeline
            this._resizeTimeline();
            this._renderTimeline();
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
                logLineData["actionType"] = "action";
                this._addAction(logLineData, event.detail.Time, event.detail.EncounterUID);
                // if friendly is attacking enemy then add enemy to
                // list of enemy combatants and allow their actions to show
                // under enemy combatant timeline
                if (
                    logLineData.flags.indexOf("damage") != -1 &&
                    !this.enemyCombatant.compare(logLineData.targetId) &&
                    !this.enemyCombatant.compare(logLineData.targetName)
                ) {
                    // target cannot be in combatant list
                    for (var i in this.combatants) {
                        if (this.combatants[i].compare(logLineData.targetId)) {
                            return;
                        }
                    }
                    // look for source in combatant list
                    for (var i in this.combatants) {
                        var combatant = this.combatants[i];
                        if (
                            !combatant.compare(logLineData.targetId) &&
                            combatant.compare(logLineData.sourceId)
                        ) {
                            this.enemyCombatant.ids.push(logLineData.targetId);
                            this.enemyCombatant.names.push(logLineData.targetName);
                            break;
                        }
                    }
                }
                
                break;
            }
            case MESSAGE_TYPE_DEATH:
            {
                logLineData["actionId"] = -1;
                logLineData["actionName"] = "Death";
                logLineData["sourceId"] = -1;
                logLineData["targetName"] = logLineData.sourceName;
                logLineData["targetId"] = -1;
                logLineData["actionType"] = "death";
                // find last action again death target
                for (var i = this.actionTimeline.length - 1; i >= 0; i--) {
                    var action = this.actionTimeline[i];
                    var hasLogData = false;
                    for (var j in action.logData) {
                        if (action.logData[j].targetName == logLineData.sourceName) {
                            hasLogData = true;
                            logLineData["sourceId"] = action.logData[j].targetId;
                            logLineData["sourceName"] = action.logData[j].targetName;
                            logLineData["targetName"] = logLineData["sourceName"];
                            logLineData["targetId"] = logLineData["sourceId"];
                        }
                    }
                    if (hasLogData) {
                        break;
                    }
                }
                this._addAction(logLineData, event.detail.Time, event.detail.EncounterUID);
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
                // add to timeline
                logLineData["actionId"] = -2;
                logLineData["actionName"] = effect;
                logLineData["sourceId"] = null;
                logLineData["sourceName"] = target; // source and target are reversed so that this ends up on the desired timeline
                logLineData["targetName"] = source;
                logLineData["targetId"] = null;
                logLineData["actionType"] = "gain-effect";
                logLineData["flags"] = ["gain-effect"];
                this._addAction(logLineData, event.detail.Time, event.detail.EncounterUID);
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
                // add to timeline
                logLineData["actionId"] = -2;
                logLineData["actionName"] = effect;
                logLineData["sourceId"] = null;
                logLineData["sourceName"] = target; // source and target are reversed so that this ends up on the desired timeline
                logLineData["targetName"] = source;
                logLineData["targetId"] = null;
                logLineData["actionType"] = "lose-effect";
                logLineData["flags"] = ["lose-effect"];
                this._addAction(logLineData, event.detail.Time, event.detail.EncounterUID);
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
        if (!this.timelineSeek && this.isActiveEncounter) {
            this._renderTimeline();
        }
        // run every half second
        var t = this;
        this.tickTimeout = setTimeout(function() { t._tick(); }, 500);
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
            this.actionTimeline.length > 0 && 
            this.actionTimeline[this.actionTimeline.length - 1].time.getTime() == time.getTime() &&
            (
                this.actionTimeline[this.actionTimeline.length - 1].logData[0].actionId == logData.actionId ||
                this.actionTimeline[this.actionTimeline.length - 1].logData[0].actionName == logData.actionName
            )
        ) {
            switch (logData.type)
            {
                case MESSAGE_TYPE_AOE:
                {
                    this.actionTimeline[this.actionTimeline.length - 1].logData.push(logData);
                    return;
                }
                // skip same action if repeated
                default:
                {
                    return;
                }
            }
        }
        // add to action timeline
        this.actionTimeline.push({
            "logData"       : [logData],
            "time"          : time,
            "element"       : null,
            "encounterUID"  : encounterUID
        });
        // render timeline when all actions are loaded
        if (!this.isActiveEncounter && time.getTime() >= this.endTime.getTime()) {
            this._renderTimeline();
        }
    }

    /**
     * Resize timeline canvas.
     */
    _resizeTimeline()
    {
        if (
            this.timelineElement.offsetWidth != this.timelineCanvas.width ||
            this.combatantContainerElement.offsetHeight != this.timelineCanvas.height
        ) {
            this.timelineCanvas.width = this.timelineElement.offsetWidth;
            this.timelineCanvas.height = this.combatantContainerElement.offsetHeight;
            this._renderTimeline();
        }
    }

    /**
     * Find best combatant given list of identifying values.
     * @param {array} compareValues 
     * @return Combatant
     */
    _findCombatant(compareValues)
    {
        var combatant = null;
        for (var i in compareValues) {
            if (this.enemyCombatant.compare(compareValues[i])) {
                combatant = this.enemyCombatant;
            }
            if (!combatant) {
                for (var j = 0; j < this.combatants.length; j++) {
                    if (this.combatants[j].compare(compareValues[i])) {
                        combatant = this.combatants[j];
                        break;
                    }
                }
            }
            if (combatant) {
                break;
            }
        }
        return combatant;
    }

    /**
     * Render time stamps and grid lines in timeline canvas.
     * @param {Date} time 
     */
    _renderTimeKeys(time)
    {
        if (!time) {
            return;
        }
        // draw rectangle bg
        this.canvasContext.fillStyle = "#2d2d2d";
        this.canvasContext.fillRect(0, 0, this.timelineCanvas.width, 25);
        this.canvasContext.fillStyle = "#fff";
        this.canvasContext.fillRect(0, 24, this.timelineCanvas.width, 1);
        // set font
        this.canvasContext.font = "16px sans-serif";
        this.canvasContext.fillStyle = "#fff";
        this.canvasContext.textAlign = "center";
        // draw time keys
        var duration = time.getTime() - this.startTime.getTime();
        var offset = (duration % 1000) * TIMELINE_PIXELS_PER_MILLISECOND;
        for (var i = 0; i < 99; i++) {
            // draw text
            var seconds = parseInt(duration / 1000) - i;
            if (seconds < 0) {
                break;
            }
            var timeKeyText = ((seconds / 60) < 10 ? "0" : "") + (Math.floor((seconds / 60)).toFixed(0)) + ":" + ((seconds % 60) < 10 ? "0" : "") + (seconds % 60);
            var position = parseInt((i * 1000) * TIMELINE_PIXELS_PER_MILLISECOND) + offset;
            if (position > this.timelineCanvas.width) {
                break;
            }
            this.canvasContext.fillText(
                timeKeyText,
                position,
                18
            );
            // draw vertical grid line
            this.canvasContext.fillRect(position, 25, 1, this.timelineCanvas.height);
        }

        for (var i in this.combatants) {
            if (typeof(this.combatants[i]._parseElement) == "undefined") {
                continue;
            }
            this.canvasContext.fillRect(0, this.combatants[i]._parseElement.offsetTop, this.timelineCanvas.width, 1);
        }

    }

    /**
     * Set timeline viewport.
     * @param {Date|integer} time 
     */
    _setSeek(time)
    {
        if (!time) {
            this.timelineSeek = null;
            this._renderTimeline();
            return;
        }
        if (time instanceof Date) {
            time = time.getTime();
        }
        if (this.isActiveEncounter && time >= new Date().getTime()) {
            this.timelineSeek = null;
            this._renderTimeline();
            return;
        }
        if (this.timelineSeek != time) {
            this.timelineSeek = time;
            this._renderTimeline();
        }
    }

    /**
     * Add given time to seek value.
     * @param {integer} timeAdd 
     */
    _addSeek(timeAdd)
    {
        if (!this.timelineSeek) {
            this.timelineSeek = new Date().getTime();
            if (!this.isActiveEncounter) {
                this.timelineSeek = this.endTime.getTime();
            }
        }
        this._setSeek(this.timelineSeek + timeAdd);
    }

    /**
     * Get current position of timeline.
     * @return {Date}
     */
    _getCurrentTime()
    {
        if (this.timelineSeek) {
           return new Date(this.timelineSeek);
        }
        if (this.isActiveEncounter) {
            return new Date(new Date().getTime() + 5000);
        }
        return this.endTime;
    }

    /**
     * Render actions to timeline DOM.
     */
    _renderTimeline()
    {
        // must have action data loaded
        if (!this.actionData || !this.statusData || !this.startTime) {
            return;
        }
        // get current position
        var time = this._getCurrentTime();
        // clear canvas
        this.canvasContext.clearRect(0, 0, this.timelineCanvas.width, this.timelineCanvas.height);
        // render time keys
        this._renderTimeKeys(time);
        // render actions
        for (var i in this.actionTimeline) {
            this._addActionToCanvas(this.actionTimeline[i]);
        }
    }

    /**
     * Get URL to action icon.
     * @param {object} timelineAction 
     * @param {object} combatant 
     * @param {object} actionData 
     * @return {string}
     */
    _getTimelineActionIcon(timelineAction, combatant, actionData)
    {
        // get log data
        var sourceName = typeof(timelineAction.logData[0].sourceName) != "undefined" ? timelineAction.logData[0].sourceName : "";
        var sourceId = typeof(timelineAction.logData[0].sourceId) != "undefined" ? timelineAction.logData[0].sourceId : "";        
        var actionId = typeof(timelineAction.logData[0].actionId) != "undefined" ? timelineAction.logData[0].actionId : -99;
        var actionName = typeof(timelineAction.logData[0].actionName) != "undefined" ? timelineAction.logData[0].actionName : "";
        // get action data
        if (!actionData && actionId > 0) {
            actionData = this.actionData.getActionById(actionId);
        }
        // get status effect data
        if (!actionData && actionId == -2 && actionName) {
            var actionData = this.statusData.getStatusByName(actionName);
        }
        // find combatant
        if (!combatant) {
            combatant = this._findCombatant([sourceId, sourceName]);
        }
        // get icon
        var iconUrl = ""; // default
        if (!combatant || combatant == this.enemyCombatant) {
            iconUrl = "/static/img/enemy.png"; // default npc icon
        }
        if (actionData && actionData.icon) {
            iconUrl = ACTION_DATA_BASE_URL + actionData["icon"];
            if (actionId == -2) {
                iconUrl = STATUS_DATA_BASE_URL + actionData["icon"];
            }
        }
        // special cases
        switch (actionId) {
            // death
            case -1:
            {
                iconUrl = "/static/img/death.png";
                break;
            }
            // sprint
            case 3:
            {
                iconUrl = "/static/img/sprint.png";
                break;
            }
        }
        // default icon, "attack"
        if (!iconUrl || (combatant && combatant != this.enemyCombatant && actionName == "Attack")) {
            iconUrl = "/static/img/attack.png";
        }
        return iconUrl;
    }

    /**
     * Draw action to canvas.
     * @param {object} timelineAction 
     */
    _addActionToCanvas(timelineAction)
    {
        // get current timeline position
        var timelinePos = this._getCurrentTime();
        // get log data
        var sourceName = typeof(timelineAction.logData[0].sourceName) != "undefined" ? timelineAction.logData[0].sourceName : "";
        var sourceId = typeof(timelineAction.logData[0].sourceId) != "undefined" ? timelineAction.logData[0].sourceId : "";
        var actionType = typeof(timelineAction.logData[0].actionType) != "undefined" ? timelineAction.logData[0].actionType : "action";       
        // action vars
        var actionTimestamp = timelineAction.time.getTime() - this.startTime.getTime();
        // action takes place after encounter end, do nothing
        if (!this.isActiveEncounter && actionTimestamp > this.endTime.getTime() - this.startTime.getTime()) {
            return;
        }        
        // drop if occured more then 10 seconds before pull
        if (actionTimestamp < -10000) {
            return;
        }  
        // find combatant
        var combatant = this._findCombatant([sourceId, sourceName]);
        // get icon
        var iconUrl = this._getTimelineActionIcon(timelineAction, combatant);
        // get current position
        var time = this._getCurrentTime();
        var offsetPos = (time.getTime() - this.startTime.getTime()) * TIMELINE_PIXELS_PER_MILLISECOND;
        var pixelPosition = offsetPos - parseInt((actionTimestamp * TIMELINE_PIXELS_PER_MILLISECOND));
        if (pixelPosition < 0 || pixelPosition > this.timelineCanvas.width) {
            return;
        }
        // get top pos / height
        var topPos = 25;
        var timelineHeight = 48;
        if (!combatant) {
            return;
        }
        if (combatant != this.enemyCombatant) {
            topPos = combatant._parseElement.offsetTop;
            timelineHeight = combatant._parseElement.offsetHeight;
        }
        // determine draw width/height
        var maxImageWidth = 32;
        var maxImageHeight = 32;
        if (actionType == "gain-effect" || actionType == "lose-effect") {
            maxImageWidth = 18;
            maxImageHeight = 24;
        }
        // draw icon to canvas
        if (typeof(this.images[iconUrl]) == "undefined") {
            var image = new Image();
            var t = this;
            this.images[iconUrl] = image;
            image.src = iconUrl;
            image._loaded = false;
            image.onload = function() {
                image._loaded = true;
                t._renderTimeline();
            };
            this.canvasContext.fillStyle = "#e7e7e7";
            this.canvasContext.fillRect(
                pixelPosition - (maxImageWidth / 2),
                topPos,
                maxImageWidth,
                maxImageHeight
            );
        }
        if (this.images[iconUrl]._loaded) {
            var iWidth = this.images[iconUrl].width > maxImageWidth ? maxImageWidth : this.images[iconUrl].width;
            var iHeight = this.images[iconUrl].height > maxImageHeight ? maxImageHeight : this.images[iconUrl].height;
            this.canvasContext.drawImage(
                this.images[iconUrl],
                pixelPosition - (iWidth / 2),
                topPos + ((timelineHeight - iHeight) / 2),
                iWidth,
                iHeight
            );
        }
        // draw +/- for gain/lose effect
        this.canvasContext.font = "24px sans-serif";
        this.canvasContext.fillStyle = "#cdff00";
        this.canvasContext.textAlign = "left";        
        this.canvasContext.shadowColor = "#000";
        this.canvasContext.shadowOffsetX = 2;
        this.canvasContext.shadowOffsetY = 2;
        switch (actionType) {
            case "gain-effect":
            {
                this.canvasContext.fillText(
                    "+",
                    pixelPosition - (iWidth / 2) - 4,
                    topPos + ((timelineHeight - 24) / 2) + 8
                );
                break;
            }
            case "lose-effect":
            {
                this.canvasContext.fillText(
                    "-",
                    pixelPosition - (iWidth / 2) - 2,
                    topPos + ((timelineHeight - 24) / 2) + 10
                );
                break;
            }
        }
        this.canvasContext.shadowColor = "";
        this.canvasContext.shadowOffsetX = 0;
        this.canvasContext.shadowOffsetY = 0;
    }

    /**
     * Update element to display timeline action data.
     * @param {DOMNode} element 
     * @param {object} timelineAction 
     */
    _setActionElement(element, timelineAction)
    {
        if (!element) {
            return;
        }
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
        // get status effect data
        if (!actionData && actionId == -2 && actionName) {
            var actionData = this.statusData.getStatusByName(actionName);
        }
        // action vars
        var actionName = actionData ? actionData.name : actionName;
        var actionDescription = actionData && actionData.description.trim() ? actionData.description.trim() : "(no description available)";
        var actionDescriptionElement = null; // optional element to append for action description
        var actionTimestamp = timelineAction.time.getTime() - this.startTime.getTime();
        var actionTimestampDate = new Date(actionTimestamp);
        // find combatant
        var combatant = this._findCombatant([sourceId, sourceName]);
        // add flags as css classes
        if (actionFlags) {
            for (var i in timelineAction.logData[0].flags) {
                element.classList.add("flag-" + timelineAction.logData[0].flags[i]);
            }
        }
        // get icon
        var iconUrl = ""; // default
        if (!combatant || combatant == this.enemyCombatant) {
            iconUrl = "/static/img/enemy.png"; // default npc icon
        }
        if (actionData && actionData.icon) {
            iconUrl = ACTION_DATA_BASE_URL + actionData["icon"];
            if (actionId == -2) {
                iconUrl = STATUS_DATA_BASE_URL + actionData["icon"];
            }
        }
        // sprint icon
        if (actionId == 3) {
            iconUrl = "/static/img/sprint.png";
        }
        // default icon, "attack"
        if (!iconUrl || (combatant && combatant != this.enemyCombatant && actionName == "Attack")) {
            iconUrl = "/static/img/attack.png";
        }
        // special case actions
        switch (actionId)
        {
            // death
            case -1:
            {
                // override vars
                actionName = "Death";
                iconUrl = "/static/img/death.png";
                actionDescription = "";
                // build description elements
                actionDescriptionElement = document.createElement("div");
                var activeEffectsTitleElement = document.createElement("div");
                activeEffectsTitleElement.classList.add("textBold");
                activeEffectsTitleElement.innerText = "Active Effects:";
                actionDescriptionElement.appendChild(activeEffectsTitleElement);
                // list active effects, and collect damages taken
                var activeEffectContainerElement = document.createElement("div");
                activeEffectContainerElement.classList.add("active-effects");
                var activeEffectList = {};
                for (var pass = 0; pass < 2; pass++) {
                    for (var j in this.actionTimeline) {
                        // set action vars
                        var pAction = this.actionTimeline[j];
                        var pActionName = typeof(pAction.logData[0].actionName) != "undefined" ? pAction.logData[0].actionName : "";
                        var pActionType = typeof(pAction.logData[0].actionType) != "undefined" ? pAction.logData[0].actionType : "action";       
                        // ensure timeline action is related to combatant
                        var hasCombatant = false;
                        for (var k in pAction.logData) {
                            if (combatant && combatant.compare(pAction.logData[k].sourceName)) {
                                hasCombatant = true;
                                break;
                            }
                        }
                        if (!hasCombatant) {
                            continue;
                        }
                        // ensure timeline action occurs before death
                        if (pAction.time.getTime() > timelineAction.time.getTime()) {
                            continue;
                        }
                        switch (pass)
                        {
                            // first pass
                            case 0:
                            {
                                // add action to active effect list
                                if (
                                    (pActionType == "gain-effect" || pActionType == "lose-effect") && (
                                        typeof(activeEffectList[pActionName]) == "undefined" || (
                                            activeEffectList[pActionName] && activeEffectList[pActionName].time.getTime() < pAction.time.getTime()
                                        )
                                    )
                                ) {
                                    activeEffectList[pActionName] = pAction;
                                }
                                break;
                            }
                            // second pass
                            case 1:
                            {
                                if (pActionType != "death" || pAction.time.getTime() == timelineAction.time.getTime()) {
                                    break;
                                }
                                for (var k in activeEffectList) {
                                    if (activeEffectList[k] && activeEffectList[k].time.getTime() < pAction.time.getTime()) {
                                        activeEffectList[k] = null;
                                    }
                                }
                                break;
                            }
                        }
                    }
                }
                // display active effects
                for (var j in activeEffectList) {
                    if (!activeEffectList[j] || activeEffectList[j].logData[0].actionType != "gain-effect") {
                        continue;
                    }
                    // create container element
                    var activeEffectElement = document.createElement("div");
                    activeEffectElement.classList.add("active-effect");
                    // icon
                    var activeEffectIconElement = document.createElement("img");
                    activeEffectIconElement.classList.add("action-icon");
                    activeEffectElement.appendChild(activeEffectIconElement);
                    // name
                    var activeEffectNameElement = document.createElement("span");
                    activeEffectNameElement.classList.add("action-name");
                    activeEffectElement.appendChild(activeEffectNameElement);
                    // set elements
                    this._setActionElement(
                        activeEffectElement,
                        activeEffectList[j]
                    );
                    // add
                    activeEffectContainerElement.appendChild(activeEffectElement);
                }
                // add (none) text if no active effect
                if (activeEffectList.length == 0) {
                    activeEffectContainerElement.innerText = "(none)";
                }
                actionDescriptionElement.appendChild(activeEffectContainerElement);

                // show damage taken that lead to the death
                var lastActionsTitleElement = document.createElement("div");
                lastActionsTitleElement.classList.add("textBold");
                lastActionsTitleElement.innerText = "Last Damage Taken:";
                actionDescriptionElement.appendChild(lastActionsTitleElement)
                // itterate timeline to find last damage taken
                var lastDamages = [];
                for (var j in this.actionTimeline) {
                    var action = this.actionTimeline[j];
                    for (var k in action.logData) {
                        if (
                            [MESSAGE_TYPE_SINGLE_TARGET, MESSAGE_TYPE_AOE].indexOf(this.actionTimeline[j].logData[0].type) == -1 ||
                            action.logData[k].targetName != targetName ||
                            action.logData[k].flags.indexOf("damage") == -1 ||
                            action.time.getTime() >= timelineAction.time.getTime()
                        ) {
                            continue;
                        }
                        lastDamages.push(action);
                        break;
                    }
                }
                lastDamages.sort(function(a, b) {
                    return a.time.getTime() - b.time.getTime();
                });
                // create elements for last damages taken
                var lastDamageContainerElement = document.createElement("div");
                lastDamageContainerElement.classList.add("last-damages-taken");
                for (var j = 0; j < 5; j++) {
                    if (typeof(lastDamages[j]) == "undefined") {
                        continue;
                    }
                    var lastDamageElement = document.createElement("div");
                    lastDamageElement.classList.add("last-damage");
                    // icon
                    var lastDamageIconElement = document.createElement("img");
                    lastDamageIconElement.classList.add("action-icon");
                    lastDamageElement.appendChild(lastDamageIconElement)
                    // name
                    var lastDamageNameElement = document.createElement("span");
                    lastDamageNameElement.classList.add("action-name");
                    lastDamageElement.appendChild(lastDamageNameElement);
                    // set element data
                    this._setActionElement(lastDamageElement, lastDamages[j]);
                    // damage
                    var lastDamageDamageElement = document.createElement("span");
                    lastDamageDamageElement.classList.add("action-damage");
                    lastDamageDamageElement.innerText = "n/a"
                    for (var k in lastDamages[j].logData) {
                        var logData = lastDamages[j].logData[k];
                        if (logData.targetName != targetName || typeof(logData.damage) == "undefined") {
                            continue;
                        }
                        lastDamageDamageElement.innerText = logData.damage + 
                            (logData.flags.indexOf("crit") != -1 ? "!" : "") +
                            " / " + logData.targetCurrentHp +
                            " / " + logData.targetMaxHp
                        ;
                        break
                    }
                    lastDamageElement.appendChild(lastDamageDamageElement);
                    lastDamageContainerElement.appendChild(lastDamageElement);                  
                }
                if (lastDamages.length == 0) {
                    lastDamageContainerElement.innerText = "(none)";
                }
                actionDescriptionElement.appendChild(lastDamageContainerElement);
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
                if (actionId == -2) {
                    targetSourceElement.innerText = timelineAction.logData[j].targetName;
                }
                targetElement.appendChild(targetSourceElement);
                // set target name
                var targetNameElement = document.createElement("span");
                targetNameElement.classList.add("action-target-name");
                targetNameElement.innerText = timelineAction.logData[j].targetName;
                if (actionId == -2) {
                    targetNameElement.innerText = timelineAction.logData[j].sourceName;
                }
                targetElement.appendChild(targetNameElement);
                if (!targetNameElement.innerText) {
                    continue;
                }
                // set damage element
                if (timelineAction.logData[j].damage) {
                    var targetDamageElement = document.createElement("span");
                    targetDamageElement.classList.add("action-target-damage");
                    targetDamageElement.innerText = "n/a";
                    if (typeof(timelineAction.logData[j].damage) != "undefined") {
                        targetDamageElement.innerText = timelineAction.logData[j].damage + 
                            (timelineAction.logData[j].flags.indexOf("crit") != -1 ? "!" : "") +
                            " / " + timelineAction.logData[j].targetCurrentHp +
                            " / " + timelineAction.logData[j].targetMaxHp
                        ;
                    }
                    targetElement.appendChild(targetDamageElement);
                }
                // add
                targetElements[i].appendChild(targetElement)
            }
        }

        // set timestamp
        var actionTimestampDisplay = actionTimestampDate.getMinutes() + ":" + 
            (actionTimestampDate.getSeconds() < 10 ? "0" : "") + 
            actionTimestampDate.getSeconds() + "." +
            actionTimestampDate.getMilliseconds()
        ;
        if (actionTimestamp < 0) {
            var actionTimestampSeconds = Math.floor(Math.abs(actionTimestamp) / 1000);
            var actionTimestampMillis = Math.abs(actionTimestamp) % 1000;
            actionTimestampDisplay = "-0:" +
                (actionTimestampSeconds < 10 ? "0" : "") +
                actionTimestampSeconds +
                ":" +
                (actionTimestampMillis < 10 ? "0" : "") +
                (actionTimestampMillis < 100 ? "0" : "") +
                actionTimestampMillis
            ;
        }

        // update plain text elements
        var textElementData = [
            ["action-name", actionName],
            ["action-desc", actionDescription],
            ["action-time", actionTimestampDisplay],
            ["action-flags", actionFlags]
        ];
        for (var i in textElementData) {
            var textElements = element.getElementsByClassName(textElementData[i][0]);
            for (var j = 0; j < textElements.length; j++) {
                textElements[j].innerText = textElementData[i][1];
            }
        }
        // override action description if action description element is provided
        if (actionDescriptionElement) {
            var descContainerElements = element.getElementsByClassName("action-desc");
            for (var j = 0; j < descContainerElements.length; j++) {
                descContainerElements[j].innerHTML = "";
                descContainerElements[j].appendChild(actionDescriptionElement);
            }
        }
    }

    /**
     * Display timeline action overlay from mouseover event.
     * @param {Event} event
     */
    _showOverlay(event)
    {    



        // set elements
        this._setActionElement(this.timelineOverlayElement, timelineAction);
        // find combatant ids
        var combatant = this._findCombatant([timelineAction.logData[0].sourceId, timelineAction.logData[0].sourceName]);
        if (!combatant) {
            return;
        }
        // find other actions
        var otherActionsElement = this.timelineOverlayElement.getElementsByClassName("other-actions")[0];
        otherActionsElement.innerHTML = "";
        var timestamp = timelineAction.time.getTime()
        var hasOtherActions = false;
        for (var i in this.actionTimeline) {
            if (
                (
                    !combatant.compare(this.actionTimeline[i].logData[0].sourceId) &&
                    !combatant.compare(this.actionTimeline[i].logData[0].sourceName)
                ) ||
                Math.abs(timestamp - this.actionTimeline[i].time.getTime()) > 5000
            ) {
                continue;
            }
            // is this the currently selected action?
            var isThisAction = (
                this.actionTimeline[i].time.getTime() == timelineAction.time.getTime() &&
                this.actionTimeline[i].logData[0].actionId == timelineAction.logData[0].actionId
            );
            hasOtherActions = true;
            // create element
            var otherActionElement = document.createElement("div");
            otherActionElement.classList.add("other-action");
            if (isThisAction) {
                otherActionElement.classList.add("this-action");
            }
            var oaTimeElement = document.createElement("span");
            oaTimeElement.classList.add("action-time");
            otherActionElement.appendChild(oaTimeElement);
            var oaIconContainerElement = document.createElement("div");
            oaIconContainerElement.classList.add("action-icon-container");
            var oaIconElement = document.createElement("img");
            oaIconElement.classList.add("action-icon");
            oaIconContainerElement.appendChild(oaIconElement);
            otherActionElement.appendChild(oaIconContainerElement);
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