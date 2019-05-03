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

var TIMELINE_PIXELS_PER_MILLISECOND = 0.07; // how many pixels represents a millisecond in timeline
var TIMELINE_PIXEL_OFFSET = TIMELINE_PIXELS_PER_MILLISECOND * 1000;
var GAIN_EFFECT_REGEX = /1A\:([a-zA-Z0-9` ']*) gains the effect of ([a-zA-Z0-9` ']*) from ([a-zA-Z0-9` ']*) for ([0-9]*)\.00 Seconds\./;
var LOSE_EFFECT_REGEX = /1E\:([a-zA-Z0-9` ']*) loses the effect of ([a-zA-Z0-9` ']*) from ([a-zA-Z0-9` ']*)\./;

// define sizes of different elements at different break points
var TIMELINE_BREAKPOINT_FULL = 99999;
var TIMELINE_BREAKPOINT_MOBILE = 768;
var TIMELINE_ELEMENT_SIZES = {
    "key_height" : {
        [TIMELINE_BREAKPOINT_FULL] : 24
    },
    "combatant_height" : {
        [TIMELINE_BREAKPOINT_FULL] : 64
    },
    "combatant_width" : {
        [TIMELINE_BREAKPOINT_FULL] : 256
    },
    "job_icon_width" : {
        [TIMELINE_BREAKPOINT_FULL] : 48
    },
    "job_icon_height" : {
        [TIMELINE_BREAKPOINT_FULL] : 48
    },
    "combatant_name_font" : {
        [TIMELINE_BREAKPOINT_FULL] : 16
    },
    "action_icon_normal_width" : {
        [TIMELINE_BREAKPOINT_FULL] : 40
    },
    "action_icon_normal_height" : {
        [TIMELINE_BREAKPOINT_FULL] : 40
    },
    "action_icon_gain_status_width" : {
        [TIMELINE_BREAKPOINT_FULL] : 24
    },
    "action_icon_gain_status_height" : {
        [TIMELINE_BREAKPOINT_FULL] : 32
    },
    "action_icon_lose_status_width" : {
        [TIMELINE_BREAKPOINT_FULL] : 24
    },
    "action_icon_lose_status_height" : {
        [TIMELINE_BREAKPOINT_FULL] : 32
    },
}

var TIMELINE_KEY_HEIGHT = 24;
var TIMELINE_COMBATANT_HEIGHT =  64;
var TIMELINE_COMBATANT_WIDTH = 256;
var TIMELINE_COMBATANT_JOB_ICON_SIZE = 48;
var TIMELINE_COMBATANT_NAME_SIZE = 16;
var TIMELINE_ROLE_COLORS = {
    "healer"        : ["#2fa35f", "#000"],
    "tank"          : ["#4f59c4", "#fff"],
    "dps"           : ["#723c3a", "#fff"],
    "enemy"         : ["#404040", "#fff"],
    "pet"           : ["#404040", "#fff"]
};
var TIMELINE_ACTION_ICON_SIZES = {
    [ACTION_TYPE_NORMAL]: [40, 40],
    [ACTION_TYPE_GAIN_STATUS_EFFECT]: [24, 32],
    [ACTION_TYPE_LOSE_STATUS_EFFECT]: [24, 32],
    [ACTION_TYPE_DEATH]: [40, 40]
};

class ViewTimeline extends ViewBase
{

    getName()
    {
        return "timeline";
    }

    getTitle()
    {
        return "Timeline"
    }

