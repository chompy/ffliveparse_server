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
var TIMELINE_PIXEL_OFFSET = 16;

/**
 * Timeline widget
 */
class WidgetTimelime extends WidgetBase
{

    constructor()
    {
        super();
        this.encounterId = null;
        this.startTime = null;
        this.endTime = null;
        this.combatants = [];
        this.actionTimeline = [];

        this.actionData = null;
        this.actionImages = {};
        this.targetActionTracker = {};
        this.timeKeyContainerElement = null;
        this.lastTimeKey = 0;
        this.timelineElement = document.getElementById(TIMELINE_ELEMENT_ID);
        this.timelineMouseoverElement = document.getElementById(TIMELINE_MOUSEOVER_ELEMENT_ID);
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
        //this.addEventListener("act:combatant", function(e) { t._updateCombatants(e); });
        this.addEventListener("act:logLine", function(e) { t._onLogLine(e); });
        this.addEventListener("combatants-display", function(e) { t._updateCombatants(e); });
        this.addEventListener("action-data-ready", function(e) { t.actionData = e.detail; });
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
        this.actionTimeline = [];
        this.timelineElement.innerHTML = "";
        this.lastTimeKey = 0;
        this.timeKeyContainerElement = document.createElement("div");
        this.timeKeyContainerElement.classList.add("time-key-container");
        this.timelineElement.append(this.timeKeyContainerElement);
        var npcCombatant = {
            "Name" : "Non-Player Combatants",
            "IsNPC" : true,
        }
        this.targetActionTracker = {};
        this.combatants = [
            // add npc combatant
            [
                npcCombatant,
                this._createTimelineElement(npcCombatant)
            ]
        ];
    }

    /**
     * Update encounter data from act:encounter event.
     * @param {Event} event 
     */
    _updateEncounter(event)
    {
        this.encounterId = event.detail.ID;
        // new encounter active
        if (!this.startTime && event.detail.Active) {
            this.reset();
        }
        // inactive
        if (this.startTime && event.detail.StartTime != this.startTime) {
            this.startTime = null;
            this.endTime = event.detail.EndTime;
            return;
        }
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
                if (this.combatants[j][0].Name == combatant[0].Name) {
                    this.combatants[j][0] = combatant[0];
                    this.timelineElement.appendChild(this.combatants[j][1]);
                    isExisting = true;
                    break;
                }
            }
            if (isExisting) {
                continue;
            }
            // new combatant
            var combatantElement = this._createTimelineElement(combatant[0]);
            this.combatants.push([
                combatant[0],       // combatant data
                combatantElement,   // timeline element
            ]);

