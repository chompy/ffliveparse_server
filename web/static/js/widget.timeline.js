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
var TIMELINE_ACTION_USE_REGEX = /1[56]\:[0-9A-F]{8}\:([a-zA-Z`'\- ]*)\:[0-9A-F]{2,4}\:([a-zA-Z`'\- ]*)\:[0-9A-F]{8}\:([a-zA-Z`'\- ]*)\:/;
var TIMELINE_DEATH_REGEX = /19\:([a-zA-Z`'\- ]*) was defeated by ([a-zA-Z`'\- ]*)\./;

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
        this.actionData = null;
        this.actionImages = {};
        this.queueActions = [];
        this.targetActionTracker = {};
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
        this.addEventListener("action-data-ready", function(e) { t.actionData = e.detail; t._addQueuedActions(); });
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
        this.timelineElement.innerHTML = "";
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
            this.queueActions = [];
            return;
        }
        this.startTime = event.detail.StartTime;
        this.endTime = event.detail.EndTime;
        this._addQueuedActions();
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
                    this.queueActions.push({
                        "combatant" :        combatant[0].Name,
                        "action"    :        npcActionElement.getAttribute("data-name"),
                        "time"      :        new Date(parseInt(npcActionElement.getAttribute("data-time"))),
                        "target"    :        npcActionElement.getAttribute("data-target"),
                    });
                    this.combatants[0][1].removeChild(npcActionElement);
                }
            }
            this._onWindowResize();
        }
        this._addQueuedActions();
    }

    /**
     * Queue up action recieved from "act:logline" event.
     * @param {Event} event 
     */
    _onLogLine(event)
    {
        // check for skill usage in log
        var regexRes = TIMELINE_ACTION_USE_REGEX.exec(event.detail.LogLine);
        if (!regexRes) {
            // check for death
            regexRes = TIMELINE_DEATH_REGEX.exec(event.detail.LogLine);
            if (!regexRes) {
                return;
            }
            this.queueActions.push({
                "combatant" :        regexRes[1],
                "action"    :        "_death",
                "time"      :        event.detail.Time,
                "target"    :        regexRes[2],
            });
            this._addQueuedActions();
            return;
        }
        this.queueActions.push({
            "combatant" :        regexRes[1],
            "action"    :        regexRes[2],
            "time"      :        event.detail.Time,
            "target"    :        regexRes[3],
        });
        this._addQueuedActions();
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
     * Add action to given combatants timeline.
     * @param {array} combatant
     * @param {string} name
     * @param {Date} time
     * @param {string} combatantName Override combatant name for NPCs
     */
    _addAction(combatant, name, time, target, combatantName)
    {
        if (!time || isNaN(time)) {
            return;
        }
        var combatant = combatant;
        var target = target;
        // fetch action data
        var thisActionData = this.actionData.getActionByName(name);
        // get timestamp for action in current encounter
        var timestamp = time.getTime() - this.startTime.getTime();
        // action takes place after encounter end, do nothing
        if (this.endTime && timestamp > this.endTime.getTime() - this.startTime.getTime()) {
            return;
        }
        // drop if occured more then 10 seconds before pull
        if (timestamp < -10) {
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
        if (thisActionData && thisActionData["icon"]) {
            if (thisActionData.id in this.actionImages) {
                actionIconElement = this.actionImages[thisActionData.id];
            }
            iconUrl = ACTION_DATA_BASE_URL + thisActionData["icon"];
        }
        // override "attack" icon
        if (thisActionData && thisActionData["id"] == "7") {
            actionIconElement = null;
            var iconUrl = "/static/img/attack.png";
        // override "death" icon
        } else if (name == "_death") {
            actionIconElement = null;
            var iconUrl = "/static/img/death.png";
        }

        // set proper name
        var name = thisActionData ? thisActionData["name_en"] : name;
        if (name == "_death") {
            name = "Death";
            target = combatantName; // target of "death" is actually combatant
        }
        // create element
        var actionElement = document.createElement("div");
        actionElement.classList.add("action");
        if (name == "Death") {
            actionElement.classList.add("special");
        }
        actionElement.setAttribute("data-combatant", typeof(combatantName) != "undefined" ? combatantName : combatant[0].Name);
        actionElement.setAttribute("data-name", name);
        actionElement.setAttribute("data-target", target);
        actionElement.setAttribute("data-time", time.getTime());
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
            t.timelineMouseoverElement.getElementsByClassName("action-name")[0].innerText = name;
            // death specific message, display last three damage sources
            if (name == "Death") {
                var desc = "Last three damage sources...\n";
                for (var i = 0; i < t.targetActionTracker[target].length; i++) {
                    desc += t.targetActionTracker[target][i];
                    if (i < t.targetActionTracker[target].length - 1) {
                        desc += " > ";
                    }
                }
                t.timelineMouseoverElement.getElementsByClassName("action-desc")[0].innerText = desc;
            } else {
                t.timelineMouseoverElement.getElementsByClassName("action-desc")[0].innerText = thisActionData ? thisActionData["help_en"] : "(no description available)";
            }
            t.timelineMouseoverElement.getElementsByClassName("action-time")[0].innerText = time.getMinutes() + ":" + (time.getSeconds() < 10 ? "0" : "") + time.getSeconds();
            t.timelineMouseoverElement.getElementsByClassName("action-target")[0].innerText = target;
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
        combatant[1].appendChild(actionElement);
        // resize all timelines
        var longestTimeline = 0;
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
        // add 'appear' class to icon to start css3 animation
        setTimeout(
            function() {
                actionIconElement.classList.add("appear");
            },
            100
        );
        // track last three actions against target
        if (typeof(this.targetActionTracker[target]) == "undefined") {
            this.targetActionTracker[target] = [];
        }
        this.targetActionTracker[target].push(name);
        if (this.targetActionTracker[target].length > 3) {
            this.targetActionTracker[target].pop();
        }
    }

    /**
     * Add actions that have been queued up.
     */
    _addQueuedActions()
    {
        if (!this.queueActions || this.combatants.length <= 1 || !this.startTime || !this.actionData) {
            return;
        }
        // itterate queue items
        for (var i = 0; i < this.queueActions.length; i++) {
            // find combatant
            var foundCombatant = false;
            for (var j = 0; j < this.combatants.length; j++) {
                var combatant = this.combatants[j];
                if (combatant[0].Name.toLowerCase() == this.queueActions[i]["combatant"].toLowerCase()) {
                    // add action
                    this._addAction(
                        combatant,
                        this.queueActions[i]["action"],
                        this.queueActions[i]["time"],
                        this.queueActions[i]["target"]
                    );
                    foundCombatant = true;
                    break;
                }
            }
            // use npc combatant
            if (!foundCombatant) {
                this._addAction(
                    this.combatants[0],
                    this.queueActions[i]["action"],
                    this.queueActions[i]["time"],
                    this.queueActions[i]["target"],
                    this.queueActions[i]["combatant"]
                );
            }
        }
        this.queueActions = [];        
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