    init()
    {
        super.init();
        this.encounter = null;
        this.canvasElement = null;
        this.canvasContext = null;
        this.needRedraw = true;
        this.seek = null;
        this.vOffset = 0;
        this.tickTimeout = null;
        this.images = {};
        this.elementSizes = {};
        this.combatants =[];
        this.actionPositions = [];
        this.overlayAction = null;
        this.buildBaseElements();
        this.onResize();
        this.tick();
        
        var t = this;
        // horizontal scrolling
        function hScrollTimeline(e) {
            var delta = Math.max(-1, Math.min(1, (e.wheelDelta || -e.detail)));
            t.addSeek(delta * 800);
        }
        this.canvasElement.addEventListener("mousewheel", hScrollTimeline);
        this.canvasElement.addEventListener("DOMMouseScroll", hScrollTimeline);
        // drag scroll timeline
        this.mouseIsDown = false;
        this.mouseIsDrag = false;
        this.canvasElement.addEventListener("mousedown", function(e) {
            t.mouseIsDown = true;
        });
        this.canvasElement.addEventListener("touchstart", function(e) {
            t.mouseIsDown = true;
        });
        var displayOverlay = function(e) {
            // remove overlay
            if (t.overlayAction) {
                t.overlayAction = null;
                t.redraw();
                return;
            }
            // don't display overlay if mouse is dragging
            if (t.mouseIsDrag) {
                return;
            }
            // show overlay
            var mousePos = t._getCursorPosition(e);
            for (var i in t.actionPositions) {
                var actionPosData = t.actionPositions[i];
                if (
                    mousePos[0] > actionPosData[1] && mousePos[1] > actionPosData[2] &&
                    mousePos[0] < actionPosData[1] + actionPosData[3] &&
                    mousePos[1] < actionPosData[2] + actionPosData[4]
                ) {
                    t.overlayAction = actionPosData[0];
                    t.redraw();
                    break;
                }
            }
        }
        window.addEventListener("mouseup", function(e) {
            t.mouseIsDown = false;
            displayOverlay(e);
            t.mouseIsDrag = false;
        });
        window.addEventListener("touchend", function(e) {
            t.mouseIsDown = false;
            displayOverlay(e);
            t.mouseIsDrag = false;
        });
        var scrollTimeline = function(movement) {
            if (!t.mouseIsDown) {
                return;
            }
            t.overlayAction = null;
            t.mouseIsDrag = true;
            t.addSeek(movement[0] * 15);
            t.vOffset -= movement[1];
            if (t.vOffset < 0) {
                t.vOffset = 0;
            }
        };
        this.canvasElement.addEventListener("mousemove", function(e) {
            scrollTimeline([e.movementX, e.movementY]);
            t.mousePos = [e.x, e.y];
        });
        this.lastTouchPos = null;
        this.canvasElement.addEventListener("touchmove", function(e) {
            if (!t.lastTouchPos) {
                t.lastTouchPos = [e.touches[0].clientX, e.touches[0].clientY];
                return;
            }
            scrollTimeline([e.touches[0].clientX - t.lastTouchPos[0], e.touches[0].clientY - t.lastTouchPos[1]]);
            t.lastTouchPos = null;
        });
    }

    buildBaseElements()
    {
        var element = this.getElement();
        this.canvasElement = document.createElement("canvas");
        this.canvasContext = this.canvasElement.getContext("2d");
        element.appendChild(this.canvasElement);
        
    }

    onResize()
    {
        this.elementSizes = {};
        if (this.canvasElement) {
            this.canvasElement.width = this.getViewWidth();
            this.canvasElement.height = this.getViewHeight();
            this.redraw();
        }
    }

    onCombatant(combatant)
    {
        this.combatants = [];
        this.needRedraw = true;
    }

    onEncounter(encounter)
    {
        this.encounter = encounter;
        this.needRedraw = true;
    }
    
    onLogLine(logLine)
    {
        this.needRedraw = true;
    }

    onActive()
    {
        super.onActive();
        this.tick();
        this.redraw();
    }
    
    tick()
    {
        if (this.tickTimeout) {
            clearTimeout(this.tickTimeout);
        }
        if (!this.active) {
            return;
        }
        if (this.needRedraw) {
            this.redraw();
            this.needRedraw = false;
        }
        var t = this;
        this.tickTimeout = setTimeout(
            function() { t.tick(); },
            250
        );
    }

    redraw()
    {
        this.canvasContext.clearRect(0, 0, this.canvasElement.width, this.canvasElement.height);
        this.drawCombatants();
        this.drawActions();
        this.drawTimeKeys();
        this.drawOverlay();
    }