            // reassign npc actions if needed
            var npcActionElements = this.combatants[0][1].getElementsByClassName("action");
            for (var j = 0; j < npcActionElements.length; j++) {
                var npcActionElement = npcActionElements[j];
                if (npcActionElement.getAttribute("data-combatant") == combatant[0].Name) {
                    logData = {
                        "actionId"          : npcActionElement.getAttribute("data-action-id"),
                        "actionName"        : npcActionElement.getAttribute("data-action-name"),
                        "sourceId"          : npcActionElement.getAttribute("data-combatant-id"),
                        "sourceName"        : npcActionElement.getAttribute("data-combatant-name"),
                        "targetId"          : npcActionElement.getAttribute("data-target-id"),
                        "targetName"        : npcActionElement.getAttribute("data-target-name"),
                        "damage"            : npcActionElement.getAttribute("data-damage"),
                    };
                    this.combatants[0][1].removeChild(npcActionElement);
                }
            }
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
                this._addAction(logLineData, event.detail.Time);
                break;
            }
            case MESSAGE_TYPE_DEATH:
            {
                logLineData["actionId"] = -1;
                logLineData["actionName"] = "Death";
                logLineData["sourceId"] = -1;
                logLineData["targetName"] = logLineData.sourceName;
                logLineData["targetId"] = -1;
                this._addAction(logLineData, event.detail.Time)
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
     */
    _addAction(logData, time)
    {
        if (!time || isNaN(time)) {
            return;
        }
        // find combatant
        var combatant = this.combatants[0];
        for (var i = 0; i < this.combatants.length; i++) {
            if (this.combatants[i][0].Name == logData.sourceName) {
                combatant = this.combatants[i];
                break;
            }
        }
        // add to action timeline
        this.actionTimeline.push({
            "logData"       : logData,
            "time"          : time,
            "combatant"     : combatant
        });

        /*var combatantName = logData.sourceName;
        // get target data
        var targetId = typeof(logData.targetId) != "undefined" ? logData.targetId : -1;
        var targetName = logData.targetName;
        // get action damage
        var damage = typeof(logData.damage) != "undefined" ? logData.damage : 0;
        // fetch action data
        var actionId = logData.actionId;
        var actionData = null;
        var actionName = logData.actionName;
        if (actionId > 0) {
            var actionData = this.actionData.getActionById(actionId)
        }
        // get timestamp for action in current encounter
        var timestamp = time.getTime() - this.startTime.getTime();
        // action takes place after encounter end, do nothing
        if (this.endTime && timestamp > this.endTime.getTime() - this.startTime.getTime()) {
            return;
        }
        // drop if occured more then 10 seconds before pull
        if (timestamp < -10000) {
            return;
        }   
        // calculate action pixel position
        var pixelPosition = parseInt((timestamp * TIMELINE_PIXELS_PER_MILLISECOND));
        // get icon
        var actionIconElement = null;
        var iconUrl = "/static/img/attack.png"; // default
        if (typeof(combatant[0]["IsNPC"]) != undefined && combatant[0]["IsNPC"]) {
            var iconUrl = "/static/img/enemy.png"; // default npc icon
        }
        if (actionData && actionData["icon"]) {
            if (actionData.id in this.actionImages) {
                actionIconElement = this.actionImages[actionData.id];
            }
            iconUrl = ACTION_DATA_BASE_URL + actionData["icon"];
        }
        // override "attack" icon
        if (actionName == "Attack") {
            actionIconElement = null;
            var iconUrl = "/static/img/attack.png";
        // override "death" icon
        } else if (actionId == -1) {
            actionIconElement = null;
            var iconUrl = "/static/img/death.png";
        }
        // create element
        var actionElement = document.createElement("div");
        actionElement.classList.add("action");
        // set proper name
        var actionName = actionData ? actionData["name_en"] : actionName;
        switch (actionId)
        {
            case -1:
            {
                actionName = "Death";
                targetName = combatantName; // target of "death" is actually combatant
                actionElement.classList.add("special");
                break;
            }
        }

        actionElement.setAttribute("data-combatant-id", logData.sourceId);
        actionElement.setAttribute("data-combatant-name", combatantName);
        actionElement.setAttribute("data-action-id", actionId);
        actionElement.setAttribute("data-action-name", actionName);
        actionElement.setAttribute("data-target-id", targetId);
        actionElement.setAttribute("data-target-name", targetName);
        actionElement.setAttribute("data-time", time.getTime());
        actionElement.setAttribute("data-damage", damage);
        if (!actionIconElement) {
            actionIconElement = document.createElement("img");
            actionIconElement.classList.add("icon", "loading");
            actionIconElement.src = iconUrl;
            actionIconElement.alt = name;
            actionIconElement.onload = function() {
                this.classList.remove("loading");
            };
        }
        actionElement.appendChild(actionIconElement);
        var actionNameElement = document.createElement("span");
        actionNameElement.classList.add("name");
        actionNameElement.innerText = name;        
        // set offset relative to time
        actionElement.style.right = pixelPosition + "px";
        // mouse over tooltip
        var t = this;
        actionElement.onmouseenter = function(e) {
            var time = new Date(timestamp);
            t.timelineMouseoverElement.style.display = "block";
            t.timelineMouseoverElement.getElementsByClassName("action-name")[0].innerText = actionName;
            // death specific message, display last actions against combatant
            if (actionId == -1) {
                var desc = "Last 20 targeted actions...\n";
                for (var i = 0; i < t.targetActionTracker[targetName].length; i++) {
                    desc += t.targetActionTracker[targetName][i].actionName + "(" + t.targetActionTracker[targetName][i].damage + ")\n";
                }
                t.timelineMouseoverElement.getElementsByClassName("action-desc")[0].innerText = desc;
            } else {
                t.timelineMouseoverElement.getElementsByClassName("action-desc")[0].innerText = actionData ? actionData["help_en"] : "(no description available)";
            }
            t.timelineMouseoverElement.getElementsByClassName("action-time")[0].innerText = time.getMinutes() + ":" + (time.getSeconds() < 10 ? "0" : "") + time.getSeconds();
            var targetText = targetName;
            if (typeof(combatant[0]["IsNPC"]) != undefined && combatant[0]["IsNPC"]) {
                targetText = combatantName + " > " + targetName;
            }
            t.timelineMouseoverElement.getElementsByClassName("action-target")[0].innerText = targetText;
        };
        actionElement.onmousemove = function(e) {
            t.timelineMouseoverElement.style.left = e.pageX + "px";
            if (e.pageX + t.timelineMouseoverElement.offsetWidth > window.innerWidth) {
                t.timelineMouseoverElement.style.left = (e.pageX - t.timelineMouseoverElement.offsetWidth) + "px";
            }
            t.timelineMouseoverElement.style.top = e.pageY + "px";
        };
        actionElement.onmouseleave = function(e) {
            t.timelineMouseoverElement.style.display = "none";
        };
        // add element
        //combatant[1].appendChild(actionElement);
        // resize all timelines
        /*var longestTimeline = 0;
        for (var i = 0; i < this.combatants.length; i++) {
            if (this.combatants[i][1].offsetWidth > longestTimeline) {
                longestTimeline = this.combatants[i][1].offsetWidth;
            }
        }
        if ((TIMELINE_PIXEL_OFFSET + pixelPosition) > longestTimeline) {
            longestTimeline = (TIMELINE_PIXEL_OFFSET + pixelPosition);
        }
        for (var i = 0; i < this.combatants.length; i++) {
            this.combatants[i][1].style.width = longestTimeline + "px";
        }
        if (this.timeKeyContainerElement) {
            this.timeKeyContainerElement.style.width = longestTimeline + "px";
            // add more time keys
            if (timestamp > this.lastTimeKey) {
                for (var i = this.lastTimeKey; i < parseInt(timestamp / 1000) + 1; i++) {
                    var timeKeyElement = document.createElement("div");
                    timeKeyElement.classList.add("time-key");
                    timeKeyElement.innerText = ((i / 60) < 10 ? "0" : "") + (Math.floor((i / 60)).toFixed(0)) + ":" + ((i % 60) < 10 ? "0" : "") + (i % 60);
                    timeKeyElement.style.right = (parseInt(((i * 1000) * TIMELINE_PIXELS_PER_MILLISECOND))) + "px";
                    this.timeKeyContainerElement.append(timeKeyElement);
                }
                this.lastTimeKey = parseInt(timestamp / 1000) + 1;
            }
        }

        // add 'appear' class to icon to start css3 animation
        setTimeout(
            function() {
                actionIconElement.classList.add("appear");
            },
            100
        );
        // track actions against target
        if (targetName) {
            if (typeof(this.targetActionTracker[targetName]) == "undefined") {
                this.targetActionTracker[targetName] = [];
            }
            this.targetActionTracker[targetName].push(logData);
            if (this.targetActionTracker[targetName].length > 20) {
                this.targetActionTracker[targetName].pop();
            }
        }*/
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
            this.combatants[i][1].style.height = (combatantElements[i].offsetHeight - 1) + "px";
        }        
    }

};