    drawCombatants()
    {
        // get combatant list
        var combatants = this.getCombatantList();
        // set draw styles
        this.canvasContext.fillStyle = "#fff";
        this.canvasContext.font = TIMELINE_COMBATANT_NAME_SIZE + "px sans-serif";
        this.canvasContext.textAlign = "left";
        var combatantCount = -1;
        for (var i = 0; i < combatants.length; i++) {
            var combatant = combatants[i];
            if (combatant.isEnemy() || !combatant.data.Job) {
                continue;
            }
            combatantCount++;
            // draw role bg color
            this.canvasContext.fillStyle = TIMELINE_ROLE_COLORS[combatant.getRole()][0];
            this.canvasContext.fillRect(
                0,
                this._ES("key_height") + (combatantCount * this._ES("combatant_height")) - this.vOffset,
                this._ES("combatant_width"),
                this._ES("combatant_height")
            );
            // draw role icon
            var jobIconSrc = "/static/img/job/" + combatant.data.Job.toLowerCase() + ".png";
            if (combatant.data.Job == "enemy") {
                var jobIconSrc = "/static/img/enemy.png";
            }
            this.drawImage(
                jobIconSrc,
                16,
                this._ES("key_height") + ((combatantCount + 1) * this._ES("combatant_height")) - ((this._ES("combatant_height") + this._ES("job_icon_width")) / 2) - this.vOffset,
                this._ES("job_icon_width"),
                this._ES("job_icon_height")
            );
            // draw role name
            this.canvasContext.fillStyle = TIMELINE_ROLE_COLORS[combatant.getRole()][1];
            this.canvasContext.fillText(
                combatant.getDisplayName(),
                this._ES("job_icon_width") + 24,
                this._ES("key_height") + ((combatantCount + 1) * this._ES("combatant_height")) - 
                    ((this._ES("combatant_height") + this._ES("combatant_name_font")) / 2) + 
                    this._ES("combatant_name_font") - this.vOffset
            );

            // draw seperator line
            this.canvasContext.fillStyle = "#fff";
            this.canvasContext.fillRect(
                0,
                this._ES("key_height") + (combatantCount * this._ES("combatant_height") - 1) - this.vOffset,
                this.getViewWidth(),
                1
            );
            this.canvasContext.fillRect(
                0,
                this._ES("key_height") + ((combatantCount + 1) * this._ES("combatant_height") - 1) - this.vOffset,
                this.getViewWidth(),
                1
            );
        }
        // draw vertical seperator
        this.canvasContext.fillRect(
            this._ES("combatant_width"), 0, 1, this.getViewHeight()
        );
    }
    
    /**
     * Draw timestamps.
     */
    drawTimeKeys()
    {
        if (!this.encounter) {
            return;
        }
        // get time to draw from
        var drawTime = this.encounter.getEndTime();
        if (this.seek) {
            drawTime = this.seek;
        }
        // draw background
        this.canvasContext.fillStyle = "#404040";
        this.canvasContext.fillRect(
            0, 0, this.getViewWidth(), this._ES("key_height")
        );
        // draw line
        this.canvasContext.fillStyle = "#fff";
        this.canvasContext.fillRect(
            0, this._ES("key_height") - 1, this.getViewWidth(), 1
        );
        // draw times
        this.canvasContext.font = "14px sans-serif";
        this.canvasContext.textAlign = "center";
        var duration = drawTime.getTime() - this.encounter.data.StartTime.getTime();
        var offset = (duration % 1000) * TIMELINE_PIXELS_PER_MILLISECOND;
        for (var i = 0; i < 99; i++) {
            // draw text
            var seconds = parseInt(duration / 1000) - i;
            if (seconds < 0) {
                break;
            }
            var timeKeyText = ((seconds / 60) < 10 ? "0" : "") + (Math.floor((seconds / 60)).toFixed(0)) + ":" + ((seconds % 60) < 10 ? "0" : "") + (seconds % 60);
            var position = parseInt((i * 1000) * TIMELINE_PIXELS_PER_MILLISECOND) + offset;
            if (position > this.getViewWidth() - this._ES("combatant_width")) {
                break;
            }
            this.canvasContext.fillText(
                timeKeyText,
                position + this._ES("combatant_width"),
                this._ES("key_height") - 8
            );
            // draw vertical grid line
            this.canvasContext.fillRect(position + this._ES("combatant_width"), 25, 1, this.getViewHeight());
        }
    }

    /**
     * Draw actions in current timeline viewport.
     */
    drawActions()
    {
        if (!this.encounter || !this.actionData) {
            return;
        }
        // get end time to draw from
        var drawEndTime = this.encounter.getEndTime();
        if (this.seek) {
            drawEndTime = this.seek;
        }    
        // get start time to draw from
        var drawDuration = Math.ceil((this.getViewWidth() - this._ES("combatant_width")) / TIMELINE_PIXELS_PER_MILLISECOND);
        var drawStartTime = new Date(drawEndTime.getTime() - drawDuration);
        // get actions in time frame
        var actions = this.actionCollector.findInDateRange(
            drawStartTime,
            drawEndTime
        );
        // itterate and draw actions
        this.actionPositions = [];
        for (var i in actions) {
            var action = actions[i];
            var actionDrawData = this.getActionDrawData(action);
            if (!actionDrawData || !action || !action.type) {
                continue;
            }
            // calculate position/size
            var w = TIMELINE_ACTION_ICON_SIZES[action.type][0];
            var h = TIMELINE_ACTION_ICON_SIZES[action.type][1];
            var x = TIMELINE_COMBATANT_WIDTH + parseInt((drawEndTime.getTime() - action.time.getTime()) * TIMELINE_PIXELS_PER_MILLISECOND);
            var y = TIMELINE_KEY_HEIGHT + (actionDrawData.vindex * TIMELINE_COMBATANT_HEIGHT) + ((TIMELINE_COMBATANT_HEIGHT - h) / 2);
            this.drawImage(
                actionDrawData.icon,
                x,
                y - this.vOffset,
                w,
                h
            );

            // draw +/- for buffs/debuffs
            if (action.type == ACTION_TYPE_GAIN_STATUS_EFFECT || action.type == ACTION_TYPE_LOSE_STATUS_EFFECT) {
                this.canvasContext.font = "20px sans-serif";
                this.canvasContext.textAlign = "center";
                this.canvasContext.fillStyle = "#6def11";
                var buffText = "+";
                if (action.type == ACTION_TYPE_LOSE_STATUS_EFFECT) {
                    buffText = "-";
                }
                this.canvasContext.fillText(
                    buffText, x, y - this.vOffset
                );
            }

            // record action positions for click overlay
            this.actionPositions.push([action, x, y - this.vOffset, w, h]);
        }
    }

    /**
     * Draw image to canvas.
     * @param {string} src 
     * @param {integer} x 
     * @param {integer} y 
     * @param {integer} w
     * @param {integer} h
     */
    drawImage(src, x, y, w, h)
    {
        // not yet loaded
        if (typeof(this.images[src]) == "undefined") {
            var image = new Image();
            this.images[src] = image;
            image.src = src;
            image._loaded = false;
            var t = this;
            image.onload = function() {
                image._loaded = true;
                t.needRedraw = true;
            };
            this.canvasContext.fillStyle = "#e7e7e7";
            this.canvasContext.fillRect(x, y, w, h);

            return;
        }
        // loaded, draw
        this.canvasContext.drawImage(
            this.images[src],
            x, y, w, h
        );
    }

    /**
     * Draw overlay with details about an action.
     */
    drawOverlay()
    {
        if (!this.overlayAction) {
            return;
        }
        this.canvasContext.fillStyle = "rgba(0,0,0,.75)";
        this.canvasContext.fillRect(0, 0, 500, 500);
    }

    /**
     * Get list of combatants.
     * @return {array}
     */
    getCombatantList()
    {
        if (this.combatants && this.combatants.length > 0) {
            return this.combatants;
        }
        this.combatants = [];
        // enemy combatant
        this.combatants.push(new Combatant());
        this.combatants[0].data = {
            "Job"       : "enemy",
            "Name"      : "Enemy Combatant(s)"
        }
        // get combatant list
        var fetchedCombatants = this.combatantCollector.getSortedCombatants("role");
        for (var i in fetchedCombatants) {
            if (!fetchedCombatants[i].isEnemy() && fetchedCombatants[i].data.Job) {
                this.combatants.push(fetchedCombatants[i]);
            }
        }
        return this.combatants;
    }

    /**
     * Get data needed to draw action.
     * @param {Action} action 
     * @return {object}
     */
    getActionDrawData(action)
    {
        // find combatant
        var combatants = this.getCombatantList();
        var combatant = null;
        switch (action.type) {
            case ACTION_TYPE_GAIN_STATUS_EFFECT:
            case ACTION_TYPE_LOSE_STATUS_EFFECT:
            {
                combatant = action.targetCombatant;
                break;
            }
            default:
            {
                combatant = action.sourceCombatant;
                break;
            }
        }
        if (combatants.indexOf(combatant) == -1) {
            combatant = combatants[0];
        }
        // get vertical index
        var vIndex = combatants.indexOf(combatant);
        if (vIndex == -1) {
            return null;
        }
        // get action data
        var actionData = null;
        switch (action.type) {
            case ACTION_TYPE_NORMAL:
            {
                actionData = this.actionData.getActionById(action.data.actionId);
                break;
            }
            case ACTION_TYPE_GAIN_STATUS_EFFECT:
            case ACTION_TYPE_LOSE_STATUS_EFFECT:
            {
                actionData = this.statusData.getStatusByName(action.data.actionName);
                break;
            }
        }
        // get icon image
        var actionImageSrc = "";
        if (!actionData && action.type == ACTION_TYPE_DEATH) {
            actionImageSrc = "/static/img/death.png";
        } else if (!actionData && combatant.isEnemy()) {
            actionImageSrc = "/static/img/enemy.png";
        } else if (actionData && actionData.name == "Attack") {
            actionImageSrc = "/static/img/attack.png";
        } else if (actionData && actionData.icon) {
            actionImageSrc = ACTION_DATA_BASE_URL + actionData.icon;
            if ([ACTION_TYPE_GAIN_STATUS_EFFECT, ACTION_TYPE_LOSE_STATUS_EFFECT].indexOf(action.type) != -1) {
                actionImageSrc = STATUS_DATA_BASE_URL + actionData.icon;
            }
        }
        return {
            "combatant"         : combatant,
            "data"              : actionData,
            "icon"              : actionImageSrc,
            "vindex"            : vIndex
        };
    }

    addSeek(offset)
    {
        var currentSeekTime = this.encounter.getEndTime();
        if (this.seek) {
            currentSeekTime = this.seek;
        }
        this.seek = new Date(currentSeekTime.getTime() + offset);
        this.redraw();
    }

    /**
     * Fetch an element size for a given key.
     * @param {string} key 
     * @return {integer}
     */
    getElementSize(key)
    {
        // already retrieved
        if (key in this.elementSizes) {
            return this.elementSizes[key];
        }
        // retrieve and determine best breakpoint
        if (key in TIMELINE_ELEMENT_SIZES) {
            var currentCanvasWidth = this.getViewWidth();
            var elementSizes = TIMELINE_ELEMENT_SIZES[key];
            var bestBreakpoint = null;
            for (var breakpoint in elementSizes) {
                if (
                    currentCanvasWidth <= breakpoint && 
                    (!bestBreakpoint || breakpoint > bestBreakpoint)
                ) {
                    bestBreakpoint = breakpoint;
                }
            }
            if (bestBreakpoint) {
                this.elementSizes[key] = elementSizes[bestBreakpoint];
                return this.elementSizes[key];
            }
        }
        // key not found
        return 0;
    }

    /**
     * Short hand for getElementSize
     * @param {string} key 
     * @return {integer}
     */
    _ES(key)
    {
        return this.getElementSize(key)
    }


    /**
     * Get cursor position relative to canvas.
     * @param {Event} event 
     * @see https://stackoverflow.com/a/18053642
     */
    _getCursorPosition(event) {
        var rect = this.canvasElement.getBoundingClientRect();
        var x = event.clientX - rect.left;
        var y = event.clientY - rect.top;
        return [parseInt(x), parseInt(y)];
    }